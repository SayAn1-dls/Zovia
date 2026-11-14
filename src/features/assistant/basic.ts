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

export type GuidanceTopic =
  | "deposit"
  | "agreement"
  | "visit"
  | "safety"
  | "police"
  | "documents"
  | "notice"
  | "electricity"
  | "brokerage"
  | "pg_vs_flat";

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
  police: {
    pattern: /\b(police verification|tenant verification|verification form)\b/,
    text: "Most cities ask landlords and PG owners to complete tenant police verification. The owner usually submits it (often online through the state police portal) with your photo ID, a photo and your permanent address; ask for the acknowledgement for your records.",
  },
  documents: {
    pattern: /\b(documents?|id proof|aadhaar|kyc|papers)\b/,
    text: "PGs usually ask for a government photo ID (Aadhaar, passport or driving licence), two passport photos, a college ID or offer letter, and an emergency contact. Share copies, not originals, and mask your Aadhaar number where you can.",
  },
  notice: {
    pattern:
      /\b(notice period|move out|moving out|leave the pg|vacate|lock-?in)\b/,
    text: "PG notice periods are commonly 15 to 30 days and flats one to two months; some have a lock-in of three to six months. Give notice in writing (a message or e-mail is fine) and agree the deposit refund date before you leave.",
  },
  electricity: {
    pattern: /\b(electricity|power bill|current bill|sub-?meter)\b/,
    text: "Many PGs include electricity, but AC rooms are often billed separately by sub-meter, typically ₹8 to ₹12 a unit. Ask whether it is included, how it is measured and how it is split in shared rooms.",
  },
  brokerage: {
    pattern: /\b(broker(?:age)?|commission|agent fee)\b/,
    text: "PGs rarely charge brokerage. For flats, brokers usually ask for 15 days to one month's rent. Listings on Zovia are posted by owners, so there is no brokerage for contacting them.",
  },
  pg_vs_flat: {
    pattern:
      /\b(pg (?:or|vs\.?|versus) (?:a )?flat|flat (?:or|vs\.?|versus) (?:a )?pg|which is better)\b/,
    text: "A PG costs less up front (small deposit, furnished, meals and cleaning included) and suits a first job or college. A shared flat gives more freedom and space but needs a bigger deposit, furniture and managing bills. If you are new to the city, start in a PG and move once you know the areas.",
  },
};

export function guidanceFor(text: string): string | null {
  const lower = text.toLowerCase();
  const hits = (Object.keys(GUIDANCE) as GuidanceTopic[]).filter((topic) =>
    GUIDANCE[topic].pattern.test(lower),
  );
  return hits.length > 0
    ? hits.map((topic) => GUIDANCE[topic].text).join(" ")
    : null;
}

/** "PG in Bengaluru under ₹8,000 with food and Wi-Fi" from parsed requirements. */
export function describeRequirements(
  req: ParsedRequirements,
  cityName: string | null,
  typeLabel: string | null,
): string {
  const parts: string[] = [typeLabel ?? "places"];
  if (req.locality && cityName) parts.push(`in ${req.locality}, ${cityName}`);
  else if (cityName) parts.push(`in ${cityName}`);
  if (req.near) parts.push(`near ${req.near}`);
  if (req.budget_min !== null && req.budget_max !== null) {
    parts.push(
      `between ${formatINR(req.budget_min)} and ${formatINR(req.budget_max)}`,
    );
  } else if (req.budget_max !== null)
    parts.push(`under ${formatINR(req.budget_max)}`);
  else if (req.budget_min !== null)
    parts.push(`above ${formatINR(req.budget_min)}`);
  // "girls' PGs" already says who it is for.
  if (req.gender && !/girls|boys/i.test(typeLabel ?? ""))
    parts.push(req.gender === "female" ? "for women" : "for men");

  const qualifiers = [
    ...(req.sharing
      ? [req.sharing === "single" ? "single room" : `${req.sharing} sharing`]
      : []),
    ...(req.diet === "veg"
      ? ["pure veg"]
      : req.diet === "nonveg"
        ? ["non-veg OK"]
        : req.food
          ? ["food included"]
          : []),
    ...(req.smoking === "free"
      ? ["smoke-free"]
      : req.smoking === "allowed"
        ? ["smoking allowed"]
        : []),
    ...req.amenities.map((code) => AMENITY_LABELS_FOR_TEXT[code] ?? code),
    ...(req.available_only ? ["beds free now"] : []),
  ];
  return qualifiers.length > 0
    ? `${parts.join(" ")} (${qualifiers.join(", ")})`
    : parts.join(" ");
}
