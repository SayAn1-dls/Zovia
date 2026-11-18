import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StayBookingPanel, previewSummary, shortfallText } from "./stay-booking-panel";
import { SIGNED_IN, availabilityFixture, mockApi, ok, quoteFixture, renderWithProviders } from "./stays-test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));

const SEARCH = "?checkin=2026-11-20&checkout=2026-11-23";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T06:00:00Z"));
  push.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function api() {
  return mockApi((url) => {
    if (url.pathname === "/api/v1/stays/availability") return ok(availabilityFixture(url.searchParams.get("checkin")!, url.searchParams.get("checkout")!));
    if (url.pathname === "/api/v1/stays/quote") return ok(quoteFixture());
    return undefined;
  });
}

afterEach(cleanup);

describe("StayBookingPanel", () => {
  it("lists room types, the sold-out strip, and a mobile bar asking to select rooms", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: SEARCH });
    expect(await screen.findByRole("heading", { name: "Single room" })).toBeInTheDocument();
    expect(screen.getByText("Sold out for these dates")).toBeInTheDocument();
    expect(screen.getByText("2 beds left")).toBeInTheDocument();
    const bar = screen.getByTestId("stay-mobile-bar");
    expect(within(bar).getByRole("link", { name: "Select rooms" })).toHaveAttribute("href", "#book");
    expect(screen.getAllByRole("button", { name: /book now/i })[0]).toBeDisabled();
  });

  it("offers similar places with beds under the first sold-out card only", async () => {
    mockApi((url) => {
      if (url.pathname === "/api/v1/stays/availability") {
        return ok({ ...availabilityFixture(), alternatives: [{ slug: "green-pg", title: "Green PG", locality: "Indiranagar", unit_price_from_inr: 250 }] });
      }
      return undefined;
    });
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: SEARCH });
    expect(await screen.findByText("Similar places nearby that have beds")).toBeInTheDocument();
    expect(screen.getAllByText("Similar places nearby that have beds")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Green PG/ })).toHaveAttribute("href", "/properties/green-pg?checkin=2026-11-20&checkout=2026-11-23");
  });

  it("tells the guest when a shared link's dates were replaced, and the notice can be dismissed", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: "?checkin=2020-01-01&checkout=2020-01-03" });
    const text = await screen.findByText("Your dates were updated to Fri, 20 Nov to Sat, 21 Nov.");
    expect(text.closest('[role="status"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Your dates were updated/)).not.toBeInTheDocument();
  });

  it("says nothing when the link's dates are fine", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: SEARCH });
    await screen.findByRole("heading", { name: "Single room" });
    expect(screen.queryByText(/Your dates were updated/)).not.toBeInTheDocument();
  });

  it("writes the chosen bed to the URL", async () => {
    api();
    const onUrlUpdate = vi.fn();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: SEARCH, onUrlUpdate });
    fireEvent.click(await screen.findByRole("button", { name: "Select bed" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const params = onUrlUpdate.mock.calls.at(-1)![0].searchParams as URLSearchParams;
    expect(params.get("rooms")).toBe("single@1");
    expect(params.get("checkin")).toBe("2026-11-20");
    expect(params.get("checkout")).toBe("2026-11-23");
  });

  it("never nests a block inside a paragraph in the mobile bar (that broke hydration on shared links)", async () => {
    // Quote still loading: the bar shows a Skeleton (a div). QA found <div> inside <p> -> React error #418.
    const answer = api();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/stays/quote") ? new Promise(() => {}) : answer(input, init),
    );
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@1` });
    const bar = screen.getByTestId("stay-mobile-bar");
    expect(within(bar).getByText("Payable now")).toBeInTheDocument();
    expect(bar.querySelectorAll("p div, p p, p section")).toHaveLength(0);
  });

  it("caps the stepper at the beds left", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@2` });
    const more = await screen.findByRole("button", { name: /one more \(single room beds\)/i });
    expect(more).toBeDisabled();
    expect(screen.getByText("Only 2 beds left.")).toBeInTheDocument();
  });

  it("shows the server quote in the mobile bar and sends signed-out guests to sign-in", async () => {
    const fetchMock = api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@2` });
    const bar = screen.getByTestId("stay-mobile-bar");
    await waitFor(() => expect(within(bar).getByText("₹1,890")).toBeInTheDocument());
    expect(within(bar).getByText("Payable now")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "View summary" })).toBeInTheDocument();

    const quoteCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/stays/quote"));
    expect(JSON.parse(String(quoteCall![1]!.body))).toEqual({
      listing: "sunrise-pg",
      checkin: "2026-11-20",
      checkout: "2026-11-23",
      rooms: [{ room_type: "single", qty: 2 }],
    });

    const book = screen.getAllByRole("button", { name: /book now/i })[0]!;
    await waitFor(() => expect(book).toBeEnabled());
    fireEvent.click(book);
    const target = new URL(push.mock.calls[0]![0], "http://zovia.test");
    expect(target.pathname).toBe("/sign-in");
    expect(target.searchParams.get("next")).toBe("/book/sunrise-pg?checkin=2026-11-20&checkout=2026-11-23&rooms=single%402");
  });

  it("the summary sheet has one heading (Your stay), not a second Price details heading", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@2` });
    const bar = screen.getByTestId("stay-mobile-bar");
    await waitFor(() => expect(within(bar).getByText("₹1,890")).toBeInTheDocument());
    fireEvent.click(within(bar).getByRole("button", { name: "View summary" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("heading", { name: /your stay|price details/i })).toHaveLength(1);
  });

  it("goes straight to /book when signed in", async () => {
    api();
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@2`, session: SIGNED_IN });
    const book = screen.getAllByRole("button", { name: /book now/i })[0]!;
    await waitFor(() => expect(book).toBeEnabled());
    fireEvent.click(book);
    expect(push).toHaveBeenCalledWith("/book/sunrise-pg?checkin=2026-11-20&checkout=2026-11-23&rooms=single%402");
  });

  it("blocks booking when the quote says the beds are gone", async () => {
    mockApi((url) => {
      if (url.pathname === "/api/v1/stays/availability") return ok(availabilityFixture());
      if (url.pathname === "/api/v1/stays/quote")
        return ok(quoteFixture({ available: false, shortfalls: [{ room_type: "single", requested: 2, available: 1 }] }));
      return undefined;
    });
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: `${SEARCH}&rooms=single@2` });
    expect((await screen.findAllByText(/Single room has only 1 bed left for these dates/))[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /book now/i })[0]).toBeDisabled();
  });

  it("shows an error with a retry when rooms fail to load", async () => {
    mockApi(() => ({ status: 404, body: { ok: false, error: { code: "not_found", message: "We could not find that listing." } } }));
    renderWithProviders(<StayBookingPanel slug="sunrise-pg" nightlyFrom={200} />, { searchParams: SEARCH });
    expect(await screen.findByText("Rooms did not load")).toBeInTheDocument();
    expect(screen.getByText("We could not find that listing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("previews the price from the availability while the quote loads", () => {
    const preview = previewSummary(availabilityFixture(), {
      checkin: "2026-11-20",
      checkout: "2026-11-23",
      nights: 3,
      rooms: [{ room_type: "single", qty: 2 }],
    });
    expect(preview).toMatchObject({ stay_total_inr: 1800, tax_percent: 5, tax_inr: 90, payable_now_inr: 1890 });
  });

  it("explains shortfalls", () => {
    expect(shortfallText({ shortfalls: [{ room_type: "double", requested: 2, available: 0 }] })).toBe(
      "Double sharing is sold out for these dates. Change the dates or the number of beds.",
    );
  });
});
