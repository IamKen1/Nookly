// Server side of the POS pricing rules (see lib/pricing.ts) and the history of
// changes applied to the POS from the receipt designer, so each can be undone.
import { prisma } from "@/lib/prisma";
import { NO_PRICING, ROUNDING_STEPS, ruleError, type PricingRules } from "@/lib/pricing";
import { getTenantPlanCode, hasFeature } from "@/lib/plan-gating";

export interface PricingState {
  roundingStep: number | null;
  ruleEnabled: boolean;
  ruleLabel: string;
  ruleExpr: string;
}

export const DEFAULT_PRICING_STATE: PricingState = { roundingStep: null, ruleEnabled: false, ruleLabel: "Adjustment", ruleExpr: "" };

export async function getPricingState(tenantId: string): Promise<PricingState> {
  const row = await prisma.pricingSettings.findUnique({ where: { tenantId } });
  if (!row) return { ...DEFAULT_PRICING_STATE };
  return { roundingStep: row.roundingStep != null ? Number(row.roundingStep) : null, ruleEnabled: row.ruleEnabled, ruleLabel: row.ruleLabel, ruleExpr: row.ruleExpr };
}

// What checkout applies. A formula that can't be used is treated as off.
export function rulesFrom(s: PricingState): PricingRules {
  return {
    roundingStep: s.roundingStep,
    rule: s.ruleEnabled && s.ruleExpr.trim() && !ruleError(s.ruleExpr) ? { label: s.ruleLabel, expr: s.ruleExpr } : null,
  };
}

// The rules come with the receipt designer: off whenever the plan doesn't include it.
export async function getPricingRules(tenantId: string): Promise<PricingRules> {
  try {
    const [state, planCode] = await Promise.all([getPricingState(tenantId), getTenantPlanCode(tenantId)]);
    if (state.roundingStep === null && !state.ruleEnabled) return NO_PRICING;
    if (!(await hasFeature(planCode, "receiptDesigner"))) return NO_PRICING;
    return rulesFrom(state);
  } catch {
    // Never block a sale over settings: charge the standard computation.
    return NO_PRICING;
  }
}

// Checks a requested state; returns the error to show, or the clean state.
export function cleanPricingState(input: Partial<PricingState>, current: PricingState): { error: string } | { state: PricingState } {
  const next: PricingState = { ...current };
  if (input.roundingStep !== undefined) {
    if (input.roundingStep !== null && !ROUNDING_STEPS.includes(Number(input.roundingStep) as (typeof ROUNDING_STEPS)[number]))
      return { error: "Rounding can be ₱0.25, ₱0.50 or ₱1.00." };
    next.roundingStep = input.roundingStep === null ? null : Number(input.roundingStep);
  }
  if (input.ruleLabel !== undefined) {
    const label = String(input.ruleLabel).trim().slice(0, 40);
    if (/official\s*receipt|invoice/i.test(label)) return { error: "That name can't be used: Nookly receipts aren't BIR-accredited." };
    next.ruleLabel = label || "Adjustment";
  }
  if (input.ruleExpr !== undefined) next.ruleExpr = String(input.ruleExpr).slice(0, 300);
  if (input.ruleEnabled !== undefined) next.ruleEnabled = Boolean(input.ruleEnabled);
  if (next.ruleEnabled) {
    const problem = ruleError(next.ruleExpr);
    if (problem) return { error: `Formula: ${problem}` };
  }
  return { state: next };
}

const peso = (n: number) => `₱${n.toFixed(2)}`;

// "Cash rounding: off → ₱0.25 · Price formula: on (Service fee)"
export function describePricingChange(before: PricingState, after: PricingState): string {
  const parts: string[] = [];
  if (before.roundingStep !== after.roundingStep)
    parts.push(`Cash rounding: ${before.roundingStep ? peso(before.roundingStep) : "off"} → ${after.roundingStep ? peso(after.roundingStep) : "off"}`);
  if (before.ruleEnabled !== after.ruleEnabled) parts.push(`Price formula ${after.ruleEnabled ? `on: ${after.ruleLabel} = ${after.ruleExpr}` : "off"}`);
  else if (after.ruleEnabled && (before.ruleExpr !== after.ruleExpr || before.ruleLabel !== after.ruleLabel))
    parts.push(`Price formula: ${after.ruleLabel} = ${after.ruleExpr}`);
  return parts.join(" · ") || "No change";
}

export async function savePricingState(tenantId: string, s: PricingState) {
  await prisma.pricingSettings.upsert({
    where: { tenantId },
    create: { tenantId, roundingStep: s.roundingStep, ruleEnabled: s.ruleEnabled, ruleLabel: s.ruleLabel, ruleExpr: s.ruleExpr },
    update: { roundingStep: s.roundingStep, ruleEnabled: s.ruleEnabled, ruleLabel: s.ruleLabel, ruleExpr: s.ruleExpr },
  });
}
