// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; status: string; roles: string[]; intent: null; onboarding_completed_at: string },
  limiter: { kind: "memory", limit: vi.fn() },
  service: {
    availability: vi.fn(),
    quote: vi.fn(),
    createBooking: vi.fn(),
    listBookings: vi.fn(),
    getBooking: vi.fn(),
    cancel: vi.fn(),
    verifyPayment: vi.fn(),
    payInstruction: vi.fn(),
  },
}));

vi.mock("@/server/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/env")>()),
  env: () => ({ NEXT_PUBLIC_SITE_URL: "https://zuvio.example" }),
}));
vi.mock("@/server/auth/session", () => ({
  getSession: vi.fn(async () => ({ supabase: { tag: "user" }, userId: state.user?.id ?? null })),
  getCurrentUser: vi.fn(async () => state.user),
}));
vi.mock("@/server/supabase/public", () => ({ createSupabasePublicClient: () => ({ tag: "public" }) }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => null }));
vi.mock("@/server/http/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http/rate-limit")>()),
  getRateLimiter: () => state.limiter,
}));
vi.mock("@/features/stays/wiring", () => ({ createStayDeps: (supabase: unknown) => ({ supabase }) }));
vi.mock("@/features/stays/service", () => state.service);

import { errors } from "@/server/http/errors";

import { GET as availabilityGET } from "./availability/route";
import { GET as listGET, POST as createPOST } from "./bookings/route";
import { GET as getGET } from "./bookings/[id]/route";
import { POST as cancelPOST } from "./bookings/[id]/cancel/route";
import { POST as payPOST } from "./bookings/[id]/pay/route";
import { POST as verifyPOST } from "./bookings/[id]/verify-payment/route";
import { POST as quotePOST } from "./quote/route";

const ID = "7b6f2c0e-58a5-4a57-9b1c-2f2f4f0f9a11";
const seg = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const req = (method: string, path: string, body?: unknown) =>
  new Request(`https://zuvio.example/api/v1/stays${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json", origin: "https://zuvio.example" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const stay = { listing: "sunrise-pg", checkin: "2026-12-01", checkout: "2026-12-04", rooms: [{ room_type: "double", qty: 2 }] };
const guest = { name: "Asha Rao", phone: "9876543210", email: "asha@example.com" };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const fn of Object.values(state.service)) fn.mockReset();
  state.user = { id: "u1", email: "asha@example.com", status: "active", roles: ["seeker"], intent: null, onboarding_completed_at: "2026-01-01T00:00:00Z" };
  state.limiter.limit.mockReset();
  state.limiter.limit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
});

describe("public routes", () => {
  it("GET availability works signed out and passes the query", async () => {
    state.user = null;
    state.service.availability.mockResolvedValue({ listing: "sunrise-pg", rooms: [] });
    const res = await availabilityGET(req("GET", "/availability?listing=sunrise-pg&checkin=2026-12-01&checkout=2026-12-04"), seg());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { listing: "sunrise-pg", rooms: [] } });
    expect(state.service.availability).toHaveBeenCalledWith(expect.anything(), "sunrise-pg", "2026-12-01", "2026-12-04");
  });
  it("GET availability is cacheable at the CDN for a short time", async () => {
    state.service.availability.mockResolvedValue({ rooms: [] });
    const res = await availabilityGET(req("GET", "/availability?listing=sunrise-pg&checkin=2026-12-01&checkout=2026-12-04"), seg());
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=15, stale-while-revalidate=30");
  });
  it("GET availability rejects a malformed date with 422", async () => {
    const res = await availabilityGET(req("GET", "/availability?listing=x&checkin=tomorrow&checkout=2026-12-04"), seg());
    expect(res.status).toBe(422);
  });
  it("POST quote returns the quote and validates rooms", async () => {
    state.user = null;
    state.service.quote.mockResolvedValue({ grand_total_inr: 1890 });
    const res = await quotePOST(req("POST", "/quote", stay), seg());
    expect(await res.json()).toEqual({ ok: true, data: { grand_total_inr: 1890 } });
    const bad = await quotePOST(req("POST", "/quote", { ...stay, rooms: [] }), seg());
    expect(bad.status).toBe(422);
  });
  it("uses the search rate limit", async () => {
    state.service.quote.mockResolvedValue({});
    await quotePOST(req("POST", "/quote", stay), seg());
    expect(state.limiter.limit).toHaveBeenCalledWith(expect.stringContaining("stays.quote"), expect.objectContaining({ max: 60 }));
  });
});

describe("bookings", () => {
  it("requires sign-in", async () => {
    state.user = null;
    expect((await listGET(req("GET", "/bookings"), seg())).status).toBe(401);
    expect((await createPOST(req("POST", "/bookings", { stay, guest, accept_policy: true }), seg())).status).toBe(401);
    expect((await getGET(req("GET", `/bookings/${ID}`), seg({ id: ID }))).status).toBe(401);
    expect((await cancelPOST(req("POST", `/bookings/${ID}/cancel`, {}), seg({ id: ID }))).status).toBe(401);
    expect((await verifyPOST(req("POST", `/bookings/${ID}/verify-payment`, {}), seg({ id: ID }))).status).toBe(401);
  });
  it("POST creates (201) with the booking rate limit", async () => {
    state.service.createBooking.mockResolvedValue({ booking: { id: ID }, payment: { mode: "at_property" } });
    const res = await createPOST(req("POST", "/bookings", { stay, guest, special_requests: "quiet", accept_policy: true }), seg());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { booking: { id: ID }, payment: { mode: "at_property" } } });
    expect(state.limiter.limit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ max: 5 }));
  });
  it("POST requires the policy to be accepted and a valid phone", async () => {
    expect((await createPOST(req("POST", "/bookings", { stay, guest, accept_policy: false }), seg())).status).toBe(422);
    expect((await createPOST(req("POST", "/bookings", { stay, guest: { ...guest, phone: "123" }, accept_policy: true }), seg())).status).toBe(422);
    expect(state.service.createBooking).not.toHaveBeenCalled();
  });
  it("maps a sold-out conflict to 409", async () => {
    state.service.createBooking.mockRejectedValue(errors.conflict("Triple sharing is sold out for these dates."));
    const res = await createPOST(req("POST", "/bookings", { stay, guest, accept_policy: true }), seg());
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("Triple sharing");
  });
  it("GET list and GET one", async () => {
    state.service.listBookings.mockResolvedValue([{ id: ID }]);
    expect((await (await listGET(req("GET", "/bookings"), seg())).json()).data).toEqual([{ id: ID }]);
    state.service.getBooking.mockResolvedValue({ id: ID });
    expect((await (await getGET(req("GET", `/bookings/${ID}`), seg({ id: ID }))).json()).data).toEqual({ id: ID });
    expect((await getGET(req("GET", "/bookings/not-a-uuid"), seg({ id: "not-a-uuid" }))).status).toBe(422);
  });
  it("someone else's booking is a 404", async () => {
    state.service.getBooking.mockRejectedValue(errors.notFound("Booking not found."));
    expect((await getGET(req("GET", `/bookings/${ID}`), seg({ id: ID }))).status).toBe(404);
  });
  it("cancel passes the reason", async () => {
    state.service.cancel.mockResolvedValue({ booking: { id: ID }, refund_percent: 100 });
    const res = await cancelPOST(req("POST", `/bookings/${ID}/cancel`, { reason: "Plans changed" }), seg({ id: ID }));
    expect(res.status).toBe(200);
    expect(state.service.cancel).toHaveBeenCalledWith(expect.anything(), ID, "Plans changed");
  });
  it("pay needs sign-in, uses the booking limit and returns the instruction; a settled booking is a 409", async () => {
    state.user = null;
    expect((await payPOST(req("POST", `/bookings/${ID}/pay`, {}), seg({ id: ID }))).status).toBe(401);
    state.user = { id: "u1", email: "asha@example.com", status: "active", roles: ["seeker"], intent: null, onboarding_completed_at: "2026-01-01T00:00:00Z" };
    state.service.payInstruction.mockResolvedValue({ booking: { id: ID }, payment: { mode: "online", order_id: "order_1" } });
    const res = await payPOST(req("POST", `/bookings/${ID}/pay`, {}), seg({ id: ID }));
    expect((await res.json()).data.payment.order_id).toBe("order_1");
    expect(state.service.payInstruction).toHaveBeenCalledWith(expect.anything(), ID);
    expect(state.limiter.limit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ max: 5 }));
    state.service.payInstruction.mockRejectedValue(errors.conflict("This booking is not waiting for payment."));
    expect((await payPOST(req("POST", `/bookings/${ID}/pay`, {}), seg({ id: ID }))).status).toBe(409);
    expect((await payPOST(req("POST", "/bookings/nope/pay", {}), seg({ id: "nope" }))).status).toBe(422);
  });
  it("verify-payment needs all three Razorpay fields and returns the booking", async () => {
    const proof = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" };
    expect((await verifyPOST(req("POST", `/bookings/${ID}/verify-payment`, { razorpay_order_id: "o" }), seg({ id: ID }))).status).toBe(422);
    state.service.verifyPayment.mockResolvedValue({ id: ID, status: "confirmed" });
    const res = await verifyPOST(req("POST", `/bookings/${ID}/verify-payment`, proof), seg({ id: ID }));
    expect((await res.json()).data).toEqual({ id: ID, status: "confirmed" });
    expect(state.service.verifyPayment).toHaveBeenCalledWith(expect.anything(), ID, proof);
  });
});
