// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AppError } from "@/server/http/errors";

import type { RawRoomAvailability, StayBookingRow, StayPaymentPort, StayRepository } from "./ports";
import { assertStayDates, availability, cancel, createBooking, getBooking, listBookings, payInstruction, quote, verifyPayment, type StayDeps } from "./service";
import { indiaToday } from "./hooks/stay-dates";
import { priceStay } from "./pricing";
import type { CreateStayBookingInput, StayRequest } from "./schemas";

const listing = { slug: "sunrise-pg", title: "Sunrise PG", city: "Pune", locality: "Baner" };
const getListing = (slug: string) => (slug === listing.slug ? (listing as never) : null);

// 2026-11-19 12:00 UTC is 17:30 in India.
const NOW = new Date("2026-11-19T12:00:00Z");

type Store = { rows: (StayBookingRow & { owner: string })[]; raw: RawRoomAvailability[]; created: unknown[] };

function newStore(): Store {
  return {
    rows: [],
    created: [],
    raw: [
      { room_type: "double", units_total: 6, rent_per_month_inr: 9000, units_left: 4, ac: true, attached_bathroom: false, strip: [] },
      { room_type: "triple", units_total: 4, rent_per_month_inr: 6500, units_left: 0, ac: false, attached_bathroom: false, strip: [] },
    ],
  };
}

function fakeRepo(store: Store, userId: string): StayRepository {
  const strip = (row: StayBookingRow & { owner: string }): StayBookingRow => {
    const copy: Partial<typeof row> = { ...row };
    delete copy.owner;
    return copy as StayBookingRow;
  };
  return {
    availability: async (slug) => (slug === listing.slug ? store.raw : []),
    createBooking: async (input) => {
      store.created.push(input);
      const price = priceStay({
        nights: 3,
        rooms: input.rooms.map((r) => ({ room_type: r.room_type, units: r.qty, rent_per_month_inr: store.raw.find((x) => x.room_type === r.room_type)!.rent_per_month_inr })),
      });
      const row = {
        id: crypto.randomUUID(),
        owner: userId,
        status: input.payment_mode === "online" ? "pending_payment" : "confirmed",
        payment_mode: input.payment_mode,
        paid: false,
        listing: input.listing,
        checkin: input.checkin,
        checkout: input.checkout,
        nights: 3,
        guests: input.rooms.reduce((s, r) => s + r.qty, 0),
        ...price,
        guest_name: input.guest.name,
        guest_phone: input.guest.phone,
        guest_email: input.guest.email,
        special_requests: input.special_requests,
        hold_expires_at: null,
        cancelled_at: null,
        cancel_reason: null,
        refund_inr: 0,
        refund_status: "none",
        free_cancel_until: null,
        created_at: NOW.toISOString(),
      } as StayBookingRow & { owner: string };
      store.rows.push(row);
      return strip(row);
    },
    getBooking: async (id) => {
      const row = store.rows.find((r) => r.id === id && r.owner === userId);
      return row ? strip(row) : null;
    },
    listBookings: async () => store.rows.filter((r) => r.owner === userId).map(strip),
    cancelBooking: async (id, reason) => {
      const row = store.rows.find((r) => r.id === id && r.owner === userId)!;
      row.status = "cancelled";
      row.cancel_reason = reason;
      return { booking: strip(row), refund_percent: 100 };
    },
  };
}

function fakePayments(configured = false): StayPaymentPort & { verified: unknown[] } {
  const verified: unknown[] = [];
  return {
    verified,
    configured: () => configured,
    instructionFor: async (b) =>
      configured
        ? { mode: "online", provider: "razorpay", key_id: "k", order_id: "o", amount_paise: b.grand_total_inr * 100, currency: "INR", description: "d" }
        : { mode: "at_property" },
    verifyCheckout: async (proof) => {
      verified.push(proof);
      return { booking_id: verifyTarget.id };
    },
  };
}
const verifyTarget = { id: "" };

function deps(store = newStore(), over: Partial<StayDeps> & { user?: string; configured?: boolean } = {}): StayDeps {
  return {
    repo: fakeRepo(store, over.user ?? "u1"),
    payments: fakePayments(over.configured),
    now: () => NOW,
    getListing,
    similar: () => [],
    ...over,
  };
}

const request = (over: Partial<StayRequest> = {}): StayRequest => ({
  listing: "sunrise-pg",
  checkin: "2026-12-01",
  checkout: "2026-12-04",
  rooms: [{ room_type: "double", qty: 2 }],
  ...over,
});
const input = (over: Partial<CreateStayBookingInput> = {}): CreateStayBookingInput => ({
  stay: request(),
  guest: { name: "Asha Rao", phone: "9876543210", email: "asha@example.com" },
  accept_policy: true,
  ...over,
});

const code = async (promise: Promise<unknown>) => ((await promise.catch((e: unknown) => e)) as AppError).code;

describe("dates (India time)", () => {
  it("derives India's today from UTC", () => {
    expect(indiaToday(Date.parse("2026-11-19T18:29:59Z"))).toBe("2026-11-19");
    expect(indiaToday(Date.parse("2026-11-19T18:30:00Z"))).toBe("2026-11-20");
  });
  it("allows check-in today in India even when UTC is still yesterday", () => {
    const lateUtc = new Date("2026-11-19T20:00:00Z"); // 01:30 on 20 Nov in India
    expect(() => assertStayDates("2026-11-20", "2026-11-21", lateUtc)).not.toThrow();
    expect(() => assertStayDates("2026-11-19", "2026-11-21", lateUtc)).toThrow(AppError);
  });
  it("enforces the 365-day horizon and 1 to 30 nights", () => {
    expect(assertStayDates("2027-11-19", "2027-11-20", NOW)).toBe(1);
    expect(() => assertStayDates("2027-11-20", "2027-11-21", NOW)).toThrow(AppError);
    expect(assertStayDates("2026-12-01", "2026-12-31", NOW)).toBe(30);
    expect(() => assertStayDates("2026-12-01", "2027-01-01", NOW)).toThrow(AppError);
    expect(() => assertStayDates("2026-12-01", "2026-12-01", NOW)).toThrow(AppError);
    expect(() => assertStayDates("2026-02-30", "2026-03-02", NOW)).toThrow(AppError);
  });
});

describe("availability", () => {
  it("labels types, derives price from DB rent and flags sold out", async () => {
    const result = await availability(deps(), "sunrise-pg", "2026-12-01", "2026-12-04");
    expect(result.nights).toBe(3);
    expect(result.rooms[0]).toMatchObject({ label: "Double sharing", unit_price_inr: 300, sold_out: false });
    expect(result.rooms[1]).toMatchObject({ label: "Triple sharing", unit_price_inr: 217, sold_out: true });
  });
  it("offers up to 3 nearby places with beds when a type is sold out, and nothing otherwise", async () => {
    const near = (slug: string, available_beds: number) => ({ slug, title: slug.toUpperCase(), locality: "Baner", price_from: 6000, available_beds }) as never;
    const similar = () => [near("a", 0), near("b", 3), near("c", 1), near("d", 2), near("e", 5)];
    const sold = await availability(deps(newStore(), { similar }), "sunrise-pg", "2026-12-01", "2026-12-04");
    expect(sold.alternatives).toEqual([
      { slug: "b", title: "B", locality: "Baner", unit_price_from_inr: 200 },
      { slug: "c", title: "C", locality: "Baner", unit_price_from_inr: 200 },
      { slug: "d", title: "D", locality: "Baner", unit_price_from_inr: 200 },
    ]);
    const store = newStore();
    store.raw[1]!.units_left = 2;
    const open = await availability(deps(store, { similar }), "sunrise-pg", "2026-12-01", "2026-12-04");
    expect(open.alternatives).toBeUndefined();
  });
  it("404s for a listing outside the catalogue", async () => {
    expect(await code(availability(deps(), "nope", "2026-12-01", "2026-12-04"))).toBe("not_found");
  });
  it("rejects bad dates", async () => {
    expect(await code(availability(deps(), "sunrise-pg", "2026-11-18", "2026-11-20"))).toBe("validation_failed");
  });
});

describe("quote", () => {
  it("prices from the database rent (vector: 9,000 x 2 x 3 = 1,890)", async () => {
    const q = await quote(deps(), request());
    expect(q).toMatchObject({ stay_total_inr: 1800, tax_percent: 5, tax_inr: 90, grand_total_inr: 1890, payable_now_inr: 1890, available: true, guests: 2 });
    expect(q.policy.lines.length).toBeGreaterThan(3);
  });
  it("ignores any price a client smuggles in", async () => {
    const sneaky = { ...request(), unit_price_inr: 1, rent_per_month_inr: 30 } as unknown as StayRequest;
    expect((await quote(deps(), sneaky)).grand_total_inr).toBe(1890);
  });
  it("reports shortfalls instead of failing", async () => {
    const q = await quote(deps(), request({ rooms: [{ room_type: "double", qty: 5 }, { room_type: "triple", qty: 1 }] }));
    expect(q.available).toBe(false);
    expect(q.shortfalls).toEqual([
      { room_type: "double", requested: 5, available: 4 },
      { room_type: "triple", requested: 1, available: 0 },
    ]);
  });
  it("rejects a room type the stay does not offer", async () => {
    expect(await code(quote(deps(), request({ rooms: [{ room_type: "single", qty: 1 }] })))).toBe("bad_request");
  });
});

describe("createBooking", () => {
  it("books at the property when payments are not configured", async () => {
    const store = newStore();
    const result = await createBooking(deps(store), input());
    expect(result.payment).toEqual({ mode: "at_property" });
    expect(result.booking).toMatchObject({ listing_title: "Sunrise PG", city: "Pune", locality: "Baner", grand_total_inr: 1890, status: "confirmed" });
    expect(store.created[0]).toMatchObject({ payment_mode: "at_property", special_requests: null });
  });
  it("uses online payment when configured and returns the instruction", async () => {
    const store = newStore();
    const result = await createBooking(deps(store, { configured: true }), input());
    expect(store.created[0]).toMatchObject({ payment_mode: "online" });
    expect(result.payment).toMatchObject({ mode: "online", amount_paise: 189000 });
  });
  it("returns the stored totals, not a recomputation", async () => {
    const store = newStore();
    const d = deps(store);
    const orig = d.repo.createBooking;
    d.repo.createBooking = async (i) => ({ ...(await orig(i)), grand_total_inr: 4242 });
    expect((await createBooking(d, input())).booking.grand_total_inr).toBe(4242);
  });
  it("refuses a sold-out type with a conflict naming it, and writes nothing", async () => {
    const store = newStore();
    const promise = createBooking(deps(store), input({ stay: request({ rooms: [{ room_type: "triple", qty: 1 }] }) }));
    const error = (await promise.catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe("conflict");
    expect(error.message).toContain("Triple sharing");
    expect(store.created).toHaveLength(0);
  });
  it("says how many are left on a partial shortfall", async () => {
    const error = (await createBooking(deps(), input({ stay: request({ rooms: [{ room_type: "double", qty: 5 }] }) })).catch((e: unknown) => e)) as AppError;
    expect(error.message).toBe("Only 4 double sharing beds left for these dates.");
  });
  it("refuses with a 409 when the total the guest saw is not today's price", async () => {
    const store = newStore();
    const error = (await createBooking(deps(store), input({ expected_total_inr: 1500 })).catch((e: unknown) => e)) as AppError;
    expect(error.code).toBe("conflict");
    expect(error.message).toBe("The price changed. Review and confirm again.");
    expect(store.created).toHaveLength(0);
    const ok = await createBooking(deps(store), input({ expected_total_inr: 1890 }));
    expect(ok.booking.grand_total_inr).toBe(1890);
  });
  it("announces only pay-at-property bookings; online holds wait for the payment", async () => {
    const online = vi.fn().mockResolvedValue(undefined);
    await createBooking(deps(newStore(), { notify: online, configured: true }), input());
    expect(online).not.toHaveBeenCalled();
    const offline = vi.fn().mockResolvedValue(undefined);
    await createBooking(deps(newStore(), { notify: offline }), input());
    expect(offline).toHaveBeenCalledWith("created", expect.anything());
  });
  it("a failing notification does not fail the booking", async () => {
    const store = newStore();
    const notify = vi.fn().mockRejectedValue(new Error("smtp down"));
    const result = await createBooking(deps(store, { notify }), input());
    expect(notify).toHaveBeenCalledWith("created", expect.objectContaining({ id: result.booking.id }));
    expect(store.rows).toHaveLength(1);
    expect(result.booking.status).toBe("confirmed");
  });
});

describe("ownership, cancel, verify", () => {
  it("a user sees only their own bookings", async () => {
    const store = newStore();
    const { booking } = await createBooking(deps(store, { user: "u1" }), input());
    const other = deps(store, { user: "u2" });
    expect(await code(getBooking(other, booking.id))).toBe("not_found");
    expect(await listBookings(other)).toEqual([]);
    expect(await listBookings(deps(store, { user: "u1" }))).toHaveLength(1);
    expect(await code(cancel(other, booking.id, "x"))).toBe("not_found");
    expect(store.rows[0]!.status).toBe("confirmed");
  });
  it("cancel returns the refund percent and notifies, best-effort", async () => {
    const store = newStore();
    const notify = vi.fn().mockRejectedValue(new Error("down"));
    const d = deps(store, { notify });
    const { booking } = await createBooking(d, input());
    const result = await cancel(d, booking.id, "  Plans changed ");
    expect(result).toMatchObject({ refund_percent: 100, booking: { status: "cancelled", cancel_reason: "Plans changed", listing_title: "Sunrise PG" } });
    expect(notify).toHaveBeenLastCalledWith("cancelled", expect.anything());
  });
  it("verifyPayment checks ownership before verifying and rejects a mismatched order", async () => {
    const store = newStore();
    const { booking } = await createBooking(deps(store, { user: "u1", configured: true }), input());
    const proof = { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" };

    const stranger = deps(store, { user: "u2", configured: true });
    const spy = vi.spyOn(stranger.payments, "verifyCheckout");
    expect(await code(verifyPayment(stranger, booking.id, proof))).toBe("not_found");
    expect(spy).not.toHaveBeenCalled();

    const owner = deps(store, { user: "u1", configured: true });
    verifyTarget.id = "someone-elses";
    expect(await code(verifyPayment(owner, booking.id, proof))).toBe("bad_request");
    verifyTarget.id = booking.id;
    expect((await verifyPayment(owner, booking.id, proof)).id).toBe(booking.id);
  });
});

describe("payInstruction (pay again after closing checkout)", () => {
  async function held(hold: string | null = null) {
    const store = newStore();
    const d = deps(store, { configured: true });
    const { booking } = await createBooking(d, input());
    store.rows[0]!.hold_expires_at = hold;
    return { store, d, id: booking.id };
  }
  it("returns the online instruction for the caller's pending booking", async () => {
    const { d, id } = await held(new Date(NOW.getTime() + 600_000).toISOString());
    const result = await payInstruction(d, id);
    expect(result.payment).toMatchObject({ mode: "online", amount_paise: 189000 });
    expect(result.booking.listing_title).toBe("Sunrise PG");
  });
  it("is a 404 for someone else's booking", async () => {
    const { store, id } = await held();
    expect(await code(payInstruction(deps(store, { user: "u2", configured: true }), id))).toBe("not_found");
  });
  it("is a 409 when the booking is not pending or the hold ended", async () => {
    const { store, d, id } = await held();
    store.rows[0]!.status = "confirmed";
    expect(await code(payInstruction(d, id))).toBe("conflict");
    store.rows[0]!.status = "pending_payment";
    store.rows[0]!.hold_expires_at = new Date(NOW.getTime() - 1000).toISOString();
    expect(await code(payInstruction(d, id))).toBe("conflict");
  });
});
