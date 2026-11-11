/**
 * Estimated monthly expense for one chosen option of a listing (spec 6.2).
 *
 *   monthly = rent (bed/room or entire unit)
 *           + maintenance
 *           + electricity (unless included in rent)
 *           + water (unless included in rent)
 *           + food charge (when available and not included in rent)
 *           + mandatory monthly charges (yearly ones spread over 12 months, rounded up)
 *
 *   move-in = first month + security deposit + mandatory one-time charges
 *
 * Pure: no database, no network, no clock. All money is integer INR. A number
 * the owner has not provided is never guessed: the line is listed with
 * `amount: null`, left out of the total, and the estimate is flagged
 * `incomplete` (so the total is a lower bound).
 */

export type ListingMode = "per_bed" | "entire_unit";
export type UtilityBilling = "included" | "fixed" | "metered";
export type ChargeFrequency = "monthly" | "one_time" | "yearly";

export interface PricingCharge {
  label: string;
  amount: number;
  frequency: ChargeFrequency;
  is_mandatory: boolean;
}

/** Pricing columns of `properties` plus its `property_charges` rows. */
export interface PricingListing {
  listing_mode: ListingMode;
  /** Rent of the whole unit. Required for `entire_unit`, ignored for `per_bed`. */
  monthly_rent: number | null;
  /** Deposit of the whole unit; fallback for a room without its own deposit. */
  security_deposit: number | null;
  maintenance_monthly: number | null;
  electricity_billing: UtilityBilling;
  /** Fixed amount when billing is `fixed`; the owner's estimate when `metered`. */
  electricity_monthly_estimate: number | null;
  water_billing: UtilityBilling;
  water_monthly_estimate: number | null;
  food_available: boolean;
  food_included: boolean;
  food_monthly_charge: number | null;
  charges?: readonly PricingCharge[] | null;
}

/** The chosen room of a `per_bed` listing. */
export interface PricingRoom {
  rent_per_bed: number;
  security_deposit: number | null;
}

/** The chosen bed, when one is chosen. */
export interface PricingBed {
  rent_override: number | null;
}

export interface PricingSelection {
  room?: PricingRoom | null;
  bed?: PricingBed | null;
}

export interface PricingOptions {
  /** Count the food charge when food is available but not included. Default true (spec formula). */
  include_food?: boolean;
  /** Count non-mandatory charges (monthly, yearly and one-time). Default false. */
  include_optional_charges?: boolean;
}

export type CostKind =
  "rent" | "maintenance" | "electricity" | "water" | "food" | "charge";

export interface CostLineItem {
  label: string;
  /** Monthly amount in INR; `null` when the owner has not provided it. */
  amount: number | null;
  kind: CostKind;
  /** True when the cost is already covered by the rent (amount is 0). */
  included: boolean;
  /** True when the amount is the owner's estimate of a metered bill. */
  estimated: boolean;
  /** True when the tenant can opt out (food not included, non-mandatory charge). */
  optional: boolean;
  /** True when `amount` is part of `monthly_total`. */
  counted: boolean;
}

export type MoveInKind = "first_month" | "deposit" | "charge";

export interface MoveInLineItem {
  label: string;
  amount: number | null;
  kind: MoveInKind;
  optional: boolean;
  /** True when `amount` is part of `move_in_total`. */
  counted: boolean;
}

export type MissingAmount =
  | "electricity_estimate"
  | "water_estimate"
  | "food_charge"
  | "security_deposit";

export interface MonthlyCostEstimate {
  listing_mode: ListingMode;
  items: CostLineItem[];
  monthly_total: number;
  move_in_items: MoveInLineItem[];
  move_in_total: number;
  notes: string[];
  /** True when a recurring amount is unknown, so `monthly_total` is a lower bound. */
  incomplete: boolean;
  /** True when `move_in_total` is a lower bound (monthly incomplete or deposit unknown). */
  move_in_incomplete: boolean;
  missing: MissingAmount[];
}

export class PricingInputError extends RangeError {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "PricingInputError";
    this.field = field;
  }
}

const UTILITY_BILLINGS: readonly string[] = ["included", "fixed", "metered"];
const CHARGE_FREQUENCIES: readonly string[] = ["monthly", "one_time", "yearly"];

function requiredAmount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new PricingInputError(field, "must be a whole number of rupees");
  }
  if (value < 0) {
    throw new PricingInputError(field, "must not be negative");
  }
  return value;
}

function optionalAmount(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return requiredAmount(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new PricingInputError(field, "must be true or false");
  }
  return value;
}

function billing(value: unknown, field: string): UtilityBilling {
  if (typeof value !== "string" || !UTILITY_BILLINGS.includes(value)) {
    throw new PricingInputError(field, "must be included, fixed or metered");
  }
  return value as UtilityBilling;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** "₹8,000", "₹1,00,000" (Indian digit grouping, no paise). */
export function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new PricingInputError("amount", "must be a finite number");
  }
  return inrFormatter.format(amount);
}

/** "₹8,000–₹12,000", or a single amount when both ends are equal. */
export function formatINRRange(min: number, max: number): string {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low === high ? formatINR(low) : `${formatINR(low)}–${formatINR(high)}`;
}

/** "₹8,000/month". */
export function formatMonthly(amount: number): string {
  return `${formatINR(amount)}/month`;
}

interface Draft {
  items: CostLineItem[];
  notes: string[];
  missing: MissingAmount[];
}

function addUtility(
  draft: Draft,
  kind: "electricity" | "water",
  mode: UtilityBilling,
  amount: number | null,
): void {
  const name = kind === "electricity" ? "Electricity" : "Water";
  const lower = name.toLowerCase();
  const missingCode: MissingAmount = `${kind}_estimate`;

  if (mode === "included") {
    draft.items.push({
      label: `${name} (included in rent)`,
      amount: 0,
      kind,
      included: true,
      estimated: false,
      optional: false,
      counted: false,
    });
    return;
  }

  if (mode === "fixed") {
    if (amount === null) {
      draft.missing.push(missingCode);
      draft.notes.push(
        `${name} is a fixed monthly charge the owner has not specified; it is not part of this total.`,
      );
    }
    draft.items.push({
      label: `${name} (fixed monthly charge)`,
      amount,
      kind,
      included: false,
      estimated: false,
      optional: false,
      counted: amount !== null,
    });
    return;
  }

  if (amount === null) {
    draft.missing.push(missingCode);
    draft.notes.push(
      `${name} is metered and the owner has not given an estimate; it is not part of this total.`,
    );
  } else {
    draft.notes.push(
      `${name} is metered; ${formatINR(amount)} is the owner's estimate and the actual ${lower} bill will vary.`,
    );
  }
  draft.items.push({
    label: `${name} (metered, owner's estimate)`,
    amount,
    kind,
    included: false,
    estimated: true,
    optional: false,
    counted: amount !== null,
  });
}

/**
 * Itemised monthly and move-in cost of one option of a listing.
 *
 * `per_bed` listings need `selection.room`; the rent is the bed's
 * `rent_override` when set, otherwise the room's `rent_per_bed`, and the
 * deposit is the room's, falling back to the listing's. `entire_unit` listings
 * use `monthly_rent` and the listing's deposit; a selection is ignored.
 *
 * Throws `PricingInputError` for negative, fractional or non-numeric amounts,
 * unknown enum values, or a missing rent.
 */
export function estimateMonthlyCost(
  listing: PricingListing,
  selection: PricingSelection = {},
  options: PricingOptions = {},
): MonthlyCostEstimate {
  const includeFood = options.include_food ?? true;
  const includeOptional = options.include_optional_charges ?? false;

  if (
    listing.listing_mode !== "per_bed" &&
    listing.listing_mode !== "entire_unit"
  ) {
    throw new PricingInputError(
      "listing_mode",
      "must be per_bed or entire_unit",
    );
  }

  const draft: Draft = { items: [], notes: [], missing: [] };
  const moveInItems: MoveInLineItem[] = [];

  // Rent and deposit.
  let rent: number;
  let rentLabel: string;
  let deposit: number | null;
  const listingDeposit = optionalAmount(
    listing.security_deposit,
    "security_deposit",
  );

  if (listing.listing_mode === "entire_unit") {
    if (listing.monthly_rent === null || listing.monthly_rent === undefined) {
      throw new PricingInputError(
        "monthly_rent",
        "is required for an entire-unit listing",
      );
    }
    rent = requiredAmount(listing.monthly_rent, "monthly_rent");
    rentLabel = "Rent (entire unit)";
    deposit = listingDeposit;
  } else {
    const room = selection.room;
    if (!room) {
      throw new PricingInputError(
        "room",
        "a room must be chosen for a per-bed listing",
      );
    }
    const roomRent = requiredAmount(room.rent_per_bed, "room.rent_per_bed");
    const override = optionalAmount(
      selection.bed?.rent_override,
      "bed.rent_override",
    );
    rent = override ?? roomRent;
    rentLabel = override === null ? "Rent (per bed)" : "Rent (this bed)";
    deposit =
      optionalAmount(room.security_deposit, "room.security_deposit") ??
      listingDeposit;
  }

  draft.items.push({
    label: rentLabel,
    amount: rent,
    kind: "rent",
    included: false,
    estimated: false,
    optional: false,
    counted: true,
  });

  // Maintenance.
  const maintenance = optionalAmount(
    listing.maintenance_monthly,
    "maintenance_monthly",
  );
  if (maintenance !== null && maintenance > 0) {
    draft.items.push({
      label: "Maintenance",
      amount: maintenance,
      kind: "maintenance",
      included: false,
      estimated: false,
      optional: false,
      counted: true,
    });
  }

  // Utilities.
  addUtility(
    draft,
    "electricity",
    billing(listing.electricity_billing, "electricity_billing"),
    optionalAmount(
      listing.electricity_monthly_estimate,
      "electricity_monthly_estimate",
    ),
  );
  addUtility(
    draft,
    "water",
    billing(listing.water_billing, "water_billing"),
    optionalAmount(listing.water_monthly_estimate, "water_monthly_estimate"),
  );

  // Food.
  const foodAvailable = requiredBoolean(
    listing.food_available,
    "food_available",
  );
  const foodIncluded = requiredBoolean(listing.food_included, "food_included");
  const foodCharge = optionalAmount(
    listing.food_monthly_charge,
    "food_monthly_charge",
  );
  if (foodAvailable && foodIncluded) {
    draft.items.push({
      label: "Food (included in rent)",
      amount: 0,
      kind: "food",
      included: true,
      estimated: false,
      optional: false,
      counted: false,
    });
  } else if (foodAvailable) {
    if (foodCharge === null) {
      if (includeFood) draft.missing.push("food_charge");
      draft.notes.push(
        "Food is optional and the owner has not specified the monthly charge; it is not part of this total.",
      );
    } else {
      draft.notes.push(
        includeFood
          ? `Food is optional; ${formatMonthly(foodCharge)} is counted in this total.`
          : `Food is optional (${formatMonthly(foodCharge)}) and is not counted in this total.`,
      );
    }
    draft.items.push({
      label: "Food (optional)",
      amount: foodCharge,
      kind: "food",
      included: false,
      estimated: false,
      optional: true,
      counted: includeFood && foodCharge !== null,
    });
  }

  // Additional charges.
  const oneTime: MoveInLineItem[] = [];
  let optionalChargesLeftOut = 0;
  (listing.charges ?? []).forEach((charge, index) => {
    const field = `charges[${index}]`;
    const amount = requiredAmount(charge.amount, `${field}.amount`);
    if (
      typeof charge.frequency !== "string" ||
      !CHARGE_FREQUENCIES.includes(charge.frequency)
    ) {
      throw new PricingInputError(
        `${field}.frequency`,
        "must be monthly, one_time or yearly",
      );
    }
    const mandatory = requiredBoolean(
      charge.is_mandatory,
      `${field}.is_mandatory`,
    );
    const name =
      typeof charge.label === "string" && charge.label.trim() !== ""
        ? charge.label.trim()
        : "Other charge";
    const counted = mandatory || includeOptional;
    if (!counted) optionalChargesLeftOut += 1;
    const suffix = mandatory ? "" : " (optional)";

    if (charge.frequency === "one_time") {
      oneTime.push({
        label: `${name}${suffix}`,
        amount,
        kind: "charge",
        optional: !mandatory,
        counted,
      });
      return;
    }

    const yearly = charge.frequency === "yearly";
    draft.items.push({
      label: yearly
        ? `${name} (${formatINR(amount)} per year, shown per month)${suffix}`
        : `${name}${suffix}`,
      amount: yearly ? Math.ceil(amount / 12) : amount,
      kind: "charge",
      included: false,
      estimated: false,
      optional: !mandatory,
      counted,
    });
  });
  if (optionalChargesLeftOut > 0) {
    draft.notes.push(
      optionalChargesLeftOut === 1
        ? "1 optional charge is listed but not counted."
        : `${optionalChargesLeftOut} optional charges are listed but not counted.`,
    );
  }

  const monthlyTotal = draft.items.reduce(
    (sum, item) =>
      item.counted && item.amount !== null ? sum + item.amount : sum,
    0,
  );
  const incomplete = draft.missing.length > 0;

  // Move-in cost.
  moveInItems.push({
    label: "First month",
    amount: monthlyTotal,
    kind: "first_month",
    optional: false,
    counted: true,
  });
  if (deposit === null) {
    draft.missing.push("security_deposit");
    draft.notes.push(
      "The security deposit is not specified; confirm it with the owner before paying anything.",
    );
  }
  moveInItems.push({
    label: "Security deposit (refundable)",
    amount: deposit,
    kind: "deposit",
    optional: false,
    counted: deposit !== null,
  });
  moveInItems.push(...oneTime);
  const moveInTotal = moveInItems.reduce(
    (sum, item) =>
      item.counted && item.amount !== null ? sum + item.amount : sum,
    0,
  );

  if (incomplete) {
    draft.notes.push(
      "This estimate is incomplete: the real monthly cost will be higher than the total shown.",
    );
  }

  return {
    listing_mode: listing.listing_mode,
    items: draft.items,
    monthly_total: monthlyTotal,
    move_in_items: moveInItems,
    move_in_total: moveInTotal,
    notes: draft.notes,
    incomplete,
    move_in_incomplete: incomplete || deposit === null,
    missing: draft.missing,
  };
}

export interface CostComparisonInput {
  id: string;
  label?: string | null;
  listing: PricingListing;
  selection?: PricingSelection;
  options?: PricingOptions;
}

export interface CostComparisonRow {
  id: string;
  label: string | null;
  /** 1-based position after sorting. */
  rank: number;
  monthly_total: number;
  move_in_total: number;
  incomplete: boolean;
  move_in_incomplete: boolean;
  /** `monthly_total` minus the lowest `monthly_total` in the list. */
  difference_from_cheapest: number;
  estimate: MonthlyCostEstimate;
}

/**
 * Estimates every entry and returns rows sorted by `monthly_total` ascending.
 * Ties: complete estimates before incomplete ones (an incomplete total is a
 * lower bound), then input order.
 */
export function compareMonthlyCosts(
  list: readonly CostComparisonInput[],
): CostComparisonRow[] {
  const rows = list.map((entry, index) => ({
    index,
    entry,
    estimate: estimateMonthlyCost(
      entry.listing,
      entry.selection,
      entry.options,
    ),
  }));
  rows.sort(
    (x, y) =>
      x.estimate.monthly_total - y.estimate.monthly_total ||
      Number(x.estimate.incomplete) - Number(y.estimate.incomplete) ||
      x.index - y.index,
  );
  const cheapest = rows[0]?.estimate.monthly_total ?? 0;
  return rows.map(({ entry, estimate }, position) => ({
    id: entry.id,
    label: entry.label ?? null,
    rank: position + 1,
    monthly_total: estimate.monthly_total,
    move_in_total: estimate.move_in_total,
    incomplete: estimate.incomplete,
    move_in_incomplete: estimate.move_in_incomplete,
    difference_from_cheapest: estimate.monthly_total - cheapest,
    estimate,
  }));
}
