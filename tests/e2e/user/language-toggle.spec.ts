/**
 * E2E Tests: Language Toggle (ID/EN)
 *
 * Verifies the bilingual UI toggle:
 * - Toggle is visible in the dashboard header.
 * - Clicking it swaps the logout button label from "Keluar" to "Logout".
 * - The `locale` cookie is updated.
 * - The choice persists across a page reload.
 * - Clicking again toggles back to ID.
 *
 * This test signs up a fresh user (same pattern as dashboard.spec.ts /
 * signup-login.spec.ts). To bypass the two-stage onboarding gate
 * (`onboarding_done` + `intro_slides_done` cookies — see middleware.ts:120-157),
 * we set both UX-guard cookies directly so we land on /dashboard.
 *
 * If a `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` env pair is supplied, those
 * credentials are used instead of signing up — useful for environments where
 * signup is rate-limited or pre-seeded users exist.
 */

import { test, expect, type Page } from '@playwright/test';

const SEEDED_EMAIL = process.env.E2E_USER_EMAIL;
const SEEDED_PASSWORD = process.env.E2E_USER_PASSWORD;

async function signupFreshUser(page: Page) {
  const email = `lang-toggle-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  const name = 'Lang Toggle Tester';

  await page.goto('/signup');
  const nameInput = page.locator('input#signup-name');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(name);
  }
  await page.locator('input#signup-email').fill(email);
  await page.locator('input#signup-password').fill(password);
  await page.click('button[type="submit"]');

  // Wait until middleware lets us land somewhere authenticated.
  await page.waitForURL(/dashboard|onboarding|request-course/, { timeout: 20000 });
}

async function loginSeededUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input#login-email').fill(email);
  await page.locator('input#login-password').fill(password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|onboarding|request-course/, { timeout: 20000 });
}

async function bypassOnboardingGate(page: Page) {
  // `onboarding_done` and `intro_slides_done` are non-HttpOnly UX-guard
  // cookies (see CLAUDE.md "Onboarding Flow"). Setting them client-side
  // skips the wizard so we can reach /dashboard directly.
  await page.evaluate(() => {
    document.cookie = 'onboarding_done=true; Path=/; SameSite=Lax; Max-Age=31536000';
    document.cookie = 'intro_slides_done=true; Path=/; SameSite=Lax; Max-Age=31536000';
  });
}

test.describe('Language toggle', () => {
  test('toggles dashboard header from ID to EN and persists across reload', async ({ page }) => {
    if (SEEDED_EMAIL && SEEDED_PASSWORD) {
      await loginSeededUser(page, SEEDED_EMAIL, SEEDED_PASSWORD);
    } else {
      await signupFreshUser(page);
    }

    await bypassOnboardingGate(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    const toggle = page.getByTestId('language-toggle');
    await expect(toggle).toBeVisible();

    // Default locale is ID: logout button should read "Keluar".
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible();

    await toggle.click();

    // After toggling: button label becomes "Logout".
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'locale')?.value).toBe('en');

    // Reload — choice must persist via cookie.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    // Toggle back to ID for cleanup.
    await page.getByTestId('language-toggle').click();
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible();
  });
});
