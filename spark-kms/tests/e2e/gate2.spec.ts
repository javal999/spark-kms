import { test, expect, type Page } from "@playwright/test";
import { loginAdmin } from "./login";

/** Gate 2 UI smoke: scoring surfaces on the dashboard, leaderboard, and detail. */

async function selectOption(page: Page, testid: string, option: string) {
  await page.getByTestId(testid).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("a created initiative scores and shows up on dashboard, leaderboard, and detail points panel", async ({
  page,
}) => {
  await loginAdmin(page);

  // Create one initiative (awards +1 new +1 entry = 2 in best_practice).
  await page.goto("/submit");
  await selectOption(page, "region", "EJBN");
  await selectOption(page, "segment", "Halal PC");
  await page.getByTestId("title").fill("Gate2 Scored Initiative");
  await page.getByTestId("check-duplicates").click();
  await page.getByTestId("pic").fill("Tester");
  await selectOption(page, "pillar", "Social Buzz");
  await page.getByTestId("detail").fill("A scored entry.");
  await page.getByTestId("submit-new").click();
  await page.waitForURL(/\/initiatives\/\d+$/);

  // Detail points panel shows the 2 best_practice points.
  await expect(page.getByText("Best Practice").first()).toBeVisible();
  await expect(page.getByTestId("entry-timeline")).toContainText(
    "A scored entry.",
  );

  // Dashboard: top initiatives lists it.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Gate2 Scored Initiative/ }),
  ).toBeVisible();

  // Leaderboard: the EJBN / Halal PC area appears with a nonzero total.
  await page.goto("/leaderboard");
  const row = page
    .getByTestId("leaderboard-row")
    .filter({ hasText: "EJBN" })
    .filter({ hasText: "Halal PC" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("2");
});

test("the stale-date warning appears for an entry_date older than 30 days", async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto("/submit");
  await selectOption(page, "region", "CJWJ");
  await selectOption(page, "segment", "All");
  await page.getByTestId("title").fill("Stale date probe");
  await page.getByTestId("check-duplicates").click();
  // Force a very old entry date.
  await page.getByTestId("entry-date").fill("2020-01-01");
  await expect(page.getByTestId("stale-date-warning")).toBeVisible();
});
