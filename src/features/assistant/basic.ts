import { formatINR } from "@/lib/pricing";
import type { ParsedRequirements } from "./parser";

const AMENITY_LABELS_FOR_TEXT: Record<string, string> = {
  wifi: "Wi-Fi",
  ac: "AC",
  attached_bathroom: "attached bathroom",
  power_backup: "power backup",
  washing_machine: "washing machine",
  cctv: "CCTV",
};

/**
 * Pure text helpers for basic mode (no AI). Advice here is general renting guidance only; it
 * never describes a specific listing.
 */

export type GuidanceTopic = "deposit" | "agreement" | "visit" | "safety";

const GUIDANCE: Record<GuidanceTopic, { pattern: RegExp; text: string }> = {
  deposit: {
    pattern: /\b(deposit|advance|refund)\b/,
    text: "Security deposits for PGs are often one to two months' rent; flats can ask for more, and the limit differs by state. Get the amount, refund timeline and deduction rules in writing, and pay through a traceable method with a receipt.",
  },
  agreement: {
    pattern: /\b(agreement|contract|lease|registration|register|stamp)\b/,
    text: "Ask for a written rent or PG agreement that states rent, deposit, notice period, lock-in, what is included (food, electricity, Wi-Fi) and refund terms. Read it fully before paying, keep a signed copy, and check whether your state requires registration.",
  },
  visit: {
    pattern: /\b(visit|inspect|check|checklist|look for|see the)\b/,
    text: "On a visit, check water pressure and hot water, mobile signal and Wi-Fi speed, power backup, cleanliness of bathrooms and kitchen, locks on doors and cupboards, and how far the nearest transport is. Ask current residents about food and the owner, and confirm house rules and gate timings.",
  },
  safety: {
    pattern: /\b(safe|safety|unsafe|scams?|fraud|fake)\b/,
    text: "Visit before paying anything, never pay a token amount to hold a place you have not seen, and keep all payments on record. Look for CCTV, a guard or reception, working locks and good lighting on the way home. On Zovia, verified badges mean staff reviewed the owner's documents.",
  },
};

export function guidanceFor(text: string): string | null {
  const lower = text.toLowerCase();
  const hits = (Object.keys(GUIDANCE) as GuidanceTopic[]).filter((topic) => GUIDANCE[topic].pattern.test(lower));
  return hits.length > 0 ? hits.map((topic) => GUIDANCE[topic].text).join(" ") : null;
}

/** "PG in Bengaluru under ₹8,000 with food and Wi-Fi" from parsed requirements. */
export function describeRequirements(req: ParsedRequirements, cityName: string | null, typeLabel: string | null): string {
  const parts: string[] = [typeLabel ?? "places"];
  if (cityName) parts.push(`in ${cityName}`);
  if (req.near) parts.push(`near ${req.near}`);
  if (req.budget_min !== null && req.budget_max !== null) {
    parts.push(`between ${formatINR(req.budget_min)} and ${formatINR(req.budget_max)}`);
  } else if (req.budget_max !== null) parts.push(`under ${formatINR(req.budget_max)}`);
  else if (req.budget_min !== null) parts.push(`above ${formatINR(req.budget_min)}`);
  if (req.gender) parts.push(req.gender === "female" ? "for women" : "for men");
  const extras = [...(req.food ? ["food"] : []), ...req.amenities.map((code) => AMENITY_LABELS_FOR_TEXT[code] ?? code)];
  if (extras.length > 0) {
    parts.push(`with ${extras.length > 1 ? `${extras.slice(0, -1).join(", ")} and ${extras[extras.length - 1]}` : extras[0]}`);
  }
  return parts.join(" ");
}
