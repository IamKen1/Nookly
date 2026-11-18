"use client";

import type { PrintMode, Style } from "@/lib/receipt-designer/types";
import { IMAGE_FONTS } from "@/lib/receipt-designer/types";

// Edits one Style. Only shows what the chosen print mode can actually print:
// text mode uses the printer's own fonts; image mode any font, size and color.
// An unset field inherits (theme → block → line); "Inherit" clears it.
export default function StyleEditor({
  value,
  onChange,
  printMode,
  compact = false,
}: {
  value: Style;
  onChange: (style: Style) => void;
  printMode: PrintMode;
  compact?: boolean;
}) {
  const set = <K extends keyof Style>(key: K, v: Style[K] | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const toggle = (key: "bold" | "italic" | "underline" | "inverse", label: string, title: string) => {
    const on = value[key] === true;
    const off = value[key] === false;
    return (
      <button
        type="button"
        title={`${title} (click again to ${on ? "turn off" : off ? "inherit" : "turn on"})`}
        onClick={() => set(key, on ? false : off ? undefined : true)}
        className={`h-8 min-w-8 rounded-md border px-2 text-xs font-semibold ${
          on ? "border-emerald-500 bg-emerald-50 text-emerald-700" : off ? "border-zinc-300 bg-zinc-100 text-zinc-400 line-through" : "border-zinc-200 text-zinc-500"
        }`}
      >
        {label}
      </button>
    );
  };
  const select = "h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-800";
  const row = "flex flex-wrap items-center gap-2";
  const label = "w-20 shrink-0 text-xs text-zinc-500";

  return (
    <div className={`space-y-2 ${compact ? "" : "rounded-lg border border-zinc-200 bg-zinc-50/60 p-3"}`}>
      <div className={row}>
        {toggle("bold", "B", "Bold")}
        {printMode === "IMAGE" && toggle("italic", "I", "Italic")}
        {toggle("underline", "U", "Underline")}
        {toggle("inverse", "◼", "White on black")}
      </div>

      {printMode === "TEXT" ? (
        <>
          <div className={row}>
            <span className={label}>Font</span>
            <select className={select} value={value.font ?? ""} onChange={(e) => set("font", (e.target.value || undefined) as Style["font"])}>
              <option value="">Inherit</option>
              <option value="A">Font A (normal)</option>
              <option value="B">Font B (small)</option>
            </select>
          </div>
          <div className={row}>
            <span className={label}>Size</span>
            <select className={select} value={value.sizeW ?? ""} onChange={(e) => set("sizeW", e.target.value ? Number(e.target.value) : undefined)} title="Width">
              <option value="">W: inherit</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>W {n}×</option>
              ))}
            </select>
            <select className={select} value={value.sizeH ?? ""} onChange={(e) => set("sizeH", e.target.value ? Number(e.target.value) : undefined)} title="Height">
              <option value="">H: inherit</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>H {n}×</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className={row}>
            <span className={label}>Font</span>
            <select className={select} value={value.fontFamily ?? ""} onChange={(e) => set("fontFamily", e.target.value || undefined)}>
              <option value="">Inherit</option>
              {Object.entries(IMAGE_FONTS).map(([k, f]) => (
                <option key={k} value={k} style={{ fontFamily: f.css }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Size (pt)</span>
            <input
              type="number"
              min={6}
              max={48}
              step={0.5}
              placeholder="inherit"
              value={value.fontSize ?? ""}
              onChange={(e) => set("fontSize", e.target.value === "" ? undefined : Number(e.target.value))}
              className={`${select} w-20`}
            />
          </div>
          <div className={row}>
            <span className={label}>Color</span>
            <input type="color" value={value.color ?? "#000000"} onChange={(e) => set("color", e.target.value)} className="h-8 w-10 rounded border border-zinc-200" />
            {value.color && (
              <button type="button" onClick={() => set("color", undefined)} className="text-xs text-zinc-500 hover:text-zinc-800">
                inherit
              </button>
            )}
          </div>
          <div className={row}>
            <span className={label}>Background</span>
            <input type="color" value={value.background ?? "#ffffff"} onChange={(e) => set("background", e.target.value)} className="h-8 w-10 rounded border border-zinc-200" />
            {value.background !== undefined && (
              <button type="button" onClick={() => set("background", undefined)} className="text-xs text-zinc-500 hover:text-zinc-800">
                none
              </button>
            )}
          </div>
          {!compact && (
            <>
              <div className={row}>
                <span className={label}>Line height</span>
                <input
                  type="number"
                  min={0.8}
                  max={3}
                  step={0.05}
                  placeholder="inherit"
                  value={value.lineHeight ?? ""}
                  onChange={(e) => set("lineHeight", e.target.value === "" ? undefined : Number(e.target.value))}
                  className={`${select} w-20`}
                />
              </div>
              <div className={row}>
                <span className={label}>Letter gap</span>
                <input
                  type="number"
                  min={-2}
                  max={10}
                  step={0.5}
                  placeholder="inherit"
                  value={value.letterSpacing ?? ""}
                  onChange={(e) => set("letterSpacing", e.target.value === "" ? undefined : Number(e.target.value))}
                  className={`${select} w-20`}
                />
              </div>
            </>
          )}
          <p className="text-[11px] leading-snug text-zinc-400">Colors print as shades of gray on a thermal printer, and in full color on a regular printer.</p>
        </>
      )}
    </div>
  );
}
