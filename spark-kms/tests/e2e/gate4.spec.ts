import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { config } from "dotenv";

/**
 * Gate 4: three-role journeys, rate-limit, the nomination→confirm flow
 * (nomination alone awards nothing), adjustment-without-note rejected, and a
 * fresh-DB smoke (no crashes on empty data).
 *
 * NOTE: runs after the seeded reset in global-setup. Tests that create data run
 * last so the empty-data smoke sees a clean board first.
 */

const SUPER = { email: "super@spark.local", password: "super-password-123" };
const ADMIN = { email: "admin@spark.local", password: "admin-password-123" };
const VIEWER_PW = "viewer-password-123";

async function loginAdmin(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByTestId("toggle-mode").click();
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}
async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.locator("#password").fill(VIEWER_PW);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}
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
    await loginAdmin(page, ADMIN);
    await expect(page.getByRole("link", { name: "Submit", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
    // Super admin
    await loginAdmin(page, SUPER);
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
    await loginAdmin(page, SUPER);
    const res = await page.request.post("/api/admin/adjustment", {
      data: { region: "Sumatera", segment: "Masstige", stream: "best_practice", points: 3, effectiveDate: "2026-07-01", note: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("nomination awards nothing until a super-admin confirms it (+2)", async ({ page }) => {
    await loginAdmin(page, SUPER);

    // Create an initiative and nominate its entry for BP-of-week.
    await page.goto("/submit");
    await selectOption(page, "region", "EJBN");
    await selectOption(page, "segment", "Halal PC");
    await page.getByTestId("title").fill("Nomination Flow Topic");
    await page.getByTestId("check-duplicates").click();
    await page.getByTestId("pic").fill("Tester");
    await selectOption(page, "pillar", "Social Buzz");
    await page.getByTestId("detail").fill("A nominated entry.");
    await page.getByTestId("bp-nominate").click();
    await page.getByTestId("submit-new").click();
    await page.waitForURL(/\/initiatives\/\d+$/);
    const detailUrl = page.url();

    // Before confirm: +1 new +1 entry = 2, nomination scored nothing.
    await expect(page.getByTestId("points-total")).toHaveText("2");

    // Confirm in the console.
    await page.goto("/admin");
    await expect(page.getByText("Nomination Flow Topic")).toBeVisible();
    await page.getByRole("button", { name: "Confirm +2" }).first().click();
    await expect(page.getByTestId("no-nominations")).toBeVisible();

    // After confirm: +2 lands → total 4.
    await page.goto(detailUrl);
    await expect(page.getByTestId("points-total")).toHaveText("4");
  });
});
