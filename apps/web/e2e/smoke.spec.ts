import { expect, test } from "@playwright/test";

test("demo: Today → open item → add note → persists after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("today-summary")).toContainText("need");
  await expect(page.getByText("Demo").first()).toBeVisible();

  const firstCard = page.locator("main article[data-item-id]").first();
  await firstCard.click();
  await expect(page).toHaveURL(/item=/);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Open on GitHub")).toBeVisible();

  const note = `e2e note ${Date.now()}`;
  const editBtn = dialog.getByRole("button", { name: /^(Add notes|Edit)$/ });
  await editBtn.click();
  await dialog.getByLabel("Notes (markdown)").fill(note);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(note)).toBeVisible();

  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("dialog").getByText(note)).toBeVisible({ timeout: 20_000 });
});

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).db.ok).toBe(true);
});
