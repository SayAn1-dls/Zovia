import { expect, test, type Page } from "@playwright/test";

/**
 * Layout guard for the listing page's booking column (the owner's "the booking section slides
 * over the form" report): the sticky price summary must never cover the "Have a question?"
 * disclosure or any field of its form at any scroll position, it must stay inside its own panel,
 * and phones must not scroll sideways or hide the last field behind the booking bar.
 *
 * Works with or without the stay database (without it the summary still renders, rooms show an
 * error). Run against any build:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3400 PW_CHANNEL=chrome \
 *     pnpm exec playwright test tests/e2e/booking-layout.spec.ts --project=chromium
 */

const SLUG = "aashiyana-girls-pg-marathahalli-bengaluru";

function isoDay(days: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/** Visible elements only (see the note in scanForOverlap about the streaming copy). */
const shown = (page: Page, testId: string) => page.locator(`[data-testid="${testId}"]:visible`);

const LISTING = `/properties/${SLUG}?checkin=${isoDay(40)}&checkout=${isoDay(41)}&rooms=double@1`;

type Problem = { y: number; what: string };

/**
 * Scrolls the whole page in steps and reports every position where the summary overlaps the
 * disclosure, leaves its panel, or where a probe point inside the disclosure (its toggle and,
 * when open, each form control) is hit-tested to something else (i.e. it is covered).
 */
async function scanForOverlap(page: Page): Promise<{ problems: Problem[]; positions: number; probesChecked: number }> {
  return page.evaluate(() => {
    // The rendered copy only: while the page streams in, React can briefly hold a hidden second one.
    const shown = <T extends HTMLElement>(selector: string) =>
      Array.from(document.querySelectorAll<T>(selector)).find((element) => element.getClientRects().length > 0)!;
    const summary = shown<HTMLElement>('[data-testid="stay-summary"]');
    const panel = shown<HTMLElement>('[data-testid="stay-booking"]');
    const disclosure = shown<HTMLDetailsElement>('[data-testid="question-disclosure"]');
    const probes = [
      disclosure.querySelector("summary")!,
      ...(disclosure.open ? Array.from(disclosure.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href]")) : []),
    ];
    const problems: { y: number; what: string }[] = [];
    let probesChecked = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const step = 120;
    let positions = 0;
    for (let y = 0; y <= max + step; y += step) {
      window.scrollTo({ top: Math.min(y, max), behavior: "instant" });
      positions += 1;
      const s = summary.getBoundingClientRect();
      const d = disclosure.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const overlap = Math.min(s.bottom, d.bottom) - Math.max(s.top, d.top) > 0.5 && Math.min(s.right, d.right) - Math.max(s.left, d.left) > 0.5;
      if (s.height > 0 && overlap) problems.push({ y, what: `summary ${Math.round(s.top)}-${Math.round(s.bottom)} overlaps disclosure ${Math.round(d.top)}-${Math.round(d.bottom)}` });
      if (s.height > 0 && s.bottom > p.bottom + 0.5) problems.push({ y, what: "summary leaves its panel" });
      for (const probe of probes) {
        const r = probe.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // Only points in the viewport below the sticky header and the page's section nav.
        if (cy < 120 || cy > window.innerHeight - 1 || cx < 0 || cx > window.innerWidth) continue;
        probesChecked += 1;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(probe === hit || probe.contains(hit) || hit.contains(probe))) {
          problems.push({ y, what: `${probe.tagName.toLowerCase()} "${(probe.textContent || probe.getAttribute("name") || "").trim().slice(0, 30)}" is covered by ${hit?.closest("[data-testid]")?.getAttribute("data-testid") ?? hit?.tagName}` });
        }
      }
    }
    return { problems, positions, probesChecked };
  });
}

test.describe("listing booking column layout", () => {
  test("desktop: the sticky summary never covers the question disclosure or its form", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop layout");
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(LISTING);
      await expect(page.getByRole("heading", { name: "Book your stay" })).toBeVisible();
      await expect(shown(page, "stay-summary")).toBeVisible();
      const disclosure = shown(page, "question-disclosure");
      await expect(disclosure).toBeVisible();

      // Closed, then open: no overlap anywhere on the page.
      const closed = await scanForOverlap(page);
      expect(closed.problems, `${width}px, disclosure closed`).toEqual([]);
      expect(closed.positions).toBeGreaterThan(10);

      await disclosure.locator("summary").click();
      await expect(disclosure.getByRole("button", { name: /send/i })).toBeVisible();
      const open = await scanForOverlap(page);
      expect(open.problems, `${width}px, disclosure open`).toEqual([]);
      expect(open.probesChecked, "form controls were actually hit-tested").toBeGreaterThan(5);
    }
  });

  test("the question form opens from the summary link and works with the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "the link lives in the desktop and tablet summary");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(LISTING);
    const disclosure = shown(page, "question-disclosure");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await shown(page, "stay-summary").getByRole("link", { name: "Have a question? Ask us" }).click();
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(page).toHaveURL(/#ask$/);
    // Fold and unfold with the keyboard.
    const toggle = disclosure.locator("summary");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(disclosure).toHaveAttribute("open", "");
    await page.keyboard.press("Tab");
    await expect(disclosure.locator(":focus")).toHaveCount(1);
  });

  test("phones and tablets: no sideways scroll; the booking bar never hides the last field", async ({ page }) => {
    for (const [width, height] of [
      [320, 640],
      [375, 812],
      [414, 896],
      [768, 1024],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(LISTING);
      await expect(page.getByRole("heading", { name: "Book your stay" })).toBeVisible();
      const bar = shown(page, "stay-mobile-bar");
      await expect(bar).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${width}px scrolls sideways`).toBeLessThanOrEqual(0);

      // Open the question form and go to the very bottom: its last control clears the bar.
      const disclosure = shown(page, "question-disclosure");
      await disclosure.locator("summary").click();
      const send = disclosure.getByRole("button", { name: /send/i });
      await expect(send).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      const [barBox, sendBox] = await Promise.all([bar.boundingBox(), send.boundingBox()]);
      expect(sendBox!.y + sendBox!.height, `${width}px: send button under the bar`).toBeLessThanOrEqual(barBox!.y);
      const fields = await disclosure.locator("input, textarea, select").all();
      const last = fields.at(-1)!;
      const lastBox = await last.boundingBox();
      expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(barBox!.y);

      // The cookie banner (while undecided) sits above the bar, never under or on it.
      const banner = page.locator("[data-consent-banner]");
      if (await banner.isVisible()) {
        const bannerBox = (await banner.boundingBox())!;
        expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(barBox!.y);
      }

      // Bar actions are full-size tap targets.
      const action = bar.getByRole("button").or(bar.getByRole("link")).first();
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
