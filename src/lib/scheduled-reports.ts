import { prisma } from "@/lib/prisma";
import { hasFeature, type PlanCode } from "@/lib/plan-gating";
import { getNotificationSettings, getAlertRecipients } from "@/lib/notification-settings";
import { sendAlertEmail } from "@/lib/email";
import { generateSalesDashboardReport } from "@/lib/reporting";
import { peso } from "@/lib/format";

type ReportKind = "END_OF_DAY" | "MONTHLY_SUMMARY";

const getLocalDateStr = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

const buildSummaryEmail = (tenantName: string, kind: ReportKind, report: Awaited<ReturnType<typeof generateSalesDashboardReport>>) => {
  const period = kind === "END_OF_DAY" ? report.overview.daily : report.overview.monthly;
  const subject = `[Nookly] ${kind === "END_OF_DAY" ? "End of day" : "Monthly"} summary — ${tenantName}`;
  const text = [
    `${period.label}`,
    `Sales: ${period.salesCount}`,
    `Gross sales: ${peso(period.grossSales)}`,
    `Net sales: ${peso(period.netSales)}`,
    `Average sale: ${peso(period.averageSale)}`,
  ].join("\n");
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: #1e3a8a; color: #fff; padding: 14px 18px; font-size: 16px; font-weight: 700;">${subject}</div>
      <div style="padding: 16px 18px; font-size: 13px; color: #111827;">
        <p style="margin: 0 0 8px;"><strong>${period.label}</strong></p>
        <p style="margin: 4px 0;">Sales: ${period.salesCount}</p>
        <p style="margin: 4px 0;">Gross sales: ${peso(period.grossSales)}</p>
        <p style="margin: 4px 0;">Net sales: ${peso(period.netSales)}</p>
        <p style="margin: 4px 0;">Average sale: ${peso(period.averageSale)}</p>
      </div>
    </div>
  `;
  return { subject, text, html };
};

export const sendScheduledSummaryReports = async (kind: ReportKind) => {
  const now = new Date();

  if (kind === "MONTHLY_SUMMARY" && now.getUTCDate() !== 1) {
    return { skipped: true, reason: "Not the first day of the month." };
  }

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    include: { subscription: { include: { plan: true } } },
  });

  const results: Array<{ tenantId: string; status: string }> = [];

  for (const tenant of tenants) {
    const planCode = tenant.subscription?.plan.code as PlanCode | undefined;
    if (!(await hasFeature(planCode, "alerts"))) {
      results.push({ tenantId: tenant.id, status: "skipped-plan" });
      continue;
    }

    const settings = await getNotificationSettings(tenant.id);
    const enabled = kind === "END_OF_DAY" ? settings.endOfDaySummaryEnabled : settings.monthlySummaryEnabled;
    if (!settings.emailNotificationsEnabled || !enabled) {
      results.push({ tenantId: tenant.id, status: "skipped-disabled" });
      continue;
    }

    const periodKey =
      kind === "END_OF_DAY"
        ? getLocalDateStr(now, tenant.timezone)
        : getLocalDateStr(now, tenant.timezone).slice(0, 7);

    const existing = await prisma.scheduledReportDelivery.findUnique({
      where: { tenantId_reportType_periodKey: { tenantId: tenant.id, reportType: kind, periodKey } },
    });
    if (existing) {
      results.push({ tenantId: tenant.id, status: "already-sent" });
      continue;
    }

    const recipients = await getAlertRecipients(tenant.id);
    if (recipients.length === 0) {
      results.push({ tenantId: tenant.id, status: "skipped-no-recipients" });
      continue;
    }

    const report = await generateSalesDashboardReport(tenant.id, tenant.timezone);
    const email = buildSummaryEmail(tenant.name, kind, report);
    await sendAlertEmail({ to: recipients, ...email });
    await prisma.scheduledReportDelivery.create({ data: { tenantId: tenant.id, reportType: kind, periodKey } });
    results.push({ tenantId: tenant.id, status: "sent" });
  }

  return { skipped: false, results };
};
