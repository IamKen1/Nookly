import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { getSubscriptionWithPlan } from "@/lib/request-cache";
import { upgradeMessage } from "@/lib/plan-gating";
import { getReceiptSettings } from "@/lib/receipt-settings";
import { sanitizeTemplate, designWarnings } from "@/lib/receipt-designer/validate";
import type { Template } from "@/lib/receipt-designer/types";

// Settings › Receipt designer. Owner only, and only when the plan includes it.
async function gate(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "OWNER") return { error: NextResponse.json({ error: "Only the owner can design receipts." }, { status: 403 }) };
  const subscription = await getSubscriptionWithPlan(session.tenantId);
  return { session, planHasIt: Boolean(subscription?.plan.featureReceiptDesigner) };
}

const fromRow = (row: { version: number; paperWidth: number; printMode: string; theme: unknown; blocks: unknown }) =>
  sanitizeTemplate({ version: row.version, paperWidth: row.paperWidth, printMode: row.printMode, theme: row.theme, blocks: row.blocks }).template;

export async function GET(request: NextRequest) {
  const g = await gate(request);
  if (g.error) return g.error;
  if (!g.planHasIt) return NextResponse.json({ planHasIt: false });

  const [row, settings, branches, versions] = await Promise.all([
    prisma.receiptTemplate.findUnique({ where: { tenantId: g.session.tenantId } }),
    getReceiptSettings(g.session.tenantId),
    prisma.store.findMany({ where: { tenantId: g.session.tenantId, isActive: true }, orderBy: [{ isMainBranch: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.receiptTemplateVersion.findMany({
      where: { tenantId: g.session.tenantId },
      orderBy: { publishedAt: "desc" },
      take: VERSIONS_KEPT,
      select: { id: true, publishedAt: true, publishedByUserId: true, paperWidth: true, printMode: true, blocks: true },
    }),
  ]);
  const people = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(versions.map((v) => v.publishedByUserId).filter((x): x is string => Boolean(x)))] } },
        select: { id: true, firstName: true, lastName: true },
      })
    ).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])
  );
  const published = row && Array.isArray(row.blocks) && row.blocks.length > 0 ? fromRow(row) : null;
  const draft =
    row?.draftBlocks != null
      ? fromRow({
          version: row.version,
          paperWidth: row.draftPaperWidth ?? row.paperWidth,
          printMode: row.draftPrintMode ?? row.printMode,
          theme: row.draftTheme ?? row.theme,
          blocks: row.draftBlocks,
        })
      : null;

  return NextResponse.json({
    planHasIt: true,
    enabled: Boolean(row?.enabled),
    published,
    draft,
    settings,
    branches,
    versions: versions.map((v) => ({
      id: v.id,
      publishedAt: v.publishedAt,
      publishedBy: v.publishedByUserId ? people.get(v.publishedByUserId) ?? null : null,
      paperWidth: v.paperWidth,
      printMode: v.printMode,
      blockCount: Array.isArray(v.blocks) ? v.blocks.length : 0,
    })),
    updatedAt: row?.updatedAt ?? null,
  });
}

// How many past designs are kept for "Version history".
const VERSIONS_KEPT = 30;

type Body =
  | { action: "saveDraft"; template: unknown }
  | { action: "publish"; template: unknown }
  | { action: "revert" }
  | { action: "discardDraft" }
  | { action: "setLogo"; logoUrl: string | null };

export async function PUT(request: NextRequest) {
  const g = await gate(request);
  if (g.error) return g.error;
  if (!g.planHasIt) return NextResponse.json({ error: upgradeMessage("receiptDesigner") }, { status: 403 });
  const tenantId = g.session.tenantId;
  const userId = g.session.userId;

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const json = (t: Template) => ({
    theme: t.theme as unknown as Prisma.InputJsonValue,
    blocks: t.blocks as unknown as Prisma.InputJsonValue,
  });

  switch (body.action) {
    case "saveDraft": {
      // Drafts are kept even with errors, so work isn't lost; publishing checks them.
      const { template, errors } = sanitizeTemplate(body.template);
      const { theme, blocks } = json(template);
      await prisma.receiptTemplate.upsert({
        where: { tenantId },
        update: { draftBlocks: blocks, draftTheme: theme, draftPaperWidth: template.paperWidth, draftPrintMode: template.printMode, updatedByUserId: userId },
        create: { tenantId, draftBlocks: blocks, draftTheme: theme, draftPaperWidth: template.paperWidth, draftPrintMode: template.printMode, updatedByUserId: userId },
      });
      return NextResponse.json({ ok: true, errors, warnings: designWarnings(template) });
    }

    case "publish": {
      const { template, errors } = sanitizeTemplate(body.template);
      if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });
      if (template.blocks.length === 0) return NextResponse.json({ error: "Add at least one block first." }, { status: 400 });
      const { theme, blocks } = json(template);
      // Publishing also clears the draft: what's printed is now what was being edited.
      const data = {
        enabled: true,
        paperWidth: template.paperWidth,
        printMode: template.printMode,
        theme,
        blocks,
        version: template.version,
        draftBlocks: Prisma.DbNull,
        draftTheme: Prisma.DbNull,
        draftPaperWidth: null,
        draftPrintMode: null,
        updatedByUserId: userId,
      };
      await prisma.$transaction(async (tx) => {
        await tx.receiptTemplate.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
        // Keep this design in Version history, and only the newest few.
        await tx.receiptTemplateVersion.create({
          data: { tenantId, paperWidth: template.paperWidth, printMode: template.printMode, theme, blocks, version: template.version, publishedByUserId: userId },
        });
        const old = await tx.receiptTemplateVersion.findMany({
          where: { tenantId },
          orderBy: { publishedAt: "desc" },
          skip: VERSIONS_KEPT,
          select: { id: true },
        });
        if (old.length) await tx.receiptTemplateVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      });
      return NextResponse.json({ ok: true, enabled: true, warnings: designWarnings(template) });
    }

    case "revert":
      // Back to the standard receipt; the design is kept for later.
      await prisma.receiptTemplate.updateMany({ where: { tenantId }, data: { enabled: false, updatedByUserId: userId } });
      return NextResponse.json({ ok: true, enabled: false });

    case "discardDraft":
      await prisma.receiptTemplate.updateMany({
        where: { tenantId },
        data: { draftBlocks: Prisma.DbNull, draftTheme: Prisma.DbNull, draftPaperWidth: null, draftPrintMode: null },
      });
      return NextResponse.json({ ok: true });

    case "setLogo": {
      // Only an image this workspace uploaded (see /api/upload, folder "receipt").
      const url = body.logoUrl;
      if (url !== null && (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !url.includes(`/nookly/${tenantId}/receipt/`))) {
        return NextResponse.json({ error: "Upload the logo first." }, { status: 400 });
      }
      await getReceiptSettings(tenantId); // makes sure the row exists
      await prisma.receiptSettings.update({ where: { tenantId }, data: { logoUrl: url } });
      return NextResponse.json({ ok: true, logoUrl: url });
    }

    default:
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
