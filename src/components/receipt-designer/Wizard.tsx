"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import type { DateFormat, NameFormat, Template, TimeFormat } from "@/lib/receipt-designer/types";
import {
  WIZARD_ITEMS,
  WIZARD_STYLES,
  WIZARD_TOTALS,
  answersFor,
  buildFromAnswers,
  type WizardAnswers,
} from "@/lib/receipt-designer/wizard";
import { DATE_FORMATS, NAME_FORMATS, TIME_FORMATS } from "@/lib/receipt-designer/format";
import { ROUNDING_STEPS, type RuleWhen } from "@/lib/pricing";
import { exampleCheckouts } from "@/lib/receipt-designer/samples";
import type { DiscountDTO } from "@/lib/discounts";
import Preview from "./Preview";
import { Examples } from "./PosPricing";

const STEPS = ["Style", "Paper & look", "Store details", "Sale details", "Items", "Totals & money", "Extras", "Cash rounding"] as const;

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
      <span className="block pr-6 text-sm font-semibold text-zinc-900">{title}</span>
      {children}
    </button>
  );
}

function Toggle({ on, onChange, title, description }: { on: boolean; onChange: (v: boolean) => void; title: string; description?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-zinc-200 bg-white p-3 text-left hover:border-zinc-300">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-zinc-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-zinc-900">{title}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
    </button>
  );
}

// Small checkbox chips, for "which of these" questions.
function Chips<K extends string>({ value, options, onChange }: { value: Record<K, boolean>; options: [K, string][]; onChange: (v: Record<K, boolean>) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange({ ...value, [k]: !value[k] })}
          className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
            value[k] ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
          }`}
        >
          {value[k] && <Check className="h-3.5 w-3.5" />} {label}
        </button>
      ))}
    </div>
  );
}

const Q = ({ children }: { children: React.ReactNode }) => <p className="mb-2 mt-4 text-sm font-medium text-zinc-700 first:mt-0">{children}</p>;
const select = "h-10 w-full rounded-xl border-2 border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-500";

export interface WizardResult {
  template: Template;
  roundingStep?: number | null; // set only when the owner chose to change cash rounding
}

// Guided setup: eight quick steps, with the receipt changing live beside them.
export default function Wizard({
  settings,
  paperWidth,
  hasLogo,
  onFinish,
  onClose,
}: {
  settings: ReceiptStoreSettings;
  paperWidth: 58 | 80;
  hasLogo: boolean;
  onFinish: (r: WizardResult) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<WizardAnswers>(() => answersFor("classic", paperWidth));
  const set = (patch: Partial<WizardAnswers>) => setA({ ...a, ...patch });
  const template = useMemo(() => buildFromAnswers(a, settings), [a, settings]);
  const last = step === STEPS.length - 1;

  // The preview sale: regular, senior citizen, or with one of the store's own discounts.
  const { data: discounts } = useSWR<DiscountDTO[]>("/api/discounts");
  const own = (discounts ?? []).filter((d) => !d.isSystem && d.isActive);
  const [sampleKind, setSampleKind] = useState("regular");
  const { data: rawSample } = useSWR<ReceiptData>(`/api/settings/receipt-template/sample?kind=${sampleKind}`);
  const sample = useMemo(() => (rawSample ? { ...rawSample, date: new Date(rawSample.date) } : null), [rawSample]);

  // Cash rounding is a POS setting: unchanged unless the owner picks something here.
  const { data: pos } = useSWR<{ pricing: { roundingStep: number | null; ruleEnabled: boolean; ruleLabel: string; ruleExpr: string; ruleWhen?: RuleWhen } }>("/api/settings/pos-changes");
  const currentStep = pos?.pricing.roundingStep ?? null;
  const [rounding, setRounding] = useState<"keep" | number | null>("keep");
  const roundingChanges = rounding !== "keep" && rounding !== currentStep;
  const currentRule = pos?.pricing.ruleEnabled ? { label: pos.pricing.ruleLabel, expr: pos.pricing.ruleExpr, when: pos.pricing.ruleWhen } : null;
  const peso = (n: number) => `₱${n.toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[800px] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
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
          <div className="mb-1 flex gap-1">
            {STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => setStep(i)} className="flex-1" title={s}>
                <span className={`block h-2 rounded-full transition-all ${i <= step ? "bg-emerald-500" : "bg-zinc-200"}`} />
              </button>
            ))}
          </div>
          <p className="mb-5 text-xs font-medium text-zinc-500">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {step === 0 && (
              <>
                <Q>Pick a look to start from. The next steps fine-tune everything.</Q>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {WIZARD_STYLES.map((s) => (
                    <Card key={s.key} on={a.style === s.key} onClick={() => setA({ ...answersFor(s.key, a.paperWidth), showLogo: answersFor(s.key).showLogo && hasLogo })} title={s.label}>
                      <span className="mt-0.5 block text-xs text-zinc-500">{s.description}</span>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Q>How wide is your receipt paper? Measure the roll if you&apos;re not sure.</Q>
                <div className="grid grid-cols-2 gap-2.5">
                  {([58, 80] as const).map((w) => (
                    <Card key={w} on={a.paperWidth === w} onClick={() => set({ paperWidth: w })} title={`${w} mm`}>
                      <span className="mt-2 block rounded bg-zinc-100" style={{ height: 8, width: w === 58 ? "58%" : "80%" }} />
                      <span className="mt-1 block text-xs text-zinc-500">{w === 58 ? "Small handheld / Bluetooth printers" : "Bigger counter printers"}</span>
                    </Card>
                  ))}
                </div>
                <Q>How should it print?</Q>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card on={a.printMode === "TEXT"} onClick={() => set({ printMode: "TEXT" })} title="Fast (printer letters)">
                    <span className="mt-0.5 block text-xs text-zinc-500">Quickest, works on every thermal printer.</span>
                  </Card>
                  <Card on={a.printMode === "IMAGE"} onClick={() => set({ printMode: "IMAGE" })} title="Pretty (any font)">
                    <span className="mt-0.5 block text-xs text-zinc-500">Prints as a picture: nicer fonts, a bit slower.</span>
                  </Card>
                </div>
                <Q>Letters</Q>
                <Toggle on={a.allCaps} onChange={(v) => set({ allCaps: v })} title="ALL CAPS" description="Like most big-chain register receipts" />
              </>
            )}

            {step === 2 && (
              <>
                <Q>What should the top of the receipt show? (From Settings › Receipt)</Q>
                <Chips
                  value={a.storeFields}
                  onChange={(storeFields) => set({ storeFields })}
                  options={[
                    ["address", "Address"],
                    ["contact", "Contact no."],
                    ["tin", "TIN"],
                    ["permit", "Permit no."],
                    ["accreditation", "Accreditation no."],
                    ["serial", "Serial no."],
                  ]}
                />
                <Q>How should the labels read?</Q>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card on={a.labels === "plain"} onClick={() => set({ labels: "plain" })} title="TIN: 123-456…">
                    <span className="mt-0.5 block text-xs text-zinc-500">Contact: 0917…</span>
                  </Card>
                  <Card on={a.labels === "register"} onClick={() => set({ labels: "register" })} title="VAT REG TIN:123-456…">
                    <span className="mt-0.5 block text-xs text-zinc-500">TEL NO : 0917…</span>
                  </Card>
                </div>
                <div className="mt-3 space-y-2">
                  <Toggle on={a.bigName} onChange={(v) => set({ bigName: v })} title="Big store name" description="Twice as tall and wide" />
                  <Toggle on={a.showTitle} onChange={(v) => set({ showTitle: v })} title="Receipt title" description={`"${settings.receiptTitle || "Acknowledgement Receipt"}" under the store details`} />
                  <Toggle
                    on={a.showLogo}
                    onChange={(v) => set({ showLogo: v })}
                    title="Logo"
                    description={hasLogo ? "Your logo at the very top" : "Upload one later under Whole receipt; it shows once uploaded"}
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Q>Which sale details should print?</Q>
                <Chips
                  value={a.details}
                  onChange={(details) => set({ details })}
                  options={[
                    ["receiptNo", "AR number"],
                    ["date", "Date"],
                    ["time", "Time"],
                    ["cashier", "Cashier"],
                    ["customer", "Customer"],
                  ]}
                />
                {!a.details.receiptNo && a.totals !== "register" && (
                  <p className="mt-2 text-xs text-amber-700">Without the AR number, sales are harder to find for returns and reprints.</p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Date</span>
                    <select className={select} value={a.date} onChange={(e) => set({ date: e.target.value as DateFormat })}>
                      {DATE_FORMATS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Time</span>
                    <select className={select} value={a.time} onChange={(e) => set({ time: e.target.value as TimeFormat })}>
                      {TIME_FORMATS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600">Cashier name</span>
                    <select className={select} value={a.cashierName} onChange={(e) => set({ cashierName: e.target.value as NameFormat })}>
                      {NAME_FORMATS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <Q>How should each item look?</Q>
                <div className="space-y-2">
                  {WIZARD_ITEMS.map((it) => (
                    <Card key={it.key} on={a.items === it.key} onClick={() => set({ items: it.key })} title={it.label}>
                      <pre className="mt-1.5 rounded-lg bg-zinc-50 px-2 py-1 font-mono text-[11px] leading-snug text-zinc-700">{a.peso ? it.example : it.example.replace(/₱/g, "")}</pre>
                    </Card>
                  ))}
                </div>
                <Q>The VAT letter after each amount</Q>
                <div className="grid grid-cols-3 gap-2">
                  <Card on={a.letters === "VN"} onClick={() => set({ letters: "VN" })} title="V / N">
                    <span className="block text-xs text-zinc-500">VATable / non-VAT</span>
                  </Card>
                  <Card on={a.letters === "TX"} onClick={() => set({ letters: "TX" })} title="T / X">
                    <span className="block text-xs text-zinc-500">Taxable / exempt</span>
                  </Card>
                  <Card on={a.letters === "none"} onClick={() => set({ letters: "none" })} title="None" />
                </div>
                <Q>Item count</Q>
                <div className="grid grid-cols-3 gap-2">
                  <Card on={a.itemCount === "line"} onClick={() => set({ itemCount: "line" })} title="Total Items: 42" />
                  <Card on={a.itemCount === "stars"} onClick={() => set({ itemCount: "stars" })} title="** 42 item(s) **" />
                  <Card on={a.itemCount === "none"} onClick={() => set({ itemCount: "none" })} title="Don't show" />
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <Q>How should the totals read?</Q>
                <div className="space-y-2">
                  {WIZARD_TOTALS.map((t) => (
                    <Card key={t.key} on={a.totals === t.key} onClick={() => set({ totals: t.key })} title={t.label}>
                      <pre className="mt-1.5 rounded-lg bg-zinc-50 px-2 py-1 font-mono text-[11px] leading-snug text-zinc-700">{a.peso ? t.example : t.example.replace(/₱/g, "")}</pre>
                    </Card>
                  ))}
                </div>
                <Q>Amounts</Q>
                <div className="grid grid-cols-2 gap-2.5">
                  <Card on={a.peso} onClick={() => set({ peso: true })} title="₱548.00">
                    <span className="mt-0.5 block text-xs text-zinc-500">With the peso sign</span>
                  </Card>
                  <Card on={!a.peso} onClick={() => set({ peso: false })} title="548.00">
                    <span className="mt-0.5 block text-xs text-zinc-500">Numbers only</span>
                  </Card>
                </div>
                {a.totals !== "register" && (
                  <div className="mt-3">
                    <Toggle on={a.bigTotal} onChange={(v) => set({ bigTotal: v })} title="Big total" description="The amount due twice as tall" />
                  </div>
                )}
                <p className="mt-3 text-xs text-zinc-500">Senior citizen and PWD sales always show the VAT exemption, discount, name, ID and signature lines, as the law requires.</p>
              </>
            )}

            {step === 6 && (
              <div className="space-y-2">
                <Q>Anything extra at the bottom?</Q>
                <Toggle on={a.vatSummary} onChange={(v) => set({ vatSummary: v })} title="VAT summary" description="VATable (T), VAT-exempt (X), zero-rated (Z), VAT and amount due" />
                <Toggle on={a.barcode} onChange={(v) => set({ barcode: v })} title="Barcode" description="Scan the AR number for returns and reprints" />
                <Toggle on={a.qrLink !== ""} onChange={(v) => set({ qrLink: v ? "https://" : "" })} title="QR code" description="Link to your Facebook page, promo or website" />
                {a.qrLink !== "" && (
                  <input className={select} value={a.qrLink} onChange={(e) => set({ qrLink: e.target.value })} placeholder="https://facebook.com/yourpharmacy" />
                )}
                <Toggle on={a.promoText !== ""} onChange={(v) => set({ promoText: v ? "PROMO OF THE MONTH" : "" })} title="Promo banner" description="Big white-on-black text" />
                {a.promoText !== "" && <input className={select} value={a.promoText} maxLength={60} onChange={(e) => set({ promoText: e.target.value })} />}
                <label className="block pt-2">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">A message of your own (optional)</span>
                  <input className={select} value={a.message} onChange={(e) => set({ message: e.target.value })} placeholder="e.g. Get well soon! Open daily 7AM–9PM" />
                </label>
                <p className="pt-1 text-xs text-zinc-400">Your thank-you message from Settings › Receipt and the required notice always print at the very bottom.</p>
              </div>
            )}

            {step === 7 && (
              <>
                <div className="mb-3 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Optional: this one changes what customers pay.</p>
                  <p className="mt-0.5 text-xs">Cash totals round DOWN (never up) to make change easier. E-wallet stays exact. You can undo it any time.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Card on={rounding === "keep"} onClick={() => setRounding("keep")} title="Leave as is">
                    <span className="mt-0.5 block text-xs text-zinc-500">Now: {currentStep ? `round down to ${peso(currentStep)}` : "exact amount"}</span>
                  </Card>
                  <Card on={rounding === null} onClick={() => setRounding(null)} title="Exact amount">
                    <span className="mt-0.5 block text-xs text-zinc-500">₱548.15 stays ₱548.15</span>
                  </Card>
                  {ROUNDING_STEPS.map((s) => (
                    <Card key={s} on={rounding === s} onClick={() => setRounding(s)} title={`Round down to ${peso(s)}`}>
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        ₱548.15 → {peso(Math.floor(548.15 / s) * s)}
                      </span>
                    </Card>
                  ))}
                </div>
                {roundingChanges && (
                  <div className="mt-3 rounded-xl border border-zinc-200 p-3">
                    <Examples
                      rows={exampleCheckouts({ roundingStep: rounding as number | null, rule: currentRule }).map((e, i) => ({
                        label: e.label,
                        before: exampleCheckouts({ roundingStep: currentStep, rule: currentRule })[i].charged,
                        after: e.charged,
                      }))}
                    />
                  </div>
                )}
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
            {!last && step > 0 && (
              <button type="button" onClick={() => setStep(STEPS.length - 1)} className="rounded-full px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100" title="Keep the rest as the style set it">
                Skip to the end
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onFinish({ template, ...(roundingChanges ? { roundingStep: rounding as number | null } : {}) }) : setStep(step + 1))}
              className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-white shadow ${
                last && roundingChanges ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {last ? (
                <>
                  <Sparkles className="h-4 w-4" /> {roundingChanges ? "Make my receipt & apply rounding" : "Make my receipt"}
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
        <div className="hidden w-[480px] shrink-0 flex-col bg-zinc-100 md:flex">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Live preview</span>
            <select className="ml-auto h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs" value={sampleKind} onChange={(e) => setSampleKind(e.target.value)}>
              <option value="regular">Regular sale</option>
              <option value="scpwd">Senior citizen</option>
              <option value="ewallet">E-wallet</option>
              {own.map((d) => (
                <option key={d.id} value={`discount:${d.id}`}>
                  With {d.name} discount
                </option>
              ))}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            {sample ? (
              <Preview template={template} data={sample} selected={null} onSelect={() => {}} interactive={false} />
            ) : (
              <p className="text-center text-sm text-zinc-400">Loading the sample sale…</p>
            )}
          </div>
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
