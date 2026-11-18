"use client";

import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import type { Align, Block, FieldLayout, PrintMode, RuleChar, SaleDetailField, StoreField, TotalsKey, TotalsLine } from "@/lib/receipt-designer/types";
import { FIELDS_BY_NAME, LABEL_TOKENS, TOTALS_FIELDS } from "@/lib/receipt-designer/totals";
import { BLOCK_LABELS, CAN_BREAK_APART, newId, valueLine } from "@/lib/receipt-designer/blocks";
import StyleEditor from "./StyleEditor";

const input = "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-emerald-500";
const small = "text-xs font-medium text-zinc-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={small}>{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
      {label}
    </label>
  );
}

const RULES: { value: RuleChar; label: string }[] = [
  { value: "-", label: "- - - -" },
  { value: "=", label: "= = = =" },
  { value: ".", label: ". . . ." },
  { value: "*", label: "* * * *" },
  { value: " ", label: "Blank line" },
];

function RuleSelect({ value, onChange, allowNone = false }: { value: RuleChar | null; onChange: (v: RuleChar | null) => void; allowNone?: boolean }) {
  return (
    <select className={input} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as RuleChar | null)}>
      {allowNone && <option value="">None</option>}
      {RULES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function AlignButtons({ value, onChange }: { value: Align; onChange: (a: Align) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-zinc-200">
      {(["left", "center", "right"] as Align[]).map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={`px-3 py-1 text-xs capitalize ${value === a ? "bg-emerald-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-zinc-100 pt-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

const STORE_FIELDS: { key: StoreField; label: string }[] = [
  { key: "name", label: "Store name" },
  { key: "address", label: "Address (branch's own at branches)" },
  { key: "contact", label: "Contact number" },
  { key: "tin", label: "TIN" },
  { key: "permit", label: "Permit no." },
  { key: "accreditation", label: "Accreditation no." },
  { key: "serial", label: "Serial no." },
];

const DETAIL_NAMES: Record<SaleDetailField["key"], string> = {
  receiptNo: "AR number",
  date: "Date",
  time: "Time",
  cashier: "Cashier",
  customer: "Customer (when there is one)",
  branch: "Branch",
};

export default function Inspector({
  block,
  printMode,
  onChange,
  onBreakApart,
}: {
  block: Block;
  printMode: PrintMode;
  onChange: (block: Block) => void;
  onBreakApart?: () => void;
}) {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {block.type === "field" ? TOTALS_FIELDS[block.key].name : BLOCK_LABELS[block.type]}
        </p>
        <Check checked={block.visible} onChange={(v) => set({ visible: v })} label="Show this block" />
        {onBreakApart && CAN_BREAK_APART.includes(block.type) && (
          <button
            type="button"
            onClick={onBreakApart}
            className="mt-2 w-full rounded-md border border-dashed border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            title="Turn each line into its own element you can move anywhere"
          >
            {block.type === "items" ? "Separate the item count from the list" : "Break apart into separate elements"}
          </button>
        )}
      </div>

      <TypeFields block={block} printMode={printMode} onChange={onChange} />

      <Section title="Look">
        {block.type !== "rule" && block.type !== "barcode" && (
          <div className="space-y-1">
            <span className={small}>Alignment</span>
            <div>
              <AlignButtons value={block.align} onChange={(a) => set({ align: a })} />
            </div>
          </div>
        )}
        <StyleEditor value={block.style} onChange={(style) => set({ style })} printMode={printMode} />
      </Section>

      <Section title="Spacing & dividers" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Blank lines above">
            <input type="number" min={0} max={5} className={input} value={block.spaceBefore} onChange={(e) => set({ spaceBefore: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Blank lines below">
            <input type="number" min={0} max={5} className={input} value={block.spaceAfter} onChange={(e) => set({ spaceAfter: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Divider above">
            <RuleSelect allowNone value={block.ruleBefore} onChange={(v) => set({ ruleBefore: v })} />
          </Field>
          <Field label="Divider below">
            <RuleSelect allowNone value={block.ruleAfter} onChange={(v) => set({ ruleAfter: v })} />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400">Dividers on a block only print when the block itself prints.</p>
      </Section>
    </div>
  );
}

function TypeFields({ block, printMode, onChange }: { block: Block; printMode: PrintMode; onChange: (b: Block) => void }) {
  const set = <B extends Block>(patch: Partial<B>) => onChange({ ...block, ...patch } as Block);

  switch (block.type) {
    case "logo":
      return (
        <Field label={`Width: ${block.widthPct}% of the paper`}>
          <input type="range" min={10} max={100} value={block.widthPct} onChange={(e) => set({ widthPct: Number(e.target.value) })} className="w-full accent-emerald-600" />
          <p className="text-[11px] text-zinc-400">Upload the logo under Receipt settings (click an empty spot in the preview).</p>
        </Field>
      );

    case "storeInfo":
      return (
        <div className="space-y-2">
          {STORE_FIELDS.map((f) => (
            <Check key={f.key} checked={block.fields[f.key]} onChange={(v) => set({ fields: { ...block.fields, [f.key]: v } })} label={f.label} />
          ))}
          <p className="text-[11px] text-zinc-400">The details themselves come from Settings › Receipt.</p>
          <Section title="Store name look" defaultOpen={false}>
            <StyleEditor value={block.nameStyle} onChange={(nameStyle) => set({ nameStyle })} printMode={printMode} />
          </Section>
        </div>
      );

    case "title":
      return (
        <div className="space-y-2">
          <Field label="Title">
            <input className={input} value={block.text} placeholder="Same as Settings › Receipt" onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <Check checked={block.uppercase} onChange={(v) => set({ uppercase: v })} label="ALL CAPS" />
          <p className="text-[11px] text-zinc-400">&quot;Official Receipt&quot; and &quot;Sales Invoice&quot; can&apos;t be used: Nookly receipts aren&apos;t BIR-accredited.</p>
        </div>
      );

    case "saleDetails":
      return (
        <div className="space-y-2">
          {block.fields.map((f, i) => (
            <div key={f.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.visible}
                onChange={(e) => set({ fields: block.fields.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)) })}
                className="h-4 w-4 accent-emerald-600"
                title={DETAIL_NAMES[f.key]}
              />
              <input
                className={input}
                value={f.label}
                title={DETAIL_NAMES[f.key]}
                onChange={(e) => set({ fields: block.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <div className="flex flex-col">
                <button type="button" disabled={i === 0} onClick={() => set({ fields: arrayMove(block.fields, i, i - 1) })} className="px-1 text-xs text-zinc-400 hover:text-zinc-800 disabled:opacity-30" title="Move up">▲</button>
                <button type="button" disabled={i === block.fields.length - 1} onClick={() => set({ fields: arrayMove(block.fields, i, i + 1) })} className="px-1 text-xs text-zinc-400 hover:text-zinc-800 disabled:opacity-30" title="Move down">▼</button>
              </div>
            </div>
          ))}
        </div>
      );

    case "items":
      return (
        <div className="space-y-2">
          <Check checked={block.header} onChange={(v) => set({ header: v })} label="Column header" />
          {block.header && (
            <div className="grid grid-cols-2 gap-2">
              <input className={input} value={block.headerLeft} onChange={(e) => set({ headerLeft: e.target.value })} />
              <input className={input} value={block.headerRight} onChange={(e) => set({ headerRight: e.target.value })} />
            </div>
          )}
          {block.header && <Check checked={block.headerRule} onChange={(v) => set({ headerRule: v })} label="Divider under the header" />}
          <Check checked={block.showVatMarker} onChange={(v) => set({ showVatMarker: v })} label="V / N marker (VAT or non-VAT)" />
          <Check checked={block.showGenericName} onChange={(v) => set({ showGenericName: v })} label="Generic name under each item" />
          <Check checked={block.showItemCount} onChange={(v) => set({ showItemCount: v })} label="Item count line" />
          {block.showItemCount && (
            <>
              <Field label="Count">
                <select className={input} value={block.countMode} onChange={(e) => set({ countMode: e.target.value as "pieces" | "products" })}>
                  <option value="pieces">Pieces (2 Biogesic + 2 Alaxan = 4)</option>
                  <option value="products">Products (2 Biogesic + 2 Alaxan = 2)</option>
                </select>
              </Field>
              <input className={input} value={block.itemCountLabel} onChange={(e) => set({ itemCountLabel: e.target.value })} />
              <Check checked={block.countRule} onChange={(v) => set({ countRule: v })} label="Divider above the count" />
            </>
          )}
          <Section title="Item name look" defaultOpen={false}>
            <StyleEditor value={block.nameStyle} onChange={(nameStyle) => set({ nameStyle })} printMode={printMode} />
          </Section>
          {block.header && (
            <Section title="Header look" defaultOpen={false}>
              <StyleEditor value={block.headerStyle} onChange={(headerStyle) => set({ headerStyle })} printMode={printMode} />
            </Section>
          )}
        </div>
      );

    case "totals":
      return <TotalsEditor lines={block.lines} printMode={printMode} onChange={(lines) => set({ lines })} />;

    case "scPwd":
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">Prints only on senior citizen and PWD sales: the title, name, ID number and a signature line.</p>
          <Section title="Title look" defaultOpen={false}>
            <StyleEditor value={block.titleStyle} onChange={(titleStyle) => set({ titleStyle })} printMode={printMode} />
          </Section>
        </div>
      );

    case "payment":
      return (
        <div className="space-y-2">
          <Check checked={block.showMethod} onChange={(v) => set({ showMethod: v })} label="Payment method" />
          <Check checked={block.methodAsPair} onChange={(v) => set({ methodAsPair: v })} label="Method and ref. on the right side" />
          <Check checked={block.showReference} onChange={(v) => set({ showReference: v })} label="E-wallet reference no." />
          <Check checked={block.showCash} onChange={(v) => set({ showCash: v })} label="Cash received" />
          <Check checked={block.showChange} onChange={(v) => set({ showChange: v })} label="Change" />
          <Check checked={block.showPointsPaid} onChange={(v) => set({ showPointsPaid: v })} label="Points used & amount paid" />
          <Check checked={block.showPointsEarned} onChange={(v) => set({ showPointsEarned: v })} label="Points earned" />
          <Check checked={block.showPointsBalance} onChange={(v) => set({ showPointsBalance: v })} label="Points balance" />
        </div>
      );

    case "loyalty":
      return (
        <div className="space-y-2">
          <Check checked={block.showEarned} onChange={(v) => set({ showEarned: v })} label="Points earned" />
          <Check checked={block.showBalance} onChange={(v) => set({ showBalance: v })} label="Points balance" />
          <p className="text-[11px] text-zinc-400">Prints only on sales with loyalty points.</p>
        </div>
      );

    case "remarks":
      return (
        <div className="space-y-2">
          <Field label="Heading">
            <input className={input} value={block.heading} onChange={(e) => set({ heading: e.target.value })} />
          </Field>
          <p className="text-[11px] text-zinc-400">Prints the order notes from checkout, when there are any.</p>
          <Section title="Heading look" defaultOpen={false}>
            <StyleEditor value={block.headingStyle} onChange={(headingStyle) => set({ headingStyle })} printMode={printMode} />
          </Section>
        </div>
      );

    case "text":
      return (
        <Field label="Text">
          <textarea rows={4} className={`${input} h-auto py-1.5`} value={block.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      );

    case "qr":
      return (
        <div className="space-y-2">
          <Field label="Link or text in the QR code">
            <input className={input} value={block.content} placeholder="https://facebook.com/yourpharmacy" onChange={(e) => set({ content: e.target.value })} />
          </Field>
          <Field label={`Size: ${block.sizePct}% of the paper`}>
            <input type="range" min={20} max={100} value={block.sizePct} onChange={(e) => set({ sizePct: Number(e.target.value) })} className="w-full accent-emerald-600" />
          </Field>
          <Field label="Caption under it">
            <input className={input} value={block.caption} onChange={(e) => set({ caption: e.target.value })} />
          </Field>
        </div>
      );

    case "barcode":
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">The AR number as a barcode, for scanning at returns and reprints.</p>
          <Field label={`Height: ${block.height} dots`}>
            <input type="range" min={30} max={160} value={block.height} onChange={(e) => set({ height: Number(e.target.value) })} className="w-full accent-emerald-600" />
          </Field>
          <Check checked={block.showText} onChange={(v) => set({ showText: v })} label="Number under the bars" />
        </div>
      );

    case "rule":
      return (
        <Field label="Divider">
          <RuleSelect value={block.char} onChange={(v) => set({ char: v ?? "-" })} />
        </Field>
      );

    case "field":
      return (
        <FieldOptions
          showAlign={false}
          value={{ key: block.key, label: block.label, layout: block.layout, align: block.align, minus: block.minus, hideWhenZero: block.hideWhenZero }}
          onChange={(patch) => set(patch as Partial<Block>)}
        />
      );

    case "footer":
      return (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">
            Prints the thank-you message from Settings › Receipt, and the notice that the receipt isn&apos;t BIR-accredited. The notice can&apos;t be
            removed; it prints even without this block.
          </p>
          <Check checked={block.noticeFirst} onChange={(v) => set({ noticeFirst: v })} label="Notice above the message" />
        </div>
      );
  }
}

// ---------- Totals: lines the owner picks, orders, names and styles ----------

interface FieldValue {
  key: TotalsKey;
  label: string;
  layout: FieldLayout;
  align: Align;
  minus: boolean;
  hideWhenZero: boolean;
}

// What one value shows and how it sits on its line. Used for a value inside a
// group and for a value that's its own element.
function FieldOptions({ value, onChange, showAlign = true }: { value: FieldValue; onChange: (patch: Partial<FieldValue>) => void; showAlign?: boolean }) {
  const f = TOTALS_FIELDS[value.key];
  return (
    <div className="space-y-2">
      <Field label="Shows">
        <select
          className={input}
          value={value.key}
          onChange={(e) => {
            const key = e.target.value as TotalsKey;
            // Keep a label the owner typed; follow the new value's own label otherwise.
            onChange({ key, ...(value.label === f.label ? { label: TOTALS_FIELDS[key].label } : {}) });
          }}
        >
          {FIELDS_BY_NAME.map((k) => (
            <option key={k} value={k}>
              {TOTALS_FIELDS[k].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label">
        <input className={input} value={value.label} placeholder="(no label)" onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <p className="text-[11px] text-zinc-400">
        Can include {LABEL_TOKENS.map((t) => `${t.token} (${t.name})`).join(", ")}.
      </p>
      <Field label="Line">
        <select className={input} value={value.layout} onChange={(e) => onChange({ layout: e.target.value as FieldLayout })}>
          <option value="pair">Label left, value right</option>
          <option value="inline">Label: value</option>
          <option value="value">Value only</option>
        </select>
      </Field>
      {showAlign && value.layout !== "pair" && (
        <div>
          <AlignButtons value={value.align} onChange={(align) => onChange({ align })} />
        </div>
      )}
      {f.format === "money" && <Check checked={value.minus} onChange={(v) => onChange({ minus: v })} label="Show as minus (−₱)" />}
      {f.format !== "text" && <Check checked={value.hideWhenZero} onChange={(v) => onChange({ hideWhenZero: v })} label="Hide when zero" />}
      <p className="text-[11px] text-zinc-400">Prints only on sales where it applies (e.g. points only on sales with points).</p>
    </div>
  );
}


function lineTitle(l: TotalsLine) {
  if (l.kind === "value") return l.label || TOTALS_FIELDS[l.key].name;
  if (l.kind === "heading") return l.text || "Heading";
  if (l.kind === "rule") return `Divider ${l.char === " " ? "(blank)" : l.char.repeat(4)}`;
  return "Standard computation (step by step)";
}

function TotalsEditor({ lines, printMode, onChange }: { lines: TotalsLine[]; printMode: PrintMode; onChange: (l: TotalsLine[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = lines.findIndex((l) => l.id === e.active.id);
    const to = lines.findIndex((l) => l.id === e.over!.id);
    onChange(arrayMove(lines, from, to));
  };
  const update = (id: string, patch: Partial<TotalsLine>) => onChange(lines.map((l) => (l.id === id ? ({ ...l, ...patch } as TotalsLine) : l)));

  const add = (what: string) => {
    if (!what) return;
    const line: TotalsLine =
      what === "heading"
        ? { id: newId("t"), kind: "heading", text: "VAT BREAKDOWN", align: "left", style: { bold: true } }
        : what === "rule"
        ? { id: newId("t"), kind: "rule", char: "-" }
        : what === "computation"
        ? { id: newId("t"), kind: "computation", style: {} }
        : valueLine(what as TotalsKey);
    onChange([...lines, line]);
    setOpen(line.id);
    setAdding("");
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-500">Pick the lines, drag to order them, and rename or style each one. The amounts always come from the sale.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {lines.map((l) => (
              <TotalsLineRow
                key={l.id}
                line={l}
                open={open === l.id}
                onToggle={() => setOpen(open === l.id ? null : l.id)}
                onChange={(patch) => update(l.id, patch)}
                onRemove={() => onChange(lines.filter((x) => x.id !== l.id))}
                printMode={printMode}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-emerald-600" />
        <select className={input} value={adding} onChange={(e) => add(e.target.value)}>
          <option value="">Add a line (any value)…</option>
          {FIELDS_BY_NAME.map((k) => (
            <option key={k} value={k}>
              {TOTALS_FIELDS[k].name}
            </option>
          ))}
          <optgroup label="Layout">
            <option value="heading">Heading (e.g. VAT BREAKDOWN)</option>
            <option value="rule">Divider</option>
            <option value="computation">Standard computation (step by step)</option>
          </optgroup>
        </select>
      </div>
    </div>
  );
}

function TotalsLineRow({
  line,
  open,
  onToggle,
  onChange,
  onRemove,
  printMode,
}: {
  line: TotalsLine;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<TotalsLine>) => void;
  onRemove: () => void;
  printMode: PrintMode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: line.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border bg-white ${isDragging ? "z-10 border-emerald-400 shadow" : "border-zinc-200"}`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none p-1 text-zinc-400" aria-label="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-sm text-zinc-800">
          {lineTitle(line)}
          {line.kind === "value" && line.label.replace(/:$/, "") !== TOTALS_FIELDS[line.key].name && (
            <span className="ml-1 text-[11px] text-zinc-400">({TOTALS_FIELDS[line.key].name})</span>
          )}
        </button>
        <button type="button" onClick={onRemove} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Remove line">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-zinc-100 p-2">
          {line.kind === "value" && (
            <>
              <FieldOptions
                value={{ key: line.key, label: line.label, layout: line.layout ?? "pair", align: line.align ?? "left", minus: line.minus, hideWhenZero: line.hideWhenZero }}
                onChange={(patch) => onChange(patch as Partial<TotalsLine>)}
              />
              <StyleEditor compact value={line.style} onChange={(style) => onChange({ style })} printMode={printMode} />
            </>
          )}
          {line.kind === "heading" && (
            <>
              <input className={input} value={line.text} onChange={(e) => onChange({ text: e.target.value })} />
              <AlignButtons value={line.align} onChange={(align) => onChange({ align })} />
              <StyleEditor compact value={line.style} onChange={(style) => onChange({ style })} printMode={printMode} />
            </>
          )}
          {line.kind === "rule" && <RuleSelect value={line.char} onChange={(v) => onChange({ char: v ?? "-" })} />}
          {line.kind === "computation" && (
            <>
              <p className="text-[11px] text-zinc-500">
                The same step-by-step lines as today&apos;s receipt (Total Sales, Less VAT, Less Discount, Total Savings…). Their wording changes with the
                discount used.
              </p>
              <StyleEditor compact value={line.style} onChange={(style) => onChange({ style })} printMode={printMode} />
            </>
          )}
        </div>
      )}
    </li>
  );
}
