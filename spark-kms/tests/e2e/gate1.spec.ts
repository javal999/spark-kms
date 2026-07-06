import { test, expect, type Page } from "@playwright/test";

/**
 * Gate 1 (phase 1 exit): create → find → view; duplicate flow both branches;
 * non-admin cannot reach /submit. Runs against the seeded TEST database.
 */

const SUPER = { email: "super@spark.local", password: "super-password-123" };
const VIEWER_PW = "viewer-password-123";

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByTestId("toggle-mode").click();
  await page.locator("#email").fill(SUPER.email);
  await page.locator("#password").fill(SUPER.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}

async function loginViewer(page: Page) {
  await page.goto("/login");
  await page.locator("#password").fill(VIEWER_PW);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}

// shadcn/base-ui Select: click the trigger, then the option by its text.
async function selectOption(page: Page, testid: string, option: string) {
  await page.getByTestId(testid).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function fillBasics(
  page: Page,
  region: string,
  segment: string,
  title: string,
) {
  await selectOption(page, "region", region);
  await selectOption(page, "segment", segment);
  await page.getByTestId("title").fill(title);
  await page.getByTestId("check-duplicates").click();
}

test.describe("Gate 1", () => {
  test("admin creates a new initiative → it appears in the list → detail shows the entry", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/submit");

    await fillBasics(page, "Sumatera", "Masstige", "E2E Alpha Initiative");
    // Fresh title → no duplicates → straight to the new-topic form.
    await page.getByTestId("pic").fill("Rani");
    await selectOption(page, "pillar", "Activated New Touchpoint");
    await page
      .getByTestId("detail")
      .fill("Launched a pop-up; +30% footfall in week one.");
    await page.getByTestId("submit-new").click();

    // Redirected to the detail page.
    await page.waitForURL(/\/initiatives\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /E2E Alpha Initiative/ }),
    ).toBeVisible();
    await expect(page.getByTestId("entry-timeline")).toContainText(
      "+30% footfall",
    );

    // It shows up in the list.
    await page.goto("/initiatives?q=E2E%20Alpha");
    await expect(
      page.getByRole("link", { name: "E2E Alpha Initiative" }),
    ).toBeVisible();
  });

  test("duplicate flow — APPEND branch adds a second entry to the existing topic", async ({
    page,
  }) => {
    await loginAdmin(page);

    // Seed a topic to collide with.
    await page.goto("/submit");
    await fillBasics(page, "Jakarta Greater", "All", "Beauty Class Roadshow");
    await page.getByTestId("pic").fill("Dewi");
    await selectOption(page, "pillar", "Relevant Beauty Lifestyle");
    await page.getByTestId("detail").fill("First beauty class, 40 attendees.");
    await page.getByTestId("submit-new").click();
    await page.waitForURL(/\/initiatives\/\d+$/);

    // Re-submit a near-identical title → duplicate gate appears.
    await page.goto("/submit");
    await fillBasics(page, "Jakarta Greater", "All", "Beauty Class Roadshow");
    const gate = page.getByTestId("duplicate-gate");
    await expect(gate).toBeVisible();

    // APPEND to the existing one.
    await gate.getByRole("button", { name: /Append to #/ }).first().click();
    await page.getByTestId("detail").fill("Second session, 55 attendees.");
    await page.getByTestId("submit-append").click();
    await page.waitForURL(/\/initiatives\/\d+$/);

    // Both entries now on the same initiative.
    const timeline = page.getByTestId("entry-timeline");
    await expect(timeline).toContainText("40 attendees");
    await expect(timeline).toContainText("55 attendees");
  });

  test("duplicate flow — FORCE-NEW branch creates a separate initiative", async ({
    page,
  }) => {
    await loginAdmin(page);

    // Collides with 'Beauty Class Roadshow' from the previous test's data.
    await page.goto("/submit");
    await fillBasics(page, "EJBN", "Teen & ES", "Beauty Class Roadshow North");
    const gate = page.getByTestId("duplicate-gate");
    await expect(gate).toBeVisible();

    await page.getByTestId("force-new").click();
    await page.getByTestId("pic").fill("Yusril");
    await selectOption(page, "pillar", "Key Territory Execution");
    await page.getByTestId("detail").fill("A distinct roadshow in the north.");
    await page.getByTestId("submit-new").click();

    await page.waitForURL(/\/initiatives\/\d+$/);
    await expect(
      page.getByRole("heading", { name: /Beauty Class Roadshow North/ }),
    ).toBeVisible();
  });

  test("a viewer cannot reach /submit", async ({ page }) => {
    await loginViewer(page);

    // The nav must not offer Submit to a viewer.
    await expect(page.getByRole("link", { name: "Submit" })).toHaveCount(0);

    // Direct navigation is bounced by the proxy back to the dashboard.
    await page.goto("/submit");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
