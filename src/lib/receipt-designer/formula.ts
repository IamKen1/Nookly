// Owner-written formulas for the receipt, e.g. `total / 1.12` or
// `round(totalSavings / subtotal * 100, 0)`. Display only: they never change
// what was charged. Parsed by hand (no eval), so a formula can only do math.
//
// Grammar:
//   expr    := or
//   or      := and ("or" and | "||" and)*
//   and     := compare ("and" compare | "&&" compare)*
//   compare := sum (("==" | "!=" | ">=" | "<=" | ">" | "<") sum)?
//   sum     := product (("+" | "-") product)*
//   product := unary (("*" | "/" | "%" | "×" | "÷") unary)*
//   unary   := ("-" | "+" | "not" | "!") unary | atom
//   atom    := number | variable | name "(" args ")" | "(" expr ")"

import type { ReceiptData } from "@/types/receipt";
import { TOTALS_FIELDS } from "./totals";
import type { TotalsKey } from "./types";

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

// Short names owners type, each mapped to a value from the sale.
// zero: counts as 0 on sales without it (instead of the formula having no answer),
// for amounts that are simply nothing when they don't apply.
export const FORMULA_VARIABLES: Record<string, { key: TotalsKey; name: string; zero?: boolean }> = {
  subtotal: { key: "grossTotal", name: "Subtotal (before discount)" },
  total: { key: "totalDue", name: "Total amount due" },
  adjustment: { key: "adjustment", name: "Price adjustment (your formula)", zero: true },
  rounding: { key: "rounding", name: "Cash rounding", zero: true },
  vat: { key: "vatAmount", name: "12% VAT" },
  vatableSales: { key: "vatableSales", name: "VATable sales" },
  vatExempt: { key: "vatExemptSales", name: "VAT-exempt sales" },
  zeroRated: { key: "zeroRatedSales", name: "Zero-rated sales" },
  nonVat: { key: "nonVatableSales", name: "Non-VAT sales" },
  vatableGross: { key: "vatableGross", name: "VATable items (before discount)" },
  nonVatGross: { key: "nonVatableGross", name: "Non-VAT items (before discount)" },
  discount: { key: "discount", name: "Discount" },
  vatableDiscount: { key: "vatableDiscount", name: "Discount on items with VAT" },
  nonVatDiscount: { key: "nonVatableDiscount", name: "Discount on non-VAT items" },
  vatRemoved: { key: "vatRemoved", name: "VAT removed (SC/PWD)" },
  savings: { key: "totalSavings", name: "Total savings" },
  pieces: { key: "quantity", name: "Total items (pieces)" },
  products: { key: "itemCount", name: "Number of products" },
  cash: { key: "cash", name: "Cash received" },
  change: { key: "change", name: "Change" },
  pointsUsed: { key: "pointsUsed", name: "Points used (peso value)" },
  amountPaid: { key: "amountPaid", name: "Amount paid (after points)" },
  pointsEarned: { key: "pointsEarned", name: "Points earned" },
  pointsBalance: { key: "pointsBalance", name: "Points balance" },
};

const FUNCTIONS: Record<string, { min: number; max: number; help: string }> = {
  round: { min: 1, max: 2, help: "round(x, decimals)" },
  cents: { min: 1, max: 1, help: "cents(x): to centavos exactly like the checkout" },
  floor: { min: 1, max: 1, help: "floor(x)" },
  ceil: { min: 1, max: 1, help: "ceil(x)" },
  abs: { min: 1, max: 1, help: "abs(x)" },
  min: { min: 2, max: 10, help: "min(a, b, …)" },
  max: { min: 2, max: 10, help: "max(a, b, …)" },
  if: { min: 3, max: 3, help: "if(condition, then, otherwise)" },
};
export const FORMULA_FUNCTIONS = Object.values(FUNCTIONS).map((f) => f.help);

export class FormulaError extends Error {}

const MAX_LENGTH = 300;

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|==|!=|>=|<=|&&|\|\||[-+*/%×÷()<>,!])/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`Can't read "${src.slice(pos).trim().slice(0, 12)}"`);
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

export function parseFormula(src: string): Node {
  if (src.length > MAX_LENGTH) throw new FormulaError(`Formulas can be at most ${MAX_LENGTH} characters.`);
  if (!src.trim()) throw new FormulaError("Type a formula.");
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const take = (t?: string) => {
    const tok = tokens[i];
    if (t !== undefined && tok !== t) throw new FormulaError(tok === undefined ? `Missing "${t}"` : `Expected "${t}" but found "${tok}"`);
    i++;
    return tok;
  };
  let depth = 0;

  const expr = (): Node => {
    if (++depth > 40) throw new FormulaError("Formula is nested too deeply.");
    const n = or();
    depth--;
    return n;
  };
  const or = (): Node => {
    let n = and();
    while (peek() === "or" || peek() === "||") {
      take();
      n = { t: "bin", op: "or", a: n, b: and() };
    }
    return n;
  };
  const and = (): Node => {
    let n = compare();
    while (peek() === "and" || peek() === "&&") {
      take();
      n = { t: "bin", op: "and", a: n, b: compare() };
    }
    return n;
  };
  const compare = (): Node => {
    const n = sum();
    if (["==", "!=", ">=", "<=", ">", "<"].includes(peek())) {
      const op = take();
      return { t: "bin", op, a: n, b: sum() };
    }
    return n;
  };
  const sum = (): Node => {
    let n = product();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      n = { t: "bin", op, a: n, b: product() };
    }
    return n;
  };
  const product = (): Node => {
    let n = unary();
    while (["*", "/", "%", "×", "÷"].includes(peek())) {
      const op = take();
      n = { t: "bin", op: op === "×" ? "*" : op === "÷" ? "/" : op, a: n, b: unary() };
    }
    return n;
  };
  const unary = (): Node => {
    const p = peek();
    if (p === "-" || p === "+" || p === "!" || p === "not") {
      take();
      return { t: "un", op: p === "not" ? "!" : p, a: unary() };
    }
    return atom();
  };
  const atom = (): Node => {
    const tok = take();
    if (tok === undefined) throw new FormulaError("The formula ends too early.");
    if (/^(\d|\.)/.test(tok)) return { t: "num", v: Number(tok) };
    if (tok === "(") {
      const n = expr();
      take(")");
      return n;
    }
    if (/^[A-Za-z_]/.test(tok)) {
      if (peek() === "(") {
        const fn = tok.toLowerCase();
        const spec = Object.hasOwn(FUNCTIONS, fn) ? FUNCTIONS[fn] : undefined;
        if (!spec) throw new FormulaError(`Unknown function "${tok}". Use ${Object.keys(FUNCTIONS).join(", ")}.`);
        take("(");
        const args: Node[] = [];
        if (peek() !== ")") {
          args.push(expr());
          while (peek() === ",") {
            take(",");
            args.push(expr());
          }
        }
        take(")");
        if (args.length < spec.min || args.length > spec.max) throw new FormulaError(`${spec.help} takes ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`} value${spec.max > 1 ? "s" : ""}.`);
        return { t: "call", fn, args };
      }
      if (tok === "true" || tok === "false") return { t: "num", v: tok === "true" ? 1 : 0 };
      if (!Object.hasOwn(FORMULA_VARIABLES, tok)) throw new FormulaError(`Unknown value "${tok}".`);
      return { t: "var", name: tok };
    }
    throw new FormulaError(`Unexpected "${tok}"`);
  };

  const tree = expr();
  if (i < tokens.length) throw new FormulaError(`Unexpected "${tokens[i]}"`);
  return tree;
}

// Returns null when a value used doesn't apply to this sale (e.g. points on a
// sale without points) or the math has no answer (division by zero).
export function evaluateFormula(tree: Node, data: ReceiptData): number | null {
  const ev = (n: Node): number | null => {
    switch (n.t) {
      case "num":
        return n.v;
      case "var": {
        const def = FORMULA_VARIABLES[n.name];
        const v = TOTALS_FIELDS[def.key].value(data);
        return typeof v === "number" ? v : def.zero ? 0 : null;
      }
      case "un": {
        const a = ev(n.a);
        if (a === null) return null;
        return n.op === "-" ? -a : n.op === "!" ? (a ? 0 : 1) : a;
      }
      case "bin": {
        // and/or short-circuit like a person reads them
        if (n.op === "and") {
          const a = ev(n.a);
          if (a === null) return null;
          if (!a) return 0;
          const b = ev(n.b);
          return b === null ? null : b ? 1 : 0;
        }
        if (n.op === "or") {
          const a = ev(n.a);
          if (a) return 1;
          const b = ev(n.b);
          return a === null && b === null ? null : b ? 1 : 0;
        }
        const a = ev(n.a);
        const b = ev(n.b);
        if (a === null || b === null) return null;
        switch (n.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? null : a / b;
          case "%": return b === 0 ? null : a % b;
          case "==": return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case "!=": return Math.abs(a - b) < 1e-9 ? 0 : 1;
          case ">": return a > b ? 1 : 0;
          case "<": return a < b ? 1 : 0;
          case ">=": return a >= b - 1e-9 ? 1 : 0;
          case "<=": return a <= b + 1e-9 ? 1 : 0;
        }
        return null;
      }
      case "call": {
        if (n.fn === "if") {
          const c = ev(n.args[0]);
          if (c === null) return null;
          return ev(c ? n.args[1] : n.args[2]);
        }
        const args = n.args.map(ev);
        if (args.some((a) => a === null)) return null;
        const v = args as number[];
        switch (n.fn) {
          case "round": {
            const d = Math.min(6, Math.max(0, Math.round(v[1] ?? 0)));
            const f = 10 ** d;
            return Math.round((v[0] + Math.sign(v[0]) * 1e-9) * f) / f;
          }
          // The checkout's own rounding (vat-calculations.ts), so a formula can match a saved figure to the centavo.
          case "cents": return Number(v[0].toFixed(2));
          case "floor": return Math.floor(v[0] + 1e-9);
          case "ceil": return Math.ceil(v[0] - 1e-9);
          case "abs": return Math.abs(v[0]);
          case "min": return Math.min(...v);
          case "max": return Math.max(...v);
        }
        return null;
      }
    }
  };
  const result = ev(tree);
  return result === null || !Number.isFinite(result) ? null : result;
}

export type FormulaFormat = "money" | "number" | "percent" | "int";

export function formatFormula(v: number, format: FormulaFormat, decimals: number, peso: (n: number) => string): string {
  const d = Math.min(6, Math.max(0, Math.round(decimals)));
  if (format === "money") return peso(Math.round(v * 100) / 100);
  if (format === "int") return String(Math.round(v));
  const fixed = v.toLocaleString("en-PH", { minimumFractionDigits: d, maximumFractionDigits: d });
  return format === "percent" ? `${fixed}%` : fixed;
}

// The value names a formula uses ("total", "pieces"…). Throws FormulaError if it can't be read.
export function formulaVariables(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    if (n.t === "var") out.add(n.name);
    else if (n.t === "un") walk(n.a);
    else if (n.t === "bin") {
      walk(n.a);
      walk(n.b);
    }
    else if (n.t === "call") n.args.forEach(walk);
  };
  walk(parseFormula(src));
  return [...out];
}

// For validation: the error message, or null if the formula is fine.
export function formulaError(src: string): string | null {
  try {
    parseFormula(src);
    return null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : "This formula can't be read.";
  }
}

// Parsed formulas are cached by text; designs reuse the same few formulas.
const cache = new Map<string, Node | FormulaError>();
export function computeFormula(src: string, data: ReceiptData): number | null {
  let tree = cache.get(src);
  if (!tree) {
    try {
      tree = parseFormula(src);
    } catch (e) {
      tree = e instanceof FormulaError ? e : new FormulaError("Invalid formula");
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, tree);
  }
  return tree instanceof FormulaError ? null : evaluateFormula(tree, data);
}
