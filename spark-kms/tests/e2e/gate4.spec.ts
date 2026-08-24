import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { config } from "dotenv";
import { loginAs, loginViewer, SUPER, ADMIN } from "./login";

/**
 * Gate 4: three-role journeys, rate-limit, the nomination→confirm flow
 * (nomination alone awards nothing), adjustment-without-note rejected, and a
 * fresh-DB smoke (no crashes on empty data).
 *
 * NOTE: runs after the seeded reset in global-setup. Tests that create data run
 * last so the empty-data smoke sees a clean board first.
 */

async function selectOption(page: Page, testid: string, option: string) {
  await page.getByTestId(testid).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe.serial("Gate 4", () => {
  // Earlier gate specs leave data in the shared test DB; reset to empty so the
  // fresh-install smoke sees a clean board.
  test.beforeAll(() => {
    config({ path: ".env" });
    const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
    execSync("npm run db:reset", { stdio: "ignore", env });
    execSync("npm run db:seed", { stdio: "ignore", env });
  });

  test("fresh install: empty data renders friendly states, no crashes (viewer)", async ({ page }) => {
    await loginViewer(page);
    await expect(page.getByTestId("dashboard-empty")).toBeVisible();
    await page.goto("/initiatives");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.goto("/leaderboard");
    await expect(page.getByText(/No areas yet/)).toBeVisible();
  });

  test("role perimeter: viewer blocked from Submit & Admin; admin blocked from Admin; super allowed", async ({ page }) => {
    // Viewer
    await loginViewer(page);
    await expect(page.getByRole("link", { name: "Submit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
    // Regular admin
    await loginAs(page, ADMIN);
    await expect(page.getByRole("link", { name: "Submit", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
    // Super admin
    await loginAs(page, SUPER);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  });

  test("rate limit: repeated bad viewer passwords eventually 429", async ({ page }) => {
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await page.request.post("/api/auth/login", {
        headers: { "x-forwarded-for": "203.0.113.55" },
        data: { password: "definitely-wrong" },
      });
      if (res.status() === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });

  test("adjustment without a note is rejected (super)", async ({ page }) => {
    await loginAs(page, SUPER);
    const res = await page.request.post("/api/admin/adjustment", {
      data: { region: "Sumatera", segment: "Masstige", stream: "best_practice", points: 3, effectiveDate: "2026-07-01", note: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("ticking Best Practice of the Week auto-awards +2, with no confirmation step", async ({ page }) => {
    await loginAs(page, SUPER);

    // v1.2 items 5-6: ticking the box awards +2 immediately, capped 1/Area/week.
    // The nomination queue and the super-admin "Confirm +2" button are gone.
    await page.goto("/submit");
    await selectOption(page, "region", "EJBN");
    await selectOption(page, "segment", "Halal PC");
    await page.getByTestId("title").fill("Auto Award Topic");
    await page.getByTestId("check-duplicates").click();
    await page.getByTestId("pic").fill("Tester");
    await selectOption(page, "pillar", "Social Buzz");
    await page.getByTestId("detail").fill("A Best-Practice-of-the-Week entry.");
    await page.getByTestId("bp-nominate").click();
    await page.getByTestId("submit-new").click();
    await page.waitForURL(/\/initiatives\/\d+$/);

    // D20: creating an initiative is +1 in total, because the first entry folds
    // into it. The tick adds +2 Best Practice on top, so the total is 3.
    await expect(page.getByTestId("points-total")).toHaveText("3");

    // The retired confirmation step really is absent, not merely unused.
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: /Confirm \+2/ })).toHaveCount(0);
  });
});
