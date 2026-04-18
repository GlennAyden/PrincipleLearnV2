import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
  }));

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth + 1);
  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1);
}

test.describe('mobile public layout', () => {
  test('homepage keeps the learning CTA inside the viewport', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'PrincipleLearn', exact: true })).toBeVisible();
    const learnButton = page.getByRole('button', { name: /Mulai Belajar/i });
    await expect(learnButton).toBeVisible();

    const box = await learnButton.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();

    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    await expectNoHorizontalOverflow(page);
  });

  test('auth pages fit mobile width', async ({ page }) => {
    for (const route of ['/login', '/signup']) {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
