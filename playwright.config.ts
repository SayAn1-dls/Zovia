import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    // PW_CHANNEL=chrome runs the Chromium projects in the installed Google Chrome instead of a
    // downloaded browser build.
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
  ],
  // Build and serve the production app unless a deployed URL is supplied.
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
          command: `pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 300_000,
          stdout: "ignore",
          stderr: "pipe",
        },
      }),
});
