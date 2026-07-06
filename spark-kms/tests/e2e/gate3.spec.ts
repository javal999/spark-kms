import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Gate 3 UI smoke: the bulk-upload flow (choose file → preview → commit). */

const SUPER = { email: "super@spark.local", password: "super-password-123" };
const HEADERS = [
  "Tanggal", "Region", "Segment", "PIC", "Pillar", "Category", "Topic/Tema",
  "Description", "Progress", "Need Follow Up Action/Unlocking", "Stage",
  "Best Practices of The Week", "Link File",
];

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByTestId("toggle-mode").click();
  await page.locator("#email").fill(SUPER.email);
  await page.locator("#password").fill(SUPER.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}

async function makeFile(rows: string[][], name: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const en = wb.addWorksheet("Entries");
  HEADERS.forEach((h, c) => (en.getCell(1, c + 1).value = h));
  HEADERS.forEach((h, c) => (en.getCell(2, c + 1).value = "hint"));
  rows.forEach((r, i) => r.forEach((v, c) => {
    if (v) en.getCell(3 + i, c + 1).value = v;
  }));
  const meta = wb.addWorksheet("_meta", { state: "hidden" });
  meta.getCell(1, 1).value = "template_version";
  meta.getCell(1, 2).value = "v1.1";
  const path = join(tmpdir(), name);
  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(path, Buffer.from(buf));
  return path;
}

test("admin bulk-uploads a file: preview → commit → rows appear", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/submit");

  const path = await makeFile(
    [
      ["2026-07-01", "Sumatera", "Masstige", "PIC A", "Social Buzz", "Best Practice", "Bulk Upload Topic One", "", "It happened", "", "", "FALSE", ""],
      ["2026-07-01", "CJWJ", "Halal PC", "PIC B", "Personalized CRM", "Unlocking", "Bulk Upload Topic Two", "", "Also happened", "", "", "FALSE", ""],
    ],
    `spark-e2e-${Date.now()}.xlsx`,
  );

  await page.getByTestId("upload-input").setInputFiles(path);

  // Preview appears with 2 new rows.
  await expect(page.getByText("2 rows")).toBeVisible();
  await expect(page.getByText("2 new")).toBeVisible();

  // Commit.
  await page.getByTestId("commit-upload").click();
  await expect(page.getByTestId("commit-result")).toBeVisible();
  await expect(page.getByTestId("commit-result")).toContainText("2 new initiatives");

  // The imported initiatives show up in the list.
  await page.goto("/initiatives?q=Bulk%20Upload%20Topic");
  await expect(page.getByRole("link", { name: "Bulk Upload Topic One" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bulk Upload Topic Two" })).toBeVisible();
});

test("a file with an off-enum row shows the error and blocks commit", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/submit");

  const path = await makeFile(
    [
      ["2026-07-01", "Sulawesi", "ALL", "PIC", "Activated New Touchpoint", "Best Practice", "Off Enum Topic", "", "progress", "", "", "FALSE", ""],
    ],
    `spark-e2e-bad-${Date.now()}.xlsx`,
  );

  await page.getByTestId("upload-input").setInputFiles(path);
  await expect(page.getByText(/Sulawesi.*not a valid region/i)).toBeVisible();
  await expect(page.getByTestId("commit-upload")).toBeDisabled();
});
