import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StayCheckout } from "./stay-checkout";
import { SIGNED_IN, mockApi, ok, quoteFixture, renderWithProviders } from "./stays-test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));

const SEARCH = "?checkin=2026-11-20&checkout=2026-11-23&rooms=single@2";
const LISTING = { slug: "sunrise-pg", title: "Sunrise PG", place: "Koramangala, Bengaluru" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T06:00:00Z"));
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderCheckout(mode: "online" | "at_property" = "at_property") {
  return renderWithProviders(<StayCheckout listing={LISTING} defaults={{ name: "", email: "asha@example.com" }} expectedMode={mode} />, {
    searchParams: SEARCH,
    session: SIGNED_IN,
  });
}

describe("StayCheckout", () => {
  it("re-quotes on load, prefills the account and says plainly when nothing is charged", async () => {
    const fetchMock = mockApi((url) => (url.pathname === "/api/v1/stays/quote" ? ok(quoteFixture()) : undefined));
    renderCheckout();
    expect(await screen.findByText("Single room × 2")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/stays/quote"))).toBe(true);
    expect(screen.getByLabelText("E-mail")).toHaveValue("asha@example.com");
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toHaveValue("Asha Rao"));
    expect(screen.getByText("Pay at the property. Nothing is charged now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeInTheDocument();
  });

  it("labels the button for online payment", async () => {
    mockApi((url) => (url.pathname === "/api/v1/stays/quote" ? ok(quoteFixture()) : undefined));
    renderCheckout("online");
    expect(await screen.findByRole("button", { name: "Confirm and pay" })).toBeInTheDocument();
    expect(screen.queryByText("Pay at the property. Nothing is charged now.")).not.toBeInTheDocument();
  });

  it("sends the total the guest saw, and normalises a phone typed with +91 and spaces", async () => {
    const fetchMock = mockApi((url, init) => {
      if (url.pathname === "/api/v1/stays/quote") return ok(quoteFixture());
      if (url.pathname === "/api/v1/stays/bookings" && init?.method === "POST") {
        return ok({ booking: { id: "6b2f2d4e-0000-4000-8000-000000000001" }, payment: { mode: "at_property" } });
      }
      return undefined;
    });
    renderCheckout();
    const confirm = await screen.findByRole("button", { name: "Confirm booking" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "+91 98765 43210" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/stays/bookings") && init?.method === "POST");
    const body = JSON.parse(String(call![1]!.body));
    expect(body.expected_total_inr).toBe(1890);
    expect(body.guest.phone).toBe("9876543210");
    expect(screen.queryByText(/Your dates were updated/)).not.toBeInTheDocument();
  });

  it("tells the guest when the link's dates were replaced", async () => {
    mockApi((url) => (url.pathname === "/api/v1/stays/quote" ? ok(quoteFixture()) : undefined));
    renderWithProviders(<StayCheckout listing={LISTING} defaults={{ name: "", email: "a@b.com" }} expectedMode="at_property" />, {
      searchParams: "?checkin=2020-01-01&checkout=2020-01-03&rooms=single@2",
      session: SIGNED_IN,
    });
    expect(await screen.findByText(/Your dates were updated to/)).toBeInTheDocument();
  });

  it("validates the form with the shared schema", async () => {
    const fetchMock = mockApi((url) => (url.pathname === "/api/v1/stays/quote" ? ok(quoteFixture()) : undefined));
    renderCheckout();
    const confirm = await screen.findByRole("button", { name: "Confirm booking" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "12345" } });
    fireEvent.click(confirm);
    expect(await screen.findByText("Enter a 10-digit mobile number.")).toBeInTheDocument();
    expect(screen.getByText("Please accept the policies to continue.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/stays/bookings"))).toBe(false);
  });

  it("shows API field errors on the fields and confirms pay-at-property bookings", async () => {
    let attempts = 0;
    mockApi((url, init) => {
      if (url.pathname === "/api/v1/stays/quote") return ok(quoteFixture());
      if (url.pathname === "/api/v1/stays/bookings" && init?.method === "POST") {
        attempts += 1;
        if (attempts === 1) {
          return {
            status: 422,
            body: { ok: false, error: { code: "validation_failed", message: "Check the highlighted fields.", details: { formErrors: [], fieldErrors: { "guest.phone": ["This number can't take bookings."] } } } },
          };
        }
        return ok({ booking: { id: "6b2f2d4e-0000-4000-8000-000000000001" }, payment: { mode: "at_property" } });
      }
      return undefined;
    });
    renderCheckout();
    const confirm = await screen.findByRole("button", { name: "Confirm booking" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    expect(await screen.findByText("This number can't take bookings.")).toBeInTheDocument();
    expect(screen.getByText("Check the highlighted fields.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/bookings/6b2f2d4e-0000-4000-8000-000000000001"));
  });

  it("says clearly when the stay is no longer available", async () => {
    mockApi((url) =>
      url.pathname === "/api/v1/stays/quote"
        ? ok(quoteFixture({ available: false, shortfalls: [{ room_type: "single", requested: 2, available: 0 }] }))
        : undefined,
    );
    renderCheckout();
    expect(await screen.findByText("This stay is no longer available")).toBeInTheDocument();
    expect(screen.getByText(/Single room is sold out for these dates/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm booking" })).toBeDisabled();
  });
});
