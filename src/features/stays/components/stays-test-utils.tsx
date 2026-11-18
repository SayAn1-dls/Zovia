import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { vi } from "vitest";

import SessionProvider, { type SessionAdapter, type SessionSnapshot } from "@/components/session/session-context";

import type { StayAvailability, StayQuote } from "../schemas";

/** Test helpers for stay components: providers, a fetch mock speaking the API envelope, fixtures. */

export function sessionAdapter(snapshot: SessionSnapshot): SessionAdapter {
  return { subscribe: () => () => {}, getSnapshot: () => snapshot, getServerSnapshot: () => snapshot };
}

export const SIGNED_OUT: SessionSnapshot = { status: "signed_out", user: null };
export const SIGNED_IN: SessionSnapshot = {
  status: "signed_in",
  user: { id: "user-1", display_name: "Asha Rao", avatar_url: null, roles: ["seeker"] },
};

export function renderWithProviders(
  ui: ReactNode,
  options: { searchParams?: string; session?: SessionSnapshot; onUrlUpdate?: (event: UrlUpdateEvent) => void } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter searchParams={options.searchParams ?? ""} onUrlUpdate={options.onUrlUpdate} hasMemory>
        <SessionProvider adapter={sessionAdapter(options.session ?? SIGNED_OUT)}>{ui}</SessionProvider>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit | undefined) => { status?: number; body: unknown } | undefined;

/** Replaces global fetch; the handler answers `{ ok: true, data }` style bodies. */
export function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://zovia.test");
    const answer = handler(url, init) ?? { status: 404, body: { ok: false, error: { code: "not_found", message: "Not found." } } };
    const status = answer.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => answer.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const ok = (data: unknown) => ({ body: { ok: true, data } });

export const POLICY = {
  free_cancel_days: 7,
  check_in_time: "13:00",
  check_out_time: "10:00",
  lines: ["Free cancellation until 7 days before check-in."],
};

export function availabilityFixture(checkin = "2026-11-20", checkout = "2026-11-23"): StayAvailability {
  return {
    listing: "sunrise-pg",
    checkin,
    checkout,
    nights: 3,
    rooms: [
      {
        room_type: "single",
        label: "Single room",
        rent_per_month_inr: 9000,
        unit_price_inr: 300,
        units_total: 2,
        units_left: 2,
        sold_out: false,
        ac: true,
        attached_bathroom: true,
        strip: [],
      },
      {
        room_type: "double",
        label: "Double sharing",
        rent_per_month_inr: 6000,
        unit_price_inr: 200,
        units_total: 4,
        units_left: 0,
        sold_out: true,
        ac: false,
        attached_bathroom: false,
        strip: [
          { date: "2026-11-20", units_left: 0 },
          { date: "2026-11-21", units_left: 0 },
          { date: "2026-11-22", units_left: 0 },
          { date: "2026-11-23", units_left: 2 },
          { date: "2026-11-24", units_left: 3 },
          { date: "2026-11-25", units_left: 0 },
          { date: "2026-11-26", units_left: 1 },
        ],
      },
    ],
  };
}

export function quoteFixture(overrides: Partial<StayQuote> = {}): StayQuote {
  return {
    listing: "sunrise-pg",
    checkin: "2026-11-20",
    checkout: "2026-11-23",
    nights: 3,
    guests: 2,
    lines: [{ room_type: "single", label: "Single room", units: 2, unit_price_inr: 300, nights: 3, line_total_inr: 1800 }],
    stay_total_inr: 1800,
    tax_percent: 5,
    tax_inr: 90,
    grand_total_inr: 1890,
    payable_now_inr: 1890,
    available: true,
    shortfalls: [],
    policy: POLICY,
    ...overrides,
  };
}
