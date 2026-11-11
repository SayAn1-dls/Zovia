import { expect, test } from "@playwright/test";

test("home page responds with 200 and has a title", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  expect((await page.title()).trim()).not.toBe("");
  await expect(page.getByRole("heading", { name: "ZUVIO" })).toBeVisible();
});
