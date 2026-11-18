import "server-only";

import { after } from "next/server";

import type { AppSupabaseClient } from "@/server/supabase/types";

import { notifyStayEvent } from "./notifications";
import { createStayPayments } from "./payment";
import { createStayRepository } from "./repository";
import type { StayDeps } from "./service";

/**
 * Sends the booking e-mails after the response has gone out. The team mail can take up to 14 s
 * (Resend, then FormSubmit, each with its own timeout), and a guest must not wait for it to see
 * their booking. notifyStayEvent never throws; it logs what did not go out.
 */
export function notifyAfterResponse(schedule: (task: () => Promise<unknown>) => void = after): NonNullable<StayDeps["notify"]> {
  return (event, booking) => {
    schedule(() => notifyStayEvent(event, booking));
    return Promise.resolve();
  };
}

/** Production dependencies for one request (RLS as the caller's Supabase client). */
export function createStayDeps(supabase: AppSupabaseClient): StayDeps {
  return {
    repo: createStayRepository(supabase),
    payments: createStayPayments(),
    now: () => new Date(),
    notify: notifyAfterResponse(),
  };
}
