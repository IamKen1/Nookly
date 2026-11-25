"use client";

import type { ValueFormat } from "@/lib/receipt-designer/types";
import { DATE_FORMATS, NAME_FORMATS, TIME_FORMATS } from "@/lib/receipt-designer/format";
import { ALL_TOKENS } from "@/lib/receipt-designer/totals";

const select = "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800";

// How amounts, dates, times and names are written on the whole receipt.
export function ValueFormatEditor({ value, onChange }: { value: ValueFormat; onChange: (v: ValueFormat) => void }) {
  const set = <K extends keyof ValueFormat>(k: K, v: ValueFormat[K]) => onChange({ ...value, [k]: v });
  const row = (label: string, control: React.ReactNode) => (
    <label className="grid grid-cols-[6rem_1fr] items-center gap-2">
      <span className="text-xs text-zinc-500">{label}</span>
      {control}
    </label>
  );
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-zinc-600">How values are written</p>
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
        {row(
          "Amounts",
          <select className={select} value={value.currency} onChange={(e) => set("currency", e.target.value as ValueFormat["currency"])}>
            <option value="peso">₱312.50</option>
            <option value="none">312.50 (no ₱ sign)</option>
          </select>
        )}
        {row(
          "Date",
          <select className={select} value={value.date} onChange={(e) => set("date", e.target.value as ValueFormat["date"])}>
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}
        {row(
          "Time",
          <select className={select} value={value.time} onChange={(e) => set("time", e.target.value as ValueFormat["time"])}>
            {TIME_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}
        {row(
          "Cashier name",
          <select className={select} value={value.cashierName} onChange={(e) => set("cashierName", e.target.value as ValueFormat["cashierName"])}>
            {NAME_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}
        {row(
          "Customer name",
          <select className={select} value={value.customerName} onChange={(e) => set("customerName", e.target.value as ValueFormat["customerName"])}>
            {NAME_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// The {tokens} owners can type in any text or label.
export function TokenHelp() {
  return (
    <details className="rounded-md border border-zinc-100 p-2">
      <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">
        Put values in the text: <code>{"{quantity}"}</code>, <code>{"{receiptNo}"}</code>, <code>{"{date}"}</code>…
      </summary>
      <p className="mt-1 text-[11px] text-zinc-500">
        Example: <code>{"** {quantity} item(s) **"}</code> or <code>{"#{receiptNo}  {date} {time} {cashier}"}</code>
      </p>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-[11px] text-zinc-600">
        {ALL_TOKENS.map((t) => (
          <li key={t.token}>
            <code className="text-emerald-700">{t.token}</code> {t.name}
          </li>
        ))}
      </ul>
    </details>
  );
}
