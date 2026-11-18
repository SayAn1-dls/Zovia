import { readFileSync } from "node:fs";

import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

/**
 * Stay booking (Zostel style, docs/stay-booking.md) end to end against a REAL database:
 * the listing panel and its URL state, prices against the documented formulas, a sold-out room
 * type, Book now -> sign up -> back to checkout, confirm, the booking page, cancel, and the
 * contact form refusing the inbox's own address.
 *
 * Needs a build pointed at Supabase with the stay inventory loaded
 * (`supabase db query -f scripts/sync-stay-inventory.sql`), sign-up without e-mail confirmation
 * (the local default) and no Razorpay keys (bookings are "pay at the property"). Skipped
 * automatically when the stay API is not backed by a database.
 *
 * One run (both projects) signs up 6 accounts and sends 2 contact messages from this IP; the app
 * allows 10 sign-ups per 10 minutes and 5 contact messages per hour per IP, so a second run right
 * after the first is throttled by design. Locally, `delete from public.rate_limits` resets that.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3300 PW_CHANNEL=chrome \
 *     pnpm exec playwright test tests/e2e/stay-booking.spec.ts --project=chromium --project=mobile-chrome
 */

/**
 * Catalogue listings with all three room types and exactly one single bed (catalogue data). One is
 * picked per run, because the database caps pay-at-property bookings per listing per day
 * (20261120000300_stay_abuse_caps.sql), so reruns spread over several places.
 */
const CANDIDATES = [
  "aashiyana-girls-pg-marathahalli-bengaluru",
  "blue-bell-boys-pg-shahpura-bhopal",
  "blue-bell-girls-pg-sector-35-chandigarh",
];
type RoomType = "single" | "double" | "triple";
let SLUG = CANDIDATES[0]!;
/** Monthly rent and capacity per room type, read from the availability API (the database's copy of the catalogue). */
const RENT: Record<RoomType, number> = { single: 0, double: 0, triple: 0 };
const UNITS: Record<RoomType, number> = { single: 0, double: 0, triple: 0 };
const PASSWORD = "Stay-QA-2026-pass";

const nightly = (rent: number) => Math.ceil(rent / 30);
const taxOn = (stayTotal: number, percent: number) => Math.floor((stayTotal * percent + 50) / 100);
const inr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

/** India date `days` from today. */
function isoDay(days: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/** A check-in far enough ahead (and random) that reruns and parallel tests never share nights. */
function freshCheckin(): number {
  return 20 + Math.floor(Math.random() * 300);
}

function uniqueEmail(tag: string): string {
  return `qa+${tag}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@example.com`;
}

async function apiAs(baseURL: string, playwright: PlaywrightWorkerArgs["playwright"], email: string): Promise<APIRequestContext> {
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: new URL(baseURL).origin } });
  const res = await api.post("/api/v1/auth/sign-up", { data: { full_name: "QA Other Guest", email, password: PASSWORD } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return api;
}

async function mobileWidth(page: Page, isMobile: boolean) {
  if (isMobile) await page.setViewportSize({ width: 375, height: 812 });
}

test.beforeAll(async ({ request }) => {
  SLUG = CANDIDATES[Math.floor(Math.random() * CANDIDATES.length)]!;
  const res = await request.get(`/api/v1/stays/availability?listing=${SLUG}&checkin=${isoDay(30)}&checkout=${isoDay(31)}`);
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: { rooms?: { room_type: RoomType; rent_per_month_inr: number; units_total: number }[] };
  } | null;
  test.skip(!body?.ok || !body.data?.rooms?.length, "stay inventory is not loaded in this database");
  for (const room of body!.data!.rooms!) {
    RENT[room.room_type] = room.rent_per_month_inr;
    UNITS[room.room_type] = room.units_total;
  }
  expect(UNITS).toMatchObject({ single: 1 });
  expect(UNITS.double).toBeGreaterThanOrEqual(2);
  expect(UNITS.triple).toBeGreaterThanOrEqual(2);
});

test("listing panel: dates, room cards, steppers, price and URL state", async ({ page, isMobile }) => {
  await mobileWidth(page, isMobile);
  const checkin = isoDay(freshCheckin());
  await page.goto(`/properties/${SLUG}?checkin=${checkin}&checkout=${isoDay(0) /* invalid: before check-in */}`);
  const panel = page.locator("#book");
  await expect(panel.getByRole("heading", { name: "Book your stay" })).toBeVisible();

  // Room cards with the nightly price = ceil(rent / 30).
  for (const [type, rent] of Object.entries(RENT)) {
    const label = { single: "Single room", double: "Double sharing", triple: "Triple sharing" }[type]!;
    const card = panel.getByRole("article", { name: label }).or(panel.locator("li").filter({ hasText: label })).first();
    await expect(card).toContainText(inr(nightly(rent)));
  }

  // An impossible check-out was corrected to one night after check-in.
  await expect(page.getByLabel("Check-in").filter({ visible: true })).toHaveValue(checkin);
  const checkout = await page.getByLabel("Check-out").filter({ visible: true }).inputValue();
  expect(checkout > checkin).toBe(true);

  // Pick two nights, 2 double beds and 1 triple bed.
  const twoNightsOut = new Date(Date.parse(`${checkin}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Check-out").filter({ visible: true }).fill(twoNightsOut);
  const selectButtons = panel.getByRole("button", { name: "Select bed" });
  await selectButtons.nth(1).click(); // double
  await panel.getByRole("button", { name: /One more \(double/i }).click();
  await panel.getByRole("button", { name: "Select bed" }).nth(1).click(); // triple (single is still first)
  for (let more = 2; more < UNITS.double; more += 1) await panel.getByRole("button", { name: /One more \(double/i }).click();
  await expect(page).toHaveURL(new RegExp(`checkin=${checkin}&checkout=${twoNightsOut}&rooms=double(%40|@)${UNITS.double}(%2C|,)triple(%40|@)1`));

  // The double stepper stops at the free beds.
  await expect(panel.getByRole("button", { name: /One more \(double/i })).toBeDisabled();

  const stay = nightly(RENT.double) * UNITS.double * 2 + nightly(RENT.triple) * 1 * 2;
  const total = stay + taxOn(stay, 5);
  const summary = isMobile ? page.getByTestId("stay-mobile-bar") : page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Your stay" }) }).last();
  await expect(summary).toContainText(inr(total));

  // A reload keeps the cart.
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`rooms=double(%40|@)${UNITS.double}`));
  await expect(panel.getByRole("group", { name: /double/i })).toContainText(String(UNITS.double));

  if (isMobile) {
    await page.getByTestId("stay-mobile-bar").getByRole("button", { name: "View summary" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Tax (5%)");
    await expect(sheet).toContainText(inr(taxOn(stay, 5)));
    await expect(sheet).toContainText(inr(total));
    await expect(sheet.getByRole("button", { name: "Book now" })).toBeEnabled();
  } else {
    await expect(page.getByText("Tax (5%)").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Book now" })).toBeEnabled();
  }

  // The server quote agrees with the formulas.
  const quote = await page.request.post("/api/v1/stays/quote", {
    headers: { origin: new URL(page.url()).origin },
    data: { listing: SLUG, checkin, checkout: twoNightsOut, rooms: [{ room_type: "double", qty: UNITS.double }, { room_type: "triple", qty: 1 }] },
  });
  const q = (await quote.json()).data;
  expect(q).toMatchObject({ nights: 2, stay_total_inr: stay, tax_percent: 5, tax_inr: taxOn(stay, 5), grand_total_inr: total, payable_now_inr: total });
});

test("a sold-out room type shows the 7-night strip and cannot be booked", async ({ page, isMobile, baseURL, playwright }) => {
  await mobileWidth(page, isMobile);
  const days = freshCheckin();
  const checkin = isoDay(days);
  const checkout = isoDay(days + 2);

  // Another guest books the only single bed for these nights through the API.
  const other = await apiAs(baseURL!, playwright, uniqueEmail("other"));
  const booked = await other.post("/api/v1/stays/bookings", {
    data: {
      stay: { listing: SLUG, checkin, checkout, rooms: [{ room_type: "single", qty: 1 }] },
      guest: { name: "QA Other Guest", phone: "9876500001", email: "qa+other@example.com" },
      accept_policy: true,
    },
  });
  expect(booked.status(), await booked.text()).toBe(201);

  await page.goto(`/properties/${SLUG}?checkin=${checkin}&checkout=${checkout}&rooms=single@1`);
  const card = page.locator("#book li").filter({ hasText: "Single room" }).first();
  await expect(card).toContainText("Sold out for these dates");
  await expect(card.getByRole("list", { name: /Single room: beds per night/ }).getByRole("listitem")).toHaveCount(7);
  await expect(card.getByRole("button", { name: "Select bed" })).toHaveCount(0);
  // The single bed in the URL cannot be booked: the quote reports it and Book now stays off.
  if (isMobile) await page.getByTestId("stay-mobile-bar").getByRole("button", { name: "View summary" }).click();
  await expect(page.getByText(/Single room is sold out/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Book now" }).filter({ visible: true })).toBeDisabled();
  if (isMobile) await page.keyboard.press("Escape");

  // The day after the booking ends is free again in the strip (check-out day is bookable).
  await expect(card.getByRole("button", { name: /full/ })).toHaveCount(2);

  // Booking it anyway through the API is refused with a clear conflict.
  const second = await other.post("/api/v1/stays/bookings", {
    data: {
      stay: { listing: SLUG, checkin, checkout, rooms: [{ room_type: "single", qty: 1 }] },
      guest: { name: "QA Other Guest", phone: "9876500001", email: "qa+other@example.com" },
      accept_policy: true,
    },
  });
  expect(second.status()).toBe(409);
  expect((await second.json()).error.message).toMatch(/sold out/i);
  await other.dispose();
});

async function signUpThroughBookNow(page: Page, email: string) {
  await page.getByRole("button", { name: "Book now" }).first().click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  const next = new URL(page.url()).searchParams.get("next")!;
  expect(next).toMatch(new RegExp(`^/book/${SLUG}\\?checkin=.*rooms=`));

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=/);
  // Role queries only: Next keeps the previous page in the DOM (hidden) after a client navigation.
  await page.getByRole("textbox", { name: "Your name" }).fill("QA Stay Guest");
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // New accounts finish a short profile first, then continue to the booking.
  await page.waitForURL(/\/onboarding|\/book\//, { timeout: 30_000 });
  if (page.url().includes("/onboarding")) {
    await page.locator('input[type="radio"]').first().check({ force: true });
    await page.getByRole("combobox", { name: "You are a" }).selectOption({ index: 1 });
    const workplace = page.getByRole("textbox", { name: "Where you work" });
    const college = page.getByRole("textbox", { name: "College or university" });
    if (await workplace.isVisible()) await workplace.fill("Whitefield");
    if (await college.isVisible()) await college.fill("QA College");
    await page.getByRole("combobox", { name: "City" }).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL(new RegExp(`/book/${SLUG}\\?`), { timeout: 30_000 });
  return next;
}

test("book: Book now -> sign up -> checkout -> confirm -> booking page -> cancel", async ({ page, isMobile, baseURL, playwright }) => {
  test.setTimeout(120_000);
  await mobileWidth(page, isMobile);
  const days = freshCheckin();
  const checkin = isoDay(days);
  const checkout = isoDay(days + 3);
  await page.goto(`/properties/${SLUG}?checkin=${checkin}&checkout=${checkout}&rooms=triple@2`);
  if (isMobile) await page.getByTestId("stay-mobile-bar").getByRole("button", { name: "View summary" }).click();
  await expect(page.getByRole("button", { name: "Book now" }).first()).toBeEnabled({ timeout: 20_000 });

  const email = uniqueEmail("guest");
  const next = await signUpThroughBookNow(page, email);
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(next);

  // Checkout: same selection and price, pay at the property.
  const stay = nightly(RENT.triple) * 2 * 3;
  const total = stay + taxOn(stay, 5);
  await expect(page.getByRole("heading", { name: "Confirm your stay" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Your stay" })).toContainText(inr(total));
  await expect(page.getByText("Pay at the property. Nothing is charged now.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "E-mail" })).toHaveValue(email);

  // Invalid input shows field errors; the policy box is required.
  await page.getByRole("textbox", { name: "Full name" }).fill("Q");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("12345");
  const confirm = page.getByRole("button", { name: "Confirm booking" });
  await confirm.click();
  await expect(page.getByText("Enter your name.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Enter a 10-digit mobile number.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Please accept the policies to continue.").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveURL(/\/book\//);

  await page.getByRole("textbox", { name: "Full name" }).fill("QA Stay Guest");
  await page.getByRole("textbox", { name: "Mobile number" }).fill("9876543210");
  await page.getByRole("textbox", { name: /Special requests/ }).fill("Arriving around 6 PM.");
  await page.getByRole("checkbox", { name: /I accept the cancellation policy/ }).check();
  // A double click must create exactly one booking.
  await confirm.dblclick();
  await page.waitForURL(/\/bookings\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const bookingId = page.url().split("/").pop()!;

  // Booking page. (Next keeps the checkout page hidden in the DOM, so only visible text counts.)
  await expect(page.getByText("Confirmed", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Booking confirmed").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Triple sharing × 2").filter({ visible: true })).toBeVisible();
  await expect(page.getByText(inr(total)).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/Tax \(5%\)/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/before check-in/i).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Send details on WhatsApp" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Share" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const ics = readFileSync(await (await download).path(), "utf8");
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain(`DTSTART`);
  expect(ics).toMatch(/END:VCALENDAR\r?\n?$/);

  // Exactly one booking was created by the double click, and /bookings lists it.
  const mine = await page.request.get("/api/v1/stays/bookings");
  const list = (await mine.json()).data as { id: string; checkin: string }[];
  expect(list.filter((b) => b.checkin === checkin)).toHaveLength(1);
  await page.goto("/bookings");
  await expect(page.locator(`a[href="/bookings/${bookingId}"]`).first()).toBeVisible();

  // The beds are held: two triple beds fewer for these nights.
  const held = await page.request.get(`/api/v1/stays/availability?listing=${SLUG}&checkin=${checkin}&checkout=${checkout}`);
  expect(((await held.json()).data.rooms as { room_type: string; units_left: number }[]).find((r) => r.room_type === "triple")!.units_left).toBe(UNITS.triple - 2);

  // Another user cannot see it.
  const other = await apiAs(baseURL!, playwright, uniqueEmail("snoop"));
  expect((await other.get(`/api/v1/stays/bookings/${bookingId}`)).status()).toBe(404);
  expect((await other.post(`/api/v1/stays/bookings/${bookingId}/cancel`, { data: {} })).status()).toBe(404);
  await other.dispose();

  // Cancel from the booking page.
  await page.goto(`/bookings/${bookingId}`);
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog).toContainText("Nothing was charged");
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Cancelled", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Booking cancelled.").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

  // Beds are free again; a second cancel is refused cleanly.
  const freed = await page.request.get(`/api/v1/stays/availability?listing=${SLUG}&checkin=${checkin}&checkout=${checkout}`);
  expect(((await freed.json()).data.rooms as { room_type: string; units_left: number }[]).find((r) => r.room_type === "triple")!.units_left).toBe(UNITS.triple);
  const again = await page.request.post(`/api/v1/stays/bookings/${bookingId}/cancel`, { headers: { origin: new URL(page.url()).origin }, data: {} });
  expect(again.status()).toBe(409);
  expect((await again.json()).error.message).toMatch(/already cancelled/i);
});

async function submitContact(page: Page, email: string) {
  await page.goto("/contact");
  await page.getByRole("textbox", { name: "Name" }).fill("QA Contact");
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
  await page.getByRole("textbox", { name: "Subject" }).fill("Stay QA");
  await page.getByRole("textbox", { name: "Message" }).fill("Checking the contact form from the automated stay QA run.");
  const response = page.waitForResponse((res) => res.url().endsWith("/api/v1/contact") && res.request().method() === "POST");
  await page.getByRole("button", { name: /send/i }).click();
  return response;
}

test("contact: the inbox's own address is refused under the e-mail field; an ordinary one is accepted", async ({ page, isMobile }) => {
  test.skip(isMobile, "form logic is the same on phones");
  // Every attempt counts against the contact limit (5 per hour per IP); other spellings of the
  // inbox (Gmail dots, +tags, googlemail.com) are covered by src/server/email/inbox.test.ts.
  const refused = await submitContact(page, "Sayan.Bh.Work+stays@gmail.com");
  test.skip(refused.status() === 429, "contact form rate limit reached for this IP; rerun within the hour is throttled by design");
  expect(refused.status()).toBe(422);
  await expect(page.getByRole("textbox", { name: "E-mail" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use your own e-mail address. This one can't be used to contact us.").first()).toBeVisible();

  // An ordinary address passes validation (delivery itself may fail locally: 201 stored, or 503).
  const accepted = await submitContact(page, uniqueEmail("contact"));
  expect([201, 503]).toContain(accepted.status());
  await expect(page.getByText("Use your own e-mail address.")).toHaveCount(0);
});
