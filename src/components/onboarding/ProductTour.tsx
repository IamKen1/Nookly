"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface TourStep {
  target: string; // CSS selector for the element to spotlight
  title: string;
  body: string; // should say what this is, what to do next, and what to expect
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export default function ProductTour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[stepIndex];

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(step.target);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - PADDING, left: r.left - PADDING, width: r.width + PADDING * 2, height: r.height + PADDING * 2 });
    };

    const timeout = setTimeout(measure, 150);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  const finish = () => onFinish();
  const next = () => (stepIndex < steps.length - 1 ? setStepIndex((i) => i + 1) : finish());
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  // Tooltip placement: prefer below the target, flip above if it would go off-screen.
  const tooltipWidth = 320;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const spaceBelow = rect ? viewportH - (rect.top + rect.height) : 0;
  const placeAbove = rect ? spaceBelow < 220 && rect.top > 220 : false;
  const tooltipTop = rect ? (placeAbove ? Math.max(12, rect.top - 200) : rect.top + rect.height + 12) : viewportH / 2 - 80;
  const tooltipLeft = rect ? Math.min(Math.max(12, rect.left), viewportW - tooltipWidth - 12) : viewportW / 2 - tooltipWidth / 2;

  return (
    <div className="fixed inset-0 z-[200]">
      {rect ? (
        <div
          className="fixed rounded-xl ring-2 ring-emerald-400 transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/60" />
      )}

      <div
        className="fixed z-[201] w-80 rounded-2xl bg-white p-5 shadow-2xl transition-all duration-300"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">{step.title}</h3>
          <button onClick={finish} className="shrink-0 text-zinc-400 hover:text-zinc-600" aria-label="Skip tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button onClick={back} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-300">
                Back
              </button>
            )}
            <button onClick={next} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
              {stepIndex < steps.length - 1 ? "Next" : "Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
