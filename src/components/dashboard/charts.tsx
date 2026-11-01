"use client";

import { useEffect, useRef, useState } from "react";

const compactPeso = (v: number) =>
  v >= 1_000_000 ? `₱${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `₱${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K` : `₱${Math.round(v)}`;
const fullPeso = (v: number) => `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Round the axis top up to a "nice" number so gridlines land on readable values.
const niceMax = (max: number) => {
  if (max <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max)!;
  return step * pow;
};

// Charts draw at the card's real pixel width (not a scaled viewBox), so axis
// labels stay a readable 11px whether the card is wide or narrow.
function useChartWidth(initial = 560) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Counts up from 0 on first render — the hero number "lands" instead of popping in.
export function CountUp({ value, format = "peso" }: { value: number; format?: "peso" | "int" | "pct" }) {
  const [shown, setShown] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Reduced motion: same path, zero duration — lands on the value in one frame.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = duration ? Math.min(1, (t - start) / duration) : 1;
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  if (format === "int") return <>{Math.round(shown).toLocaleString("en-PH")}</>;
  if (format === "pct") return <>{shown.toFixed(1)}%</>;
  return <>{fullPeso(shown)}</>;
}

// Positioned in percentages of the chart box, which scales with the SVG.
function Tooltip({ leftPct, topPct, title, value, sub }: { leftPct: number; topPct: number; title: string; value: string; sub?: string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: `${leftPct}%`, top: `calc(${topPct}% - 8px)` }}
      role="status"
    >
      <p className="font-semibold text-zinc-900">{value}</p>
      <p className="text-zinc-500">{title}</p>
      {sub && <p className="text-zinc-400">{sub}</p>}
    </div>
  );
}

// Last N days of sales: one series, so one hue — today in the full accent,
// earlier days a lighter step of the same green.
export function DailySalesBars({ days }: { days: { date: string; total: number; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useChartWidth();
  const H = 210;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...days.map((d) => d.total), 0));
  const band = innerW / days.length;
  const barW = Math.min(24, band * 0.5);
  const ticks = [0, max / 2, max];
  const label = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { weekday: "short", timeZone: "Asia/Manila" });

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label="Daily sales, last 7 days">
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="#eef2ef" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
                {compactPeso(t)}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = Math.max(d.total > 0 ? 3 : 0, (d.total / max) * innerH);
          const x = pad.left + band * i + (band - barW) / 2;
          const y = pad.top + innerH - h;
          const isToday = i === days.length - 1;
          const r = Math.min(4, h / 2);
          return (
            <g key={d.date} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              {/* generous invisible hit target, bigger than the bar */}
              <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  // square at the baseline, 4px rounded at the data end
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  fill={isToday ? "#059669" : hover === i ? "#6ee7b7" : "#a7f3d0"}
                  className="origin-bottom transition-colors"
                  style={{ transformBox: "fill-box", animation: `nk-grow 700ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms both` }}
                />
              )}
              <text x={pad.left + band * i + band / 2} y={H - 8} textAnchor="middle" className={`text-[11px] ${isToday ? "fill-zinc-900 font-semibold" : "fill-zinc-400"}`}>
                {isToday ? "Today" : label(d.date)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip
          leftPct={((pad.left + band * hover + band / 2) / W) * 100}
          topPct={((pad.top + innerH - (days[hover].total / max) * innerH) / H) * 100}
          title={new Date(days[hover].date).toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric", timeZone: "Asia/Manila" })}
          value={fullPeso(days[hover].total)}
          sub={`${days[hover].count} sale${days[hover].count === 1 ? "" : "s"}`}
        />
      )}
      <style>{`@keyframes nk-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }`}</style>
    </div>
  );
}

// Today's sales by hour as a single line with a light wash underneath, and a
// crosshair + tooltip that follows the pointer.
export function HourlySalesLine({ hours, currentHour }: { hours: { hour: number; total: number }[]; currentHour: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useChartWidth();
  const H = 210;
  // extra top room so the "Peak" label above the highest point never clips
  const pad = { top: 26, right: 12, bottom: 24, left: 12 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const shown = hours.slice(0, currentHour + 1);
  const max = Math.max(...shown.map((h) => h.total), 1);
  const x = (h: number) => pad.left + (h / 23) * innerW;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const line = shown.map((h, i) => `${i ? "L" : "M"}${x(h.hour)},${y(h.total)}`).join(" ");
  const area = shown.length ? `${line} L${x(shown[shown.length - 1].hour)},${pad.top + innerH} L${x(0)},${pad.top + innerH} Z` : "";
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  const peak = shown.reduce((best, h) => (h.total > best.total ? h : best), { hour: -1, total: 0 });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const hour = Math.round(((px - pad.left) / innerW) * 23);
    setHover(hour >= 0 && hour <= currentHour ? hour : null);
  };

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Today's sales by hour">
        <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} stroke="#eef2ef" strokeWidth={1} />
        {area && <path d={area} fill="#059669" opacity={0.1} />}
        {line && <path d={line} fill="none" stroke="#059669" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {[6, 9, 12, 15, 18, 21].map((h) => (
          <text key={h} x={x(h)} y={H - 6} textAnchor="middle" className="fill-zinc-400 text-[11px]">
            {hourLabel(h)}
          </text>
        ))}
        {peak.hour >= 0 && peak.total > 0 && hover === null && (
          <g>
            <circle cx={x(peak.hour)} cy={y(peak.total)} r={4.5} fill="#059669" stroke="#fff" strokeWidth={2} />
            <text x={x(peak.hour)} y={y(peak.total) - 9} textAnchor="middle" className="fill-zinc-600 text-[11px] font-semibold">
              Peak {hourLabel(peak.hour)}
            </text>
          </g>
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="#a1a1aa" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(hours[hover].total)} r={4.5} fill="#059669" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip
          leftPct={(x(hover) / W) * 100}
          topPct={(y(hours[hover].total) / H) * 100}
          title={`${hourLabel(hover)} – ${hourLabel((hover + 1) % 24)}`}
          value={fullPeso(hours[hover].total)}
        />
      )}
    </div>
  );
}
