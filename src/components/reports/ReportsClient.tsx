"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Loader2, Printer, Search } from "lucide-react";
import { REPORTS, REPORT_GROUPS, POINT_IN_TIME, type CellFormat, type ReportKey, type ReportResult } from "@/lib/reports/registry";

type RunResult = ReportResult & { meta: { label: string; scope: string; period: string } };

const PH_OFFSET = 8 * 3600 * 1000;
const phToday = () => new Date(Date.now() + PH_OFFSET).toISOString().slice(0, 10);
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);

// Date presets, in Philippine calendar days.
function presetRange(preset: string): [string, string] {
  const t = phToday();
  const [y, m] = [Number(t.slice(0, 4)), Number(t.slice(5, 7))];
  const monthStart = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  switch (preset) {
    case "today":
      return [t, t];
    case "yesterday":
      return [shift(t, -1), shift(t, -1)];
    case "7d":
      return [shift(t, -6), t];
    case "30d":
      return [shift(t, -29), t];
    case "lastMonth": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return [monthStart(ly, lm), shift(monthStart(y, m), -1)];
    }
    case "quarter":
      return [monthStart(y, Math.floor((m - 1) / 3) * 3 + 1), t];
    case "year":
      return [`${y}-01-01`, t];
    default:
      return [monthStart(y, m), t];
  }
}
const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "Last 7 days"],
  ["month", "This month"],
  ["lastMonth", "Last month"],
  ["30d", "Last 30 days"],
  ["quarter", "This quarter"],
  ["year", "This year"],
  ["custom", "Custom"],
] as const;

const pesoFmt = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmt(v: unknown, f?: CellFormat) {
  if (v === null || v === undefined || v === "") return "";
  switch (f) {
    case "money":
      return Number(v) < 0 ? `−₱${pesoFmt.format(-Number(v))}` : `₱${pesoFmt.format(Number(v))}`;
    case "int":
      return Number(v).toLocaleString("en-PH");
    case "qty":
      return Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 });
    case "pct":
      return `${Number(v).toFixed(1)}%`;
    case "date":
      return typeof v === "string" && v.includes("T")
        ? new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })
        : new Date(`${v}T00:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
    case "datetime":
      return new Date(String(v)).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
    default:
      return String(v);
  }
}
// Shows the server's reason (e.g. "needs more than one branch") instead of a bare status code.
const reportFetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't load the report.");
  return body;
};

const numeric = (f?: CellFormat) => f === "money" || f === "int" || f === "pct" || f === "qty";

const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(`nookly.reports.${k}`, v);
  } catch {}
};
const recall = (k: string) => {
  try {
    return localStorage.getItem(`nookly.reports.${k}`);
  } catch {
    return null;
  }
};

export default function ReportsClient({
  enabledReports,
  branches,
  isMultiBranch,
}: {
  enabledReports: ReportKey[];
  // Branches this user may pick (null = their own branch only).
  branches: { id: string; name: string }[] | null;
  isMultiBranch: boolean;
}) {
  const available = REPORTS.filter((r) => enabledReports.includes(r.key) && (!("multiBranch" in r && r.multiBranch) || isMultiBranch));
  const [report, setReport] = useState<ReportKey>(available[0]?.key ?? "sales-summary");
  const [preset, setPreset] = useState("month");
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange("month"));
  const [branch, setBranch] = useState("current");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(500);

  // Reopen where the user left off (this browser only).
  useEffect(() => {
    const r = recall("report") as ReportKey | null;
    const p = recall("preset");
    const b = recall("branch");
    /* eslint-disable react-hooks/set-state-in-effect */
    if (r && available.some((a) => a.key === r)) setReport(r);
    if (p && p !== "custom" && PRESETS.some(([k]) => k === p)) {
      setPreset(p);
      setRange(presetRange(p));
    }
    if (b && (b === "current" || b === "all" || branches?.some((x) => x.id === b))) setBranch(b);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = REPORTS.find((r) => r.key === report)!;
  const pointInTime = POINT_IN_TIME.includes(report);
  const qs = new URLSearchParams({ report, from, to, branch }).toString();
  const { data, error, isLoading } = useSWR<RunResult>(available.length ? `/api/reports/run?${qs}` : null, reportFetcher, { keepPreviousData: true, revalidateOnFocus: false });
  const loading = isLoading || (data && data.meta.label !== meta.label);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    let list = needle ? data.rows.filter((r) => data.columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(needle))) : data.rows;
    if (sort) {
      const col = data.columns.find((c) => c.key === sort.key);
      list = [...list].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x === y) return 0;
        if (x === null || x === undefined || x === "") return 1;
        if (y === null || y === undefined || y === "") return -1;
        return (numeric(col?.format) ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return list;
  }, [data, q, sort]);

  const totals = useMemo(() => {
    if (!data || !data.columns.some((c) => c.total)) return null;
    return Object.fromEntries(data.columns.filter((c) => c.total).map((c) => [c.key, rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)]));
  }, [data, rows]);

  const pick = (key: ReportKey) => {
    setReport(key);
    setSort(null);
    setQ("");
    setLimit(500);
    remember("report", key);
  };
  const pickPreset = (p: string) => {
    setPreset(p);
    if (p !== "custom") setRange(presetRange(p));
    remember("preset", p);
  };

  if (available.length === 0) {
    return <p className="text-sm text-zinc-500">No reports are included in your plan.</p>;
  }

  const ctl = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800 focus:border-emerald-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Report list */}
      <nav className="print:hidden lg:sticky lg:top-4 lg:w-60 lg:shrink-0" aria-label="Reports">
        <select value={report} onChange={(e) => pick(e.target.value as ReportKey)} className={`${ctl} w-full lg:hidden`}>
          {REPORT_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {available.filter((r) => r.group === g).map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="hidden max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-2 lg:block">
          {REPORT_GROUPS.map((g) => {
            const list = available.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{g}</p>
                {list.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => pick(r.key)}
                    className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                      r.key === report ? "bg-emerald-50 font-semibold text-emerald-800" : "text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </nav>

      <section className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-900">{meta.label}</h1>
            <p className="text-xs text-zinc-500">
              {meta.description}
              {data && !loading && (
                <span className="text-zinc-400">
                  {" "}
                  · {data.meta.scope} · {data.meta.period}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 print:hidden">
            <a href={`/api/reports/run?${qs}&format=xlsx`} className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Excel
            </a>
            <a href={`/api/reports/run?${qs}&format=csv`} className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400">
              <Download className="h-3.5 w-3.5" /> CSV
            </a>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 print:hidden">
          {pointInTime ? (
            <span className="text-xs text-zinc-500">As of now</span>
          ) : (
            <>
              <select value={preset} onChange={(e) => pickPreset(e.target.value)} className={ctl} aria-label="Period">
                {PRESETS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setPreset("custom");
                  if (e.target.value) setRange([e.target.value, to]);
                }}
                className={ctl}
                aria-label="From"
              />
              <span className="text-xs text-zinc-400">to</span>
              <input
                type="date"
                value={to}
                min={from}
                max={phToday()}
                onChange={(e) => {
                  setPreset("custom");
                  if (e.target.value) setRange([from, e.target.value]);
                }}
                className={ctl}
                aria-label="To"
              />
            </>
          )}
          {branches && report !== "payables-aging" && report !== "prescriptions" && (
            <select
              value={branch}
              onChange={(e) => {
                setBranch(e.target.value);
                remember("branch", e.target.value);
              }}
              className={ctl}
              aria-label="Branch"
            >
              <option value="current">This branch</option>
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <label className="ml-auto flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows" className="w-32 text-xs outline-none sm:w-44" />
          </label>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error.message}</p>}

        {/* Key figures */}
        {data && (
          <dl className={`mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 ${loading ? "opacity-50" : ""}`}>
            {data.summary.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">{s.label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-zinc-900">{fmt(s.value, s.format)}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Table */}
        <div className={`relative mt-3 overflow-auto rounded-lg border border-zinc-200 bg-white ${loading ? "opacity-60" : ""}`} style={{ maxHeight: "calc(100vh - 16rem)" }}>
          {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-zinc-400" />}
          {data && (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-50">
                <tr>
                  {data.columns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: -1 }))}
                      className={`cursor-pointer select-none whitespace-nowrap border-b border-zinc-200 px-3 py-2 font-semibold text-zinc-600 hover:text-zinc-900 ${numeric(c.format) ? "text-right" : "text-left"}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sort?.key === c.key && (sort.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={data.columns.length} className="px-3 py-8 text-center text-zinc-400">
                      {q ? "No rows match the filter." : "No data for this period."}
                    </td>
                  </tr>
                ) : (
                  rows.slice(0, limit).map((r, i) => {
                    const kind = r.kind as string | undefined;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-zinc-100 hover:bg-emerald-50/40 ${kind === "subtotal" ? "bg-zinc-50 font-semibold" : kind === "total" ? "bg-emerald-50 font-bold" : ""}`}
                      >
                        {data.columns.map((c) => {
                          const v = r[c.key];
                          const negative = numeric(c.format) && Number(v) < 0;
                          return (
                            <td
                              key={c.key}
                              className={`whitespace-nowrap px-3 py-1.5 ${numeric(c.format) ? "text-right tabular-nums" : "max-w-[22rem] truncate"} ${
                                negative ? "text-red-600" : "text-zinc-800"
                              }`}
                              title={!numeric(c.format) && String(v ?? "").length > 40 ? String(v) : undefined}
                            >
                              {fmt(v, c.format)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {totals && rows.length > 0 && (
                <tfoot className="sticky bottom-0 bg-zinc-100 font-semibold">
                  <tr>
                    {data.columns.map((c, i) => (
                      <td key={c.key} className={`whitespace-nowrap border-t border-zinc-300 px-3 py-2 ${numeric(c.format) ? "text-right tabular-nums" : ""}`}>
                        {i === 0 ? `Total (${rows.length.toLocaleString("en-PH")})` : c.key in totals ? fmt(totals[c.key], c.format) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
          <span>
            {data && (
              <>
                {rows.length.toLocaleString("en-PH")} row{rows.length === 1 ? "" : "s"}
                {rows.length > limit && (
                  <>
                    {" "}
                    · showing {limit.toLocaleString("en-PH")} —{" "}
                    <button onClick={() => setLimit((l) => l + 1000)} className="font-semibold text-emerald-700 print:hidden">
                      show more
                    </button>{" "}
                    or export for all
                  </>
                )}
              </>
            )}
          </span>
          {data?.note && <span className="max-w-3xl text-zinc-400">{data.note}</span>}
        </div>
      </section>
    </div>
  );
}
