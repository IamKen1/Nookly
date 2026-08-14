export type ReportPeriod = "daily" | "weekly" | "monthly";

export function getPeriodKey(date: Date, period: ReportPeriod, timeZone: string): string {
  const d = new Date(date.toLocaleString("en-US", { timeZone }));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  if (period === "daily") return `${yyyy}-${mm}-${dd}`;
  if (period === "monthly") return `${yyyy}-${mm}`;

  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const ws = String(startOfWeek.getMonth() + 1).padStart(2, "0");
  const wd = String(startOfWeek.getDate()).padStart(2, "0");
  return `${startOfWeek.getFullYear()}-W${ws}-${wd}`;
}

export function getPeriodLabel(key: string, period: ReportPeriod): string {
  if (period === "daily") return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${key}T00:00:00`));
  if (period === "monthly") {
    const [yyyy, mm] = key.split("-");
    return new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long" }).format(new Date(Number(yyyy), Number(mm) - 1, 1));
  }
  const parts = key.replace("W", "").split("-");
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
  const end = new Date(date);
  end.setDate(date.getDate() + 6);
  return `${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date)} – ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(end)}`;
}
