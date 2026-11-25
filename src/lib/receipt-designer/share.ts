// Design files: a receipt design saved to share with another branch or
// workspace, or to keep a copy. Reading one runs it through the same checks
// as saving, so a file can never carry more than the designer allows.
import type { Block, Condition, Template, TotalsLine } from "./types";
import { sanitizeTemplate } from "./validate";

export const DESIGN_FILE_KIND = "nookly-receipt-design";

export interface DesignFile {
  kind: typeof DESIGN_FILE_KIND;
  exportedAt: string;
  template: Template;
}

export const designFile = (template: Template): DesignFile => ({ kind: DESIGN_FILE_KIND, exportedAt: new Date().toISOString(), template });

export const designFileName = (t: Template, when = new Date()) => `receipt-design-${t.paperWidth}mm-${when.toISOString().slice(0, 10)}.json`;

// "Show only when: these branches" can only name this workspace's branches.
// A condition left with nothing to check is removed (the part always prints).
function keepBranches(c: Condition | undefined, known: Set<string>, dropped: { count: number }): Condition | undefined {
  if (!c?.branches?.length) return c;
  const branches = c.branches.filter((id) => known.has(id));
  if (branches.length === c.branches.length) return c;
  dropped.count += 1;
  const next: Condition = { ...c };
  if (branches.length) next.branches = branches;
  else delete next.branches;
  const empty = !next.saleTypes?.length && next.minTotal == null && next.maxTotal == null && !next.fromDate && !next.toDate && !next.branches?.length;
  return empty ? undefined : next;
}

const withCondition = <T extends { showWhen?: Condition }>(x: T, c: Condition | undefined): T => {
  const { showWhen: _old, ...rest } = x;
  void _old;
  return (c ? { ...rest, showWhen: c } : rest) as T;
};

export interface ReadResult {
  template: Template | null;
  errors: string[]; // what has to be fixed before the design can print
  problem: string | null; // why nothing could be read at all
  droppedBranchConditions: number;
}

export function readDesignFile(text: string, branchIds: string[]): ReadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { template: null, errors: [], problem: "That file isn't a receipt design.", droppedBranchConditions: 0 };
  }
  const raw = json && typeof json === "object" && (json as { kind?: unknown }).kind === DESIGN_FILE_KIND ? (json as DesignFile).template : json;
  const { template, errors } = sanitizeTemplate(raw);
  if (template.blocks.length === 0) return { template: null, errors: [], problem: "That file has no receipt design in it.", droppedBranchConditions: 0 };
  const known = new Set(branchIds);
  const dropped = { count: 0 };
  const blocks = template.blocks.map((b): Block => {
    let out = withCondition(b, keepBranches(b.showWhen, known, dropped));
    if (out.type === "totals") out = { ...out, lines: out.lines.map((l): TotalsLine => withCondition(l, keepBranches(l.showWhen, known, dropped))) };
    return out;
  });
  return { template: { ...template, blocks }, errors, problem: null, droppedBranchConditions: dropped.count };
}
