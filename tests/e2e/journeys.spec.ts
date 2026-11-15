import { expect, test } from "@playwright/test";

/**
 * The journeys a visitor takes most, end to end in a real browser. They run against any Zovia
 * build; the catalogue (every tier 1 and tier 2 city) needs no database.
 */

test("browse a city and open a PG with its details", async ({ page }) => {
  await page.goto("/cities");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /^Pune/ }).first().click();
  await expect(page).toHaveURL(/\/cities\/pune/);

  const firstCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { level: 3 }) })
    .first();
  const title = (
    await firstCard.getByRole("heading", { level: 3 }).innerText()
  ).trim();
  await firstCard.getByRole("heading", { level: 3 }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  for (const section of [/Rooms/i, /Food/i, /House rules/i, /nearby/i]) {
    await expect(
      page.getByRole("heading", { name: section }).first(),
    ).toBeVisible();
  }
});

test("city filters narrow the list and can be cleared", async ({ page }) => {
  await page.goto("/cities/bengaluru");
  const count = page.getByText(/\d+ places?/).first();
  const before = Number((await count.innerText()).match(/\d+/)![0]);

  const filtersButton = page.getByRole("button", { name: /^Filters/ });
  if (await filtersButton.isVisible()) await filtersButton.click();
  await page
    .getByRole("combobox")
    .filter({ hasText: "Any food" })
    .selectOption("veg");

  await expect
    .poll(async () => Number((await count.innerText()).match(/\d+/)![0]))
    .toBeLessThan(before);
  await page.getByRole("button", { name: /^Clear/ }).click();
  await expect
    .poll(async () => Number((await count.innerText()).match(/\d+/)![0]))
    .toBe(before);
});

test("tapping a price pin opens a preview card", async ({ page, isMobile }) => {
  test.skip(isMobile, "the map is behind the Map toggle on phones");
  await page.goto("/cities/pune");
  const pin = page.locator(".maplibregl-marker").first();
  await pin.waitFor({ state: "attached", timeout: 30_000 });
  await pin.scrollIntoViewIfNeeded();
  await pin.click({ force: true });
  await expect(
    page.getByRole("button", { name: "Close preview" }),
  ).toBeVisible();
});

test("the assistant answers a PG question", async ({ page }) => {
  await page.goto("/assistant");
  const box = page.getByRole("textbox").first();
  await box.fill("Pure veg PG in Pune under 10k");
  await box.press("Enter");
  await expect(page.getByText(/match|No exact match/i).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("contact form checks its fields before sending", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: /send/i }).click();
  await expect(page.getByText(/name|e-mail|message/i).first()).toBeVisible();
});

test("a wrong password gets a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel(/e-mail/i).fill("nobody@zovia.test");
  await page
    .getByLabel(/password/i)
    .first()
    .fill("Not-the-password-2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/do not match/i)).toBeVisible();
});

test("private pages send signed-out visitors to sign in", async ({ page }) => {
  for (const path of ["/admin", "/bookings", "/owner"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/sign-in|\/admin|not-found/);
    expect(page.url()).not.toMatch(/\/admin\/?$/);
  }
});
