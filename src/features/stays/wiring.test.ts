// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const notifyStayEvent = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("./notifications", () => ({ notifyStayEvent: (...args: unknown[]) => notifyStayEvent(...args) }));

import type { StayBooking } from "./schemas";
import { notifyAfterResponse } from "./wiring";

const booking = { id: "11111111-2222-4333-8444-555555555555" } as StayBooking;

describe("notifyAfterResponse", () => {
  it("returns at once and leaves the e-mails to run after the response", async () => {
    // A mail provider that never answers: before the fix, booking and cancelling waited on it (QA: 8 s per request).
    notifyStayEvent.mockReturnValue(new Promise(() => {}));
    const scheduled: (() => Promise<unknown>)[] = [];
    const notify = notifyAfterResponse((task) => scheduled.push(task));

    await expect(notify("created", booking)).resolves.toBeUndefined();
    expect(notifyStayEvent).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    void scheduled[0]!();
    expect(notifyStayEvent).toHaveBeenCalledWith("created", booking);
  });
});
