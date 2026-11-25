// "How was this computed?": every amount on a designed receipt, explained step
// by step with the sale's own numbers, plus the same computation as a formula
// the owner can change. Each formula reproduces the saved figure on every sale
// (explain.test.ts checks this on thousands of carts), so swapping a value for
// its formula changes nothing until the owner edits it.
import type { ReceiptData } from "@/types/receipt";
import { buildComputationLines, isSeniorOrPwd } from "@/lib/receipt";
import type { Block, RowCell, TotalsKey, TotalsLine } from "./types";
import { TOTALS_FIELDS } from "./totals";
import { computeFormula, FORMULA_VARIABLES } from "./formula";
import { forDesign } from "./layout";
import { newId } from "./blocks";

export interface Explanation {
  title: string; // what it is ("12% VAT")
  value: string | null; // as computed for this sale ("39.96"), null for text
  steps: string[]; // how it was worked out, with this sale's numbers
  formula: string | null; // the same computation as a formula; null = not computed (typed in, counted, a setting)
  source: string; // where the numbers come from
  note?: string;
}

const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const signed = (n: number) => (n < 0 ? `− ${n2(-n)}` : `+ ${n2(n)}`);

// Senior/PWD or another VAT-exempt discount: the VAT was taken off first.
const vatRemovedSale = (r: ReceiptData) => (r.vatExemptSales ?? 0) !== 0 || (r.vatRemovedFromVatable ?? 0) !== 0;

const itemList = (items: ReceiptData["items"]) => items.map((i) => `${i.name} ${n2(i.totalPrice)}`).join(" + ");

function discountPercent(r: ReceiptData): number | null {
  if (r.discountRate && /^[\d.]+%$/.test(r.discountRate)) return parseFloat(r.discountRate);
  return isSeniorOrPwd(r.discountType) ? 20 : null;
}

const SAVED = "Worked out at checkout and saved with the sale, so reprints show the same figure.";

// Text values: where each comes from.
const TEXT_SOURCES: Partial<Record<TotalsKey, string>> = {
  receiptNo: "The sale's AR number, given at checkout.",
  date: "The date of the sale (Philippine time), in the date format under How values are written.",
  time: "The time of the sale (Philippine time).",
  dateTime: "The date and time of the sale (Philippine time).",
  cashier: "Who completed the sale (their login or security code).",
  customer: "The customer picked at checkout.",
  branch: "The branch the sale was made at.",
  paymentMethod: "How the customer paid, picked at checkout.",
  ewalletRef: "The e-wallet reference number typed in at checkout.",
  discountName: "The discount picked at checkout (Settings › Discounts).",
  discountRate: "The discount's rate when the sale was made.",
  discountHolder: "The name typed in for the Senior/PWD ID holder.",
  discountIdNumber: "The OSCA/PWD ID number typed in at checkout.",
  originalReceiptNo: "On returns: the AR number of the sale the items came from.",
  rxNumber: "The prescription the sale was dispensed against.",
  doctor: "The prescribing doctor on the prescription.",
  doctorLicense: "The doctor's PRC license number (Prescriptions › Doctors).",
  rxInstructions: "The directions written on the prescription.",
};

// One value: what it is, how this sale got it, and the formula that gives the same figure.
export function explainKey(key: TotalsKey, sale: ReceiptData): Explanation {
  const r = forDesign(sale);
  const field = TOTALS_FIELDS[key];
  const raw = field.value(r);
  const value = typeof raw === "number" ? (field.format === "money" ? n2(raw) : String(raw)) : raw;
  const base = { title: field.name, value: value ?? null, source: SAVED, formula: null as string | null };
  const vg = r.vatableGross ?? 0;
  const nvg = r.nonVatableGross ?? 0;
  const vd = r.vatableDiscountAmount ?? 0;
  const nvd = r.nonVatableDiscountAmount ?? 0;
  const d = r.discountAmount ?? 0;
  const ve = r.vatExemptSales ?? 0;
  const removed = r.vatRemovedFromVatable ?? 0;
  const exempt = vatRemovedSale(r);
  const pct = discountPercent(r);
  const vatItems = r.items.filter((i) => i.isVatable);
  const nonVatItems = r.items.filter((i) => !i.isVatable);
  const adjust = (r.adjustmentAmount ?? 0) !== 0 || (r.roundingAmount ?? 0) !== 0;

  switch (key) {
    case "grossTotal":
      return { ...base, steps: [`Every item added up: ${itemList(r.items)} = ${n2(r.subtotal)}`], formula: "vatableGross + nonVatGross" };
    case "vatableGross":
      return {
        ...base,
        steps: vatItems.length ? [`Items with VAT, at their shelf price (VAT included): ${itemList(vatItems)} = ${n2(vg)}`] : ["No items with VAT on this sale: 0.00"],
        source: "The items marked VATable in Products, at the price they were sold.",
      };
    case "nonVatableGross":
      return {
        ...base,
        steps: nonVatItems.length ? [`Items without VAT: ${itemList(nonVatItems)} = ${n2(nvg)}`] : ["No items without VAT on this sale: 0.00"],
        source: "The items not marked VATable in Products (VAT-exempt medicines, for example).",
      };
    case "vatRemoved":
      return {
        ...base,
        steps: exempt
          ? [
              `Shelf prices include 12% VAT, so a price is 112% of the price without VAT.`,
              `Price without VAT: ${n2(vg)} ÷ 1.12 = ${n2(ve)}`,
              `VAT removed: ${n2(vg)} − ${n2(ve)} = ${n2(removed)}   (the same as ${n2(vg)} × 12 ÷ 112)`,
              `Senior/PWD (and other VAT-exempt) discounts take the VAT off first, as the law requires.`,
            ]
          : ["Only Senior/PWD and other VAT-exempt discounts take the VAT off. This sale has none: 0.00"],
        formula: "if(vatExempt != 0, vatableGross - cents(vatableGross / 1.12), 0)",
      };
    case "vatExemptSales":
      return {
        ...base,
        steps: exempt
          ? [`The items with VAT, without their VAT: ${n2(vg)} ÷ 1.12 = ${n2(ve)}`, `(${n2(vg)} − VAT removed ${n2(removed)} = ${n2(ve)})`]
          : ["Only Senior/PWD and other VAT-exempt discounts make items VAT-exempt. This sale has none: 0.00"],
        formula: "if(vatRemoved != 0, cents(vatableGross / 1.12), 0)",
      };
    case "vatableDiscount":
    case "nonVatableDiscount":
    case "discount": {
      if (d === 0) return { ...base, steps: ["No discount on this sale: 0.00"], formula: key === "discount" ? "vatableDiscount + nonVatDiscount" : null };
      const vatBase = exempt ? ve : vg;
      const usesPct = pct !== null && Math.abs(Math.round(vatBase * pct) / 100 - vd) < 0.006 && Math.abs(Math.round(nvg * pct) / 100 - nvd) < 0.006;
      const name = r.discountName || r.discountType || "Discount";
      const on = (part: string, b: number, amt: number) => (usesPct ? `${part}: ${pct}% of ${n2(b)} = ${n2(amt)}` : `${part}: ${n2(amt)}`);
      const steps = [
        usesPct
          ? `${name}: ${pct}% off${exempt ? ", taken from the price without VAT" : ""}.`
          : `${name}: ${r.discountRate ?? ""} off, shared between items with and without VAT by their size (it's a peso amount or has a limit).`,
        // Each part of the discount shows only its own line.
        ...(vg && key !== "nonVatableDiscount" ? [on(exempt ? "Items with VAT, without VAT" : "Items with VAT", vatBase, vd)] : []),
        ...(nvg && key !== "vatableDiscount" ? [on("Items without VAT", nvg, nvd)] : []),
        ...(key === "discount" && vg && nvg ? [`Discount: ${n2(vd)} + ${n2(nvd)} = ${n2(d)}`] : []),
      ];
      return {
        ...base,
        steps,
        formula: key === "discount" ? "vatableDiscount + nonVatDiscount" : null,
        source: "The discount's terms when the sale was made (Settings › Discounts), worked out at checkout.",
      };
    }
    case "totalSavings":
      return {
        ...base,
        steps: [`Discount ${n2(d)}${removed ? ` + VAT removed ${n2(removed)}` : ""} = ${n2(d + removed)}`],
        formula: "discount + vatRemoved",
      };
    case "vatAmount": {
      if (exempt) return { ...base, steps: ["Senior/PWD (VAT-exempt): the VAT was taken off the price, so no VAT is charged: 0.00"], formula: "if(vatExempt != 0, 0, cents((vatableGross - vatableDiscount) * (12 / 112)))" };
      const after = Math.round((vg - vd) * 100) / 100;
      return {
        ...base,
        steps: [
          ...(vd ? [`Items with VAT, after the discount: ${n2(vg)} − ${n2(vd)} = ${n2(after)}`] : [`Items with VAT: ${n2(vg)}`]),
          `Shelf prices already include 12% VAT, so the VAT inside is 12 out of every 112.`,
          `VAT: ${n2(after)} × 12 ÷ 112 = ${n2(r.taxAmount)}`,
          ...(adjust ? [`Your price formula or cash rounding changed this sale's total, and the VAT was recomputed on it.`] : []),
        ],
        formula: "if(vatExempt != 0, 0, cents((vatableGross - vatableDiscount) * (12 / 112)))",
      };
    }
    case "vatableSales":
      return {
        ...base,
        steps: exempt
          ? [`Items with VAT, without VAT ${n2(ve)} − discount on them ${n2(vd)} = ${n2(r.vatableSales ?? 0)}`]
          : [`Items with VAT ${n2(vg)}${vd ? ` − discount on them ${n2(vd)}` : ""} − VAT ${n2(r.taxAmount)} = ${n2(r.vatableSales ?? 0)}`],
        formula: "if(vatExempt != 0, vatExempt - vatableDiscount, vatableGross - vatableDiscount - vat)",
      };
    case "nonVatableSales":
      return { ...base, steps: [`Items without VAT ${n2(nvg)}${nvd ? ` − discount on them ${n2(nvd)}` : ""} = ${n2(r.nonVatableSales ?? 0)}`], formula: "nonVatGross - nonVatDiscount" };
    case "zeroRatedSales":
      return { ...base, steps: ["Nookly has no zero-rated sales: 0.00"] };
    case "totalDue": {
      const standard = exempt ? Math.round((ve + nvg - d) * 100) / 100 : Math.round((r.subtotal - d) * 100) / 100;
      const steps = exempt
        ? [
            `Items with VAT, without VAT ${n2(ve)} + items without VAT ${n2(nvg)} = ${n2(ve + nvg)}`,
            `Less the discount: ${n2(ve + nvg)} − ${n2(d)} = ${n2(standard)}`,
          ]
        : [`Subtotal ${n2(r.subtotal)} − discount ${n2(d)} = ${n2(standard)}`];
      if (r.adjustmentAmount) steps.push(`${r.adjustmentLabel || "Adjustment"} (your price formula): ${signed(r.adjustmentAmount)}`);
      if (r.roundingAmount) steps.push(`Cash rounding (down): ${signed(r.roundingAmount)}`);
      if (adjust) steps.push(`Total: ${n2(r.totalAmount)}`);
      return {
        ...base,
        steps,
        formula: "if(vatExempt != 0, vatExempt + nonVatGross, subtotal) - discount + adjustment + rounding",
        note: "This is what the POS charged. Changing the formula changes only what the receipt prints.",
      };
    }
    case "adjustment":
      return {
        ...base,
        steps: r.adjustmentAmount
          ? [`Your price formula "${r.adjustmentLabel || "Adjustment"}" (What the POS charges) moved the total by ${signed(r.adjustmentAmount)}.`]
          : ["Your price formula didn't change this sale."],
        source: "Receipt settings › What the POS charges › Price formula.",
      };
    case "rounding":
      return {
        ...base,
        steps: r.roundingAmount ? [`Cash rounding down: ${n2(r.totalAmount - r.roundingAmount)} → ${n2(r.totalAmount)} (${signed(r.roundingAmount)})`] : ["Not rounded: 0.00"],
        source: "Receipt settings › What the POS charges › Cash rounding.",
      };
    case "pointsUsed":
      return { ...base, steps: r.loyalty ? [`${r.loyalty.pointsRedeemed} points used, worth ${n2(r.loyalty.pointsAmount)}`] : ["No points used."], source: "Points used as payment at checkout, at that day's value per point." };
    case "amountPaid":
      return { ...base, steps: r.loyalty ? [`Total ${n2(r.totalAmount)} − points used ${n2(r.loyalty.pointsAmount)} = ${n2(r.totalAmount - r.loyalty.pointsAmount)}`] : ["No points used."], formula: "total - pointsUsed" };
    case "cash":
      return { ...base, steps: [r.cashReceived ? `Cash handed over, typed in at checkout: ${n2(r.cashReceived)}` : "Not a cash sale."], source: "Typed in by the cashier." };
    case "change": {
      const due = r.totalAmount - (r.loyalty?.pointsAmount ?? 0);
      return {
        ...base,
        steps: r.cashReceived ? [`Cash ${n2(r.cashReceived)} − amount due ${n2(due)} = ${n2(r.changeGiven ?? 0)}`] : ["Not a cash sale."],
        formula: r.loyalty ? "cash - amountPaid" : "cash - total",
      };
    }
    case "quantity":
      return { ...base, steps: [`Pieces added up: ${r.items.map((i) => i.quantity).join(" + ")} = ${raw}`], source: "Counted from the items." };
    case "itemCount":
      return { ...base, steps: [`${r.items.length} different product${r.items.length === 1 ? "" : "s"} on the sale.`], source: "Counted from the items." };
    case "pointsEarned":
      return { ...base, steps: [raw != null ? `${raw} points for the amount paid (Settings › Loyalty: one point per amount spent, rounded down).` : "No points earned."], source: "Loyalty settings when the sale was made." };
    case "pointsBalance":
      return { ...base, steps: [raw != null ? `The customer's points right after this sale: ${raw}` : "No loyalty points on this sale."], source: "The customer's points account." };
    default:
      return { ...base, steps: [value ? `Shows "${value}".` : "Empty on this sale, so the line doesn't print."], source: TEXT_SOURCES[key] ?? "From the sale." };
  }
}

// "subtotal - discount" with this sale's numbers: "405.50 - 0.00".
export function withNumbers(expr: string, sale: ReceiptData): string {
  const r = forDesign(sale);
  return expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    if (!Object.hasOwn(FORMULA_VARIABLES, name)) return name;
    const def = FORMULA_VARIABLES[name];
    const v = TOTALS_FIELDS[def.key].value(r);
    return typeof v === "number" ? (TOTALS_FIELDS[def.key].format === "money" ? n2(v) : String(v)) : def.zero ? "0.00" : `[no ${name}]`;
  });
}

function explainFormula(title: string, expr: string, sale: ReceiptData): Explanation {
  const v = computeFormula(expr, sale);
  return {
    title,
    value: v === null ? null : n2(v),
    steps: [`${expr}`, `= ${withNumbers(expr, sale)}`, v === null ? "No answer for this sale, so the line doesn't print." : `= ${n2(v)}`],
    formula: expr,
    source: "Your own formula (prints on the receipt only; the POS charges the standard computation).",
  };
}

// The standard step-by-step lines, each with how it was worked out.
export function explainComputation(sale: ReceiptData): Explanation {
  const r = forDesign(sale);
  const exempt = vatRemovedSale(r);
  const how = (key: TotalsKey) => explainKey(key, r).steps.filter((s) => /\d/.test(s)).slice(-1)[0] ?? "";
  const steps = buildComputationLines(r).map((l) => {
    const label = l.label;
    const why =
      label === "VATable Sales" ? how("vatableGross")
      : label === "Less: VAT (12%)" ? (exempt ? how("vatRemoved") : how("vatAmount"))
      : label === "VAT-Exempt Base" ? how("vatExemptSales")
      : label === "Net VATable Sales" ? how("vatableSales")
      : label === "Non-VAT Sales" ? how("nonVatableGross")
      : label === "Net Non-VAT Sales" ? how("nonVatableSales")
      : label === "Total Discount" ? how("discount")
      : label === "Total Savings" ? how("totalSavings")
      : label === "Rounding" ? how("rounding")
      : label.startsWith("Less:") ? (Math.abs(l.amount + (r.nonVatableDiscountAmount ?? 0)) < 0.005 && r.nonVatableDiscountAmount ? how("nonVatableDiscount") : how("vatableDiscount"))
      : how("adjustment");
    return `${label}: ${n2(l.amount)}  ←  ${why}`;
  });
  return {
    title: "Step-by-step computation",
    value: null,
    steps,
    formula: null,
    source: SAVED,
    note: "Use \"Split into lines\" to get each step as its own line you can change.",
  };
}

const cellExplanation = (c: RowCell, sale: ReceiptData): Explanation | null =>
  c.kind === "field" ? explainKey(c.key, sale) : c.kind === "formula" ? explainFormula(c.label || "Formula", c.expr, sale) : null;

// Everything a selected part of the receipt shows, explained.
export function explainPart(block: Block, lineId: string | null, sale: ReceiptData): Explanation[] {
  switch (block.type) {
    case "field":
      return [explainKey(block.key, sale)];
    case "formula":
      return [explainFormula(block.label || "Your formula", block.expr, sale)];
    case "row":
      return block.cells.map((c) => cellExplanation(c, sale)).filter((e): e is Explanation => e !== null);
    case "totals": {
      const lines = lineId ? block.lines.filter((l) => l.id === lineId) : block.lines;
      return lines.flatMap((l): Explanation[] =>
        l.kind === "value" ? [explainKey(l.key, sale)]
        : l.kind === "formula" ? [explainFormula(l.label || "Your formula", l.expr, sale)]
        : l.kind === "computation" ? [explainComputation(sale)]
        : []
      );
    }
    case "saleDetails":
      return block.fields.filter((f) => f.visible).map((f) => explainKey(f.key, sale));
    case "payment":
      return (["paymentMethod", "ewalletRef", "pointsUsed", "amountPaid", "cash", "change"] as TotalsKey[])
        .filter((k) => TOTALS_FIELDS[k].value(forDesign(sale)) != null)
        .map((k) => explainKey(k, sale));
    case "loyalty":
      return [explainKey("pointsEarned", sale), explainKey("pointsBalance", sale)];
    case "items": {
      const r = forDesign(sale);
      return [
        {
          title: "Item lines",
          value: null,
          steps: r.items.map((i) => `${i.name}: ${i.quantity} × ${n2(i.unitPrice)} = ${n2(i.totalPrice)}${i.isVatable ? " (with VAT)" : " (no VAT)"}`),
          formula: null,
          source: "Each item as sold: quantity × the price it was sold at. With VAT or not is set per product in Products.",
        },
        explainKey("quantity", sale),
      ];
    }
    case "storeInfo":
    case "title":
    case "logo":
      return [{ title: "Store details", value: null, steps: [], formula: null, source: "Settings › Receipt (store name, address, TIN…). Other branches print their own name and address." }];
    case "remarks":
      return [{ title: "Remarks", value: null, steps: [], formula: null, source: "The remarks typed in at checkout or on the order." }];
    case "scPwd":
      return [explainKey("discountHolder", sale), explainKey("discountIdNumber", sale)];
    default:
      return [{ title: "Your own text", value: null, steps: [], formula: null, source: "Exactly as typed in this design; {values} in it are filled from the sale." }];
  }
}

// ---------- changing a computation ----------

// A value line that prints the same figure, as a formula the owner can edit.
export function valueLineAsFormula(line: Extract<TotalsLine, { kind: "value" }>, formula: string): TotalsLine {
  return {
    id: line.id,
    kind: "formula",
    label: line.label,
    expr: formula,
    format: "money",
    decimals: 2,
    style: line.style,
    minus: line.minus,
    hideWhenZero: line.hideWhenZero,
    ...(line.layout ? { layout: line.layout } : {}),
    ...(line.align ? { align: line.align } : {}),
    ...(line.showWhen ? { showWhen: line.showWhen } : {}),
  };
}

export function fieldAsFormula(block: Extract<Block, { type: "field" }>, formula: string): Block {
  const { key: _key, ...rest } = block;
  void _key;
  return { ...rest, type: "formula", expr: formula, format: "money", decimals: 2 };
}

const vline = (key: TotalsKey, label: string, extra: Partial<Extract<TotalsLine, { kind: "value" }>> = {}): TotalsLine => ({
  id: newId("t"),
  kind: "value",
  key,
  label,
  style: {},
  minus: false,
  hideWhenZero: true,
  ...extra,
});
const fline = (label: string, expr: string, extra: Partial<Extract<TotalsLine, { kind: "formula" }>> = {}): TotalsLine => ({
  id: newId("t"),
  kind: "formula",
  label,
  expr,
  format: "money",
  decimals: 2,
  style: {},
  minus: false,
  hideWhenZero: true,
  ...extra,
});

// The step-by-step computation as separate lines, each one changeable. Lines
// that don't apply to a sale print as zero and are hidden, so a regular sale
// and a Senior/PWD sale each show their own steps.
export function computationAsLines(): TotalsLine[] {
  const bold = { bold: true };
  return [
    vline("vatableGross", "VATable Sales:", { style: bold }),
    vline("vatRemoved", "Less: VAT (12%):", { minus: true }),
    fline("VAT-Exempt Base:", "if(vatableDiscount != 0, vatExempt, 0)", { style: bold }),
    vline("vatableDiscount", "Less: {discountName} Discount ({discountRate}):", { minus: true }),
    // The standard computation's own VAT and nets (before your price formula or cash
    // rounding, which follow as their own lines), worked out the way the checkout does.
    fline("Less: VAT (12%):", "if(vatExempt != 0, 0, cents((vatableGross - vatableDiscount) * (12 / 112)))", { minus: true }),
    fline(
      "Net VATable Sales:",
      "if(vatableGross != 0, if(vatExempt != 0, vatExempt - vatableDiscount, vatableGross - vatableDiscount - cents((vatableGross - vatableDiscount) * (12 / 112))), 0)",
      { style: bold }
    ),
    vline("nonVatableGross", "Non-VAT Sales:", { style: bold }),
    vline("nonVatableDiscount", "Less: {discountName} Discount ({discountRate}):", { minus: true }),
    fline("Net Non-VAT Sales:", "if(nonVatDiscount != 0, nonVatGross - nonVatDiscount, 0)", { style: bold }),
    vline("discount", "Total Discount:", { minus: true }),
    fline("Total Savings:", "if(vatRemoved != 0, discount + vatRemoved, 0)", { style: bold }),
    vline("adjustment", "{adjustmentLabel}:"),
    vline("rounding", "Rounding:"),
  ];
}
