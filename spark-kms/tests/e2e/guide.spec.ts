import { test, expect } from "@playwright/test";
import { loginAdmin, loginViewer } from "./login";

/**
 * /guide ("How SPARK works") — the admin-facing rulebook.
 * Checks the role gate both ways and that the page renders its values from the
 * live code rather than placeholder text. Runs against the seeded TEST database.
 */

test.describe("Guide page", () => {
  test("an admin can open it and it shows the live scoring values", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/guide");

    await expect(
      page.getByRole("heading", { name: "How SPARK works", level: 1 }),
    ).toBeVisible();

    // The eleven sections the guide promises.
    for (const heading of [
      "What SPARK is",
      "Who can do what",
      "How points work",
      "Correcting a score",
      "Submitting an initiative or an update",
      "Bulk upload",
      "Duplicate detection",
      "How the leaderboard is worked out",
      "How the dashboard numbers are worked out",
      "Everything else on the site",
      "When a rule needs to change",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // Values rendered from the code, not typed into the page.
    await expect(page.getByText("+2", { exact: true })).toBeVisible();
    await expect(page.getByText("Sulawesi")).toBeVisible();
    await expect(page.getByText("500 rows and 10 MB per file")).toBeVisible();

    // Super-admins get the pointer to the technical companion page.
    await expect(page.getByRole("link", { name: "System overview" })).toBeVisible();
  });

  test("a viewer is redirected away and never sees the nav entry", async ({
    page,
  }) => {
    await loginViewer(page);
    await expect(
      page.getByRole("link", { name: "How SPARK works" }),
    ).toHaveCount(0);

    await page.goto("/guide");
    await expect(page).toHaveURL(/\/$/);
  });
});
