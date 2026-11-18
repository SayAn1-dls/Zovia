import { STAY_RULES, STAY_ROOM_LABELS, type StayQuoteLine, type StayRoomType } from "./schemas";

/** Pure stay pricing (no I/O). Money is integer INR. Must reproduce the vectors in docs/stay-booking.md. */

export type PricingInput = {
  nights: number;
  rooms: { room_type: StayRoomType; units: number; rent_per_month_inr: number }[];
};

export type StayPrice = {
  lines: StayQuoteLine[];
  stay_total_inr: number;
  tax_percent: number;
  tax_inr: number;
  grand_total_inr: number;
  payable_now_inr: number;
};

const isPositiveInt = (value: number) => Number.isInteger(value) && value > 0;

/** Price of one bed for one night: ceil(rent / 30). */
export function unitPricePerNight(rentPerMonthInr: number): number {
  if (!isPositiveInt(rentPerMonthInr)) throw new RangeError("Rent must be a positive whole number of rupees.");
  return Math.ceil(rentPerMonthInr / STAY_RULES.days_per_month);
}

/** 5% up to the threshold, else 18%; decided by the highest unit price in the booking. */
export function taxPercentFor(highestUnitPriceInr: number): number {
  return highestUnitPriceInr <= STAY_RULES.tax_threshold_unit_night_inr
    ? STAY_RULES.tax_percent_low
    : STAY_RULES.tax_percent_high;
}

/** Whole rupees, half up, in integer arithmetic (no float drift). */
export function taxOn(stayTotalInr: number, percent: number): number {
  return Math.floor((stayTotalInr * percent + 50) / 100);
}

export function priceStay(input: PricingInput): StayPrice {
  if (!Number.isInteger(input.nights) || input.nights < STAY_RULES.min_nights || input.nights > STAY_RULES.max_nights) {
    throw new RangeError(`Nights must be between ${STAY_RULES.min_nights} and ${STAY_RULES.max_nights}.`);
  }
  if (input.rooms.length === 0) throw new RangeError("Choose at least one room.");
  let totalUnits = 0;
  const lines: StayQuoteLine[] = input.rooms.map((room) => {
    if (!isPositiveInt(room.units)) throw new RangeError("Units must be a positive whole number.");
    totalUnits += room.units;
    const unit = unitPricePerNight(room.rent_per_month_inr);
    return {
      room_type: room.room_type,
      label: STAY_ROOM_LABELS[room.room_type],
      units: room.units,
      unit_price_inr: unit,
      nights: input.nights,
      line_total_inr: unit * room.units * input.nights,
    };
  });
  if (totalUnits > STAY_RULES.max_units) throw new RangeError(`At most ${STAY_RULES.max_units} beds in one booking.`);

  const stay_total_inr = lines.reduce((sum, line) => sum + line.line_total_inr, 0);
  const tax_percent = taxPercentFor(Math.max(...lines.map((line) => line.unit_price_inr)));
  const tax_inr = taxOn(stay_total_inr, tax_percent);
  const grand_total_inr = stay_total_inr + tax_inr;
  return { lines, stay_total_inr, tax_percent, tax_inr, grand_total_inr, payable_now_inr: grand_total_inr };
}
