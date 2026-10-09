import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "screenshots", testMatch: /screens\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${port}`,
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: true,
        env: { DEMO_MODE: "true" },
      },
});
