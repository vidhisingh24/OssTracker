import { test } from "@playwright/test";

/** Visual review pass: every main screen in light, dark and mobile. Output in test-results/screens. */
const SCREENS = [
  "/",
  "/pipeline",
  "/items",
  "/inbox",
  "/repos",
  "/programs",
  "/insights",
  "/sync",
  "/settings",
];
const VARIANTS = [
  { name: "light", scheme: "light" as const, viewport: { width: 1440, height: 960 } },
  { name: "dark", scheme: "dark" as const, viewport: { width: 1440, height: 960 } },
  { name: "mobile", scheme: "light" as const, viewport: { width: 390, height: 844 } },
];

for (const v of VARIANTS) {
  for (const path of SCREENS) {
    test(`${v.name} ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: v.scheme, reducedMotion: "reduce" });
      await page.setViewportSize(v.viewport);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page
        .waitForFunction(() => !document.querySelector("main .skeleton"), null, { timeout: 30_000 })
        .catch(() => undefined);
      await page.screenshot({
        path: `test-results/screens/${v.name}${path === "/" ? "-today" : path.replace(/\//g, "-")}.png`,
        fullPage: true,
      });
    });
  }
}
