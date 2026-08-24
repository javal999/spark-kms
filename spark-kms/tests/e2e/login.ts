import type { Page } from "@playwright/test";

/**
 * Shared sign-in for the e2e specs, against the seeded TEST database.
 *
 * Not a spec file, so Playwright's `**\/*.spec.ts` match skips it.
 *
 * Every spec has to go through `revealPasswordForm` first: with
 * NEXT_PUBLIC_FEATURE_SSO=1 the login page opens on "Sign in with Microsoft"
 * and keeps the password form behind a link. Each spec used to carry its own
 * copy of these helpers and only guide.spec.ts knew about that link, so with
 * SSO on the rest could not log in at all. One copy, here, is the fix.
 */

export const SUPER = { email: "super@spark.local", password: "super-password-123" };
export const ADMIN = { email: "admin@spark.local", password: "admin-password-123" };
export const VIEWER_PW = "viewer-password-123";

export type Credentials = { email: string; password: string };

/** Reveal the password form when SSO is on. A no-op when the flag is off. */
export async function revealPasswordForm(page: Page) {
  const reveal = page.getByRole("button", { name: "Use a password instead" });
  if (await reveal.isVisible().catch(() => false)) await reveal.click();
}

/** Sign in as a named admin or super-admin account. Defaults to the super. */
export async function loginAs(page: Page, who: Credentials = SUPER) {
  await page.goto("/login");
  await revealPasswordForm(page);
  await page.getByTestId("toggle-mode").click();
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}

/** Sign in as the super-admin. */
export async function loginAdmin(page: Page) {
  await loginAs(page, SUPER);
}

/** Sign in with the shared viewer password. */
export async function loginViewer(page: Page) {
  await page.goto("/login");
  await revealPasswordForm(page);
  await page.locator("#password").fill(VIEWER_PW);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}
