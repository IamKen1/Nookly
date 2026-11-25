import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";
import { hasFeature, getTenantPlanCode, upgradeMessage } from "@/lib/plan-gating";
import { ensureDefaultDiscounts, serializeDiscount } from "@/lib/discounts";
import { parseDiscountBody } from "@/lib/discount-input";
import { discountRateText } from "@/lib/discount-math";
import { cleanPricingState, describePricingChange, getPricingState, pricingColumns, sameWhen, savePricingState, stateFromJson, type PricingState } from "@/lib/pricing-settings";

// Changes the receipt designer applies to the POS itself (what customers are
// charged): cash rounding, the owner's price formula, and discount terms.
// Each is recorded so it can be undone. Owner only, with the designer's plan.

type DiscountTermsSnap = { kind: string; value: number; maxAmount: number | null; vatExempt: boolean };

async function authorize(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "OWNER") return { response: NextResponse.json({ error: "Only the owner can change what the POS charges." }, { status: 403 }) };
  if (!(await hasFeature(await getTenantPlanCode(session.tenantId), "receiptDesigner")))
    return { response: NextResponse.json({ error: upgradeMessage("receiptDesigner") }, { status: 403 }) };
  return { session };
}

// Field by field: the database stores JSON with its keys in its own order.
const samePricing = (a: PricingState, b: unknown) => {
  const o = stateFromJson(b);
  return (
    (a.roundingStep ?? null) === o.roundingStep && a.ruleEnabled === o.ruleEnabled && a.ruleLabel === o.ruleLabel && a.ruleExpr === o.ruleExpr && sameWhen(a.ruleWhen, o.ruleWhen)
  );
};
const sameDiscount = (a: DiscountTermsSnap, b: unknown) => {
  const o = (b ?? {}) as Partial<DiscountTermsSnap>;
  return a.kind === o.kind && a.value === o.value && (a.maxAmount ?? null) === (o.maxAmount ?? null) && a.vatExempt === o.vatExempt;
};

const snapDiscount = (d: { kind: string; value: Prisma.Decimal | number; maxAmount: Prisma.Decimal | number | null; vatExempt: boolean }): DiscountTermsSnap => ({
  kind: d.kind,
  value: Number(d.value),
  maxAmount: d.maxAmount != null ? Number(d.maxAmount) : null,
  vatExempt: d.vatExempt,
});
const describeDiscount = (name: string, a: DiscountTermsSnap, b: DiscountTermsSnap) => {
  const rate = (s: DiscountTermsSnap) => `${discountRateText(s)}${s.vatExempt ? ", VAT removed first" : ""}`;
  return `Discount "${name}": ${rate(a)} → ${rate(b)}`;
};

async function state(tenantId: string) {
  await ensureDefaultDiscounts(tenantId);
  const [pricing, discounts, history] = await Promise.all([
    getPricingState(tenantId),
    prisma.discount.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.posChange.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    pricing,
    discounts: discounts.map(serializeDiscount),
    history: history.map((h) => ({ id: h.id, kind: h.kind, summary: h.summary, createdAt: h.createdAt, undoneAt: h.undoneAt })),
  };
}

export async function GET(request: NextRequest) {
  const { session, response } = await authorize(request);
  if (!session) return response;
  return NextResponse.json(await state(session.tenantId));
}

export async function POST(request: NextRequest) {
  const { session, response } = await authorize(request);
  if (!session) return response;
  const tenantId = session.tenantId;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

  if (body.action === "pricing") {
    const before = await getPricingState(tenantId);
    const cleaned = cleanPricingState(body as Partial<PricingState>, before);
    if ("error" in cleaned) return bad(cleaned.error);
    const after = cleaned.state;
    const summary = describePricingChange(before, after);
    if (summary === "No change") return NextResponse.json(await state(tenantId));
    await savePricingState(tenantId, after);
    await prisma.posChange.create({
      data: { tenantId, kind: "PRICING", summary, before: before as unknown as Prisma.InputJsonValue, after: after as unknown as Prisma.InputJsonValue, userId: session.userId },
    });
    return NextResponse.json(await state(tenantId));
  }

  if (body.action === "discount") {
    const existing = await prisma.discount.findFirst({ where: { id: String(body.id ?? ""), tenantId } });
    if (!existing) return bad("Discount not found.", 404);
    if (existing.isSystem) return bad("Senior citizen and PWD discounts are set by law (20%, VAT-exempt) and can't be changed.");
    // Only the terms that change the computation; everything else stays as set in Settings › Discounts.
    const parsed = await parseDiscountBody(tenantId, {
      name: existing.name,
      kind: body.kind ?? existing.kind,
      value: body.value ?? Number(existing.value),
      maxAmount: body.maxAmount !== undefined ? body.maxAmount : existing.maxAmount != null ? Number(existing.maxAmount) : null,
      vatExempt: body.vatExempt ?? existing.vatExempt,
      asksForId: existing.asksForId,
      isActive: existing.isActive,
      startsOn: existing.startsOn ? existing.startsOn.toISOString().slice(0, 10) : null,
      endsOn: existing.endsOn ? existing.endsOn.toISOString().slice(0, 10) : null,
      storeIds: existing.storeIds,
    });
    if ("error" in parsed) return bad(parsed.error!);
    const before = snapDiscount(existing);
    const after = snapDiscount({ kind: parsed.data.kind, value: parsed.data.value, maxAmount: parsed.data.maxAmount, vatExempt: parsed.data.vatExempt });
    if (sameDiscount(before, after)) return NextResponse.json(await state(tenantId));
    await prisma.$transaction([
      prisma.discount.update({ where: { id: existing.id }, data: { kind: after.kind, value: after.value, maxAmount: after.maxAmount, vatExempt: after.vatExempt } }),
      prisma.posChange.create({
        data: { tenantId, kind: "DISCOUNT", targetId: existing.id, summary: describeDiscount(existing.name, before, after), before, after, userId: session.userId },
      }),
    ]);
    return NextResponse.json(await state(tenantId));
  }

  if (body.action === "undo") {
    const change = await prisma.posChange.findFirst({ where: { id: String(body.changeId ?? ""), tenantId } });
    if (!change) return bad("That change wasn't found.", 404);
    if (change.undoneAt) return bad("That change was already undone.");
    // Only when nothing changed since, so an undo never wipes out a newer change.
    if (change.kind === "PRICING") {
      const current = await getPricingState(tenantId);
      if (!samePricing(current, change.after)) return bad("Something changed after this. Undo the newer change first.");
      await prisma.$transaction(async (tx) => {
        const b = stateFromJson(change.before);
        await tx.pricingSettings.upsert({ where: { tenantId }, create: { tenantId, ...pricingColumns(b) }, update: pricingColumns(b) });
        await tx.posChange.update({ where: { id: change.id }, data: { undoneAt: new Date(), undoneById: session.userId } });
      });
    } else {
      const d = await prisma.discount.findFirst({ where: { id: change.targetId ?? "", tenantId } });
      if (!d) return bad("That discount no longer exists.");
      if (!sameDiscount(snapDiscount(d), change.after)) return bad("This discount changed after this. Undo the newer change first.");
      const b = change.before as unknown as DiscountTermsSnap;
      await prisma.$transaction([
        prisma.discount.update({ where: { id: d.id }, data: { kind: b.kind, value: b.value, maxAmount: b.maxAmount, vatExempt: b.vatExempt } }),
        prisma.posChange.update({ where: { id: change.id }, data: { undoneAt: new Date(), undoneById: session.userId } }),
      ]);
    }
    return NextResponse.json(await state(tenantId));
  }

  return bad("Unknown action.");
}
