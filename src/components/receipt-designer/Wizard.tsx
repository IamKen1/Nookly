"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import type { DateFormat, Template } from "@/lib/receipt-designer/types";
import { WIZARD_ITEMS, WIZARD_STYLES, answersFor, buildFromAnswers, type WizardAnswers } from "@/lib/receipt-designer/wizard";
import Preview from "./Preview";

const STEPS = ["Style", "Paper", "Money & dates", "Item lines", "Extras"] as const;

function Card({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        on ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      {on && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="block text-sm font-semibold text-zinc-900">{title}</span>
      {children}
    </button>
  );
}

function Toggle({ on, onChange, title, description }: { on: boolean; onChange: (v: boolean) => void; title: string; description: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-zinc-200 bg-white p-3 text-left hover:border-zinc-300">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-zinc-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-zinc-900">{title}</span>
        <span className="block text-xs text-zinc-500">{description}</span>
      </span>
    </button>
  );
}

// Guided setup: five quick steps, with the receipt changing live beside them.
export default function Wizard({
  settings,
  sample,
  paperWidth,
  onFinish,
  onClose,
}: {
  settings: ReceiptStoreSettings;
  sample: ReceiptData | null;
  paperWidth: 58 | 80;
  onFinish: (t: Template) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<WizardAnswers>(() => answersFor("classic", paperWidth));
  const set = (patch: Partial<WizardAnswers>) => setA({ ...a, ...patch });
  const template = useMemo(() => buildFromAnswers(a, settings), [a, settings]);
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[760px] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* questions */}
        <div className="flex min-w-0 flex-1 flex-col p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-zinc-900">Let&apos;s build your receipt</h2>
            <button type="button" onClick={onClose} className="ml-auto rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Close (you can come back any time)">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* progress */}
          <div className="mb-1 flex gap-1.5">
            {STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => setStep(i)} className="flex-1" title={s}>
                <span className={`block h-2 rounded-full transition-all ${i <= step ? "bg-emerald-500" : "bg-zinc-200"}`} />
              </button>
            ))}
          </div>
          <p className="mb-5 text-xs font-medium text-zinc-500">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {step === 0 && (
              <>
                <p className="mb-2 text-sm text-zinc-600">Pick a look to start from. You can change every part afterwards.</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {WIZARD_STYLES.map((s) => (
                    <Card key={s.key} on={a.style === s.key} onClick={() => setA(answersFor(s.key, a.paperWidth))} title={s.label}>
                      <span className="mt-0.5 block text-xs text-zinc-500">{s.description}</span>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="mb-2 text-sm text-zinc-600">How wide is your receipt paper? Measure the roll if you&apos;re not sure.</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {([58, 80] as const).map((w) => (
                    <Card key={w} on={a.paperWidth === w} onClick={() => set({ paperWidth: w })} title={`${w} mm`}>
                      <span className="mt-2 block rounded bg-zinc-100" style={{ height: 8, width: w === 58 ? "58%" : "80%" }} />
                      <span className="mt-1 block text-xs text-zinc-500">{w === 58 ? "Small handheld / Bluetooth printers" : "Bigger counter printers"}</span>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="mb-2 text-sm text-zinc-600">How should amounts look?</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card on={a.peso} onClick={() => set({ peso: true })} title="₱548.00">
                    <span className="mt-0.5 block text-xs text-zinc-500">With the peso sign</span>
                  </Card>
                  <Card on={!a.peso} onClick={() => set({ peso: false })} title="548.00">
                    <span className="mt-0.5 block text-xs text-zinc-500">Numbers only</span>
                  </Card>
                </div>
                <p className="mb-2 mt-4 text-sm text-zinc-600">And the date?</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      ["default", "11/22/2026"],
                      ["MM-DD-YY", "11-22-26"],
                      ["MMM D, YYYY", "Nov 22, 2026"],
                    ] as [DateFormat, string][]
                  ).map(([d, label]) => (
                    <Card key={d} on={a.date === d} onClick={() => set({ date: d })} title={label} />
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="mb-2 text-sm text-zinc-600">How should each item look?</p>
                {WIZARD_ITEMS.map((it) => (
                  <Card key={it.key} on={a.items === it.key} onClick={() => set({ items: it.key })} title={it.label}>
                    <pre className="mt-1.5 rounded-lg bg-zinc-50 px-2 py-1 font-mono text-[11px] leading-snug text-zinc-700">{a.peso ? it.example : it.example.replace(/₱/g, "")}</pre>
                  </Card>
                ))}
              </>
            )}

            {step === 4 && (
              <>
                <p className="mb-2 text-sm text-zinc-600">Anything extra at the bottom?</p>
                <Toggle on={a.vatSummary} onChange={(v) => set({ vatSummary: v })} title="VAT summary" description="VATable (T), VAT-exempt (X), zero-rated (Z), VAT and amount due" />
                <Toggle on={a.barcode} onChange={(v) => set({ barcode: v })} title="Barcode" description="Scan the AR number for returns and reprints" />
                <Toggle on={a.qrLink !== ""} onChange={(v) => set({ qrLink: v ? "https://" : "" })} title="QR code" description="Link to your Facebook page, promo or website" />
                {a.qrLink !== "" && (
                  <input
                    className="h-10 w-full rounded-xl border-2 border-zinc-200 px-3 text-sm outline-none focus:border-emerald-500"
                    value={a.qrLink}
                    onChange={(e) => set({ qrLink: e.target.value })}
                    placeholder="https://facebook.com/yourpharmacy"
                  />
                )}
                <label className="block pt-2">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">A message of your own (optional)</span>
                  <input
                    className="h-10 w-full rounded-xl border-2 border-zinc-200 px-3 text-sm outline-none focus:border-emerald-500"
                    value={a.message}
                    onChange={(e) => set({ message: e.target.value })}
                    placeholder="e.g. Get well soon! Open daily 7AM–9PM"
                  />
                </label>
                <p className="pt-1 text-xs text-zinc-400">Your thank-you message from Receipt settings and the required notice always print at the very bottom.</p>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto rounded-full px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
              Skip
            </button>
            <button
              type="button"
              onClick={() => (last ? onFinish(template) : setStep(step + 1))}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
            >
              {last ? (
                <>
                  <Sparkles className="h-4 w-4" /> Make my receipt
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* live preview */}
        <div className="hidden w-[460px] shrink-0 overflow-y-auto bg-zinc-100 px-4 py-8 md:block">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Live preview</p>
          {sample ? (
            <Preview template={template} data={sample} selected={null} onSelect={() => {}} interactive={false} />
          ) : (
            <p className="text-center text-sm text-zinc-400">Loading the sample sale…</p>
          )}
        </div>
      </div>
    </div>
  );
}

// A short burst of confetti when a receipt is made.
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 13) % 20) / 40,
        dur: 1.4 + ((i * 7) % 10) / 10,
        color: ["#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6", "#facc15"][i % 6],
        rot: (i * 47) % 360,
      })),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <style>{`@keyframes rd-fall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(105vh) rotate(720deg)}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 rounded-sm"
          style={{ left: `${p.left}%`, background: p.color, transform: `rotate(${p.rot}deg)`, animation: `rd-fall ${p.dur}s ${p.delay}s ease-in forwards` }}
        />
      ))}
    </div>
  );
}
