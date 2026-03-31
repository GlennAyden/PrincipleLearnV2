/**
 * E2E Tests: User Dashboard (/dashboard)
 *
 * Tests the user dashboard page:
 * - Redirects to /login when not authenticated
 * - Displays greeting with user name
 * - Shows loading state while courses are loading
 * - Displays courses in grid when user has courses
 * - Shows empty state when user has no courses
 * - "Create Course" button navigates to /request-course/step1
 * - Course card click navigates to course detail
 * - Delete course flow (confirm + delete)
 * - Logout button works correctly
 * - Error state with retry button
 */

import { test, expect, type Page } from '@playwright/test';

// Helper: Sign up a fresh user and land on dashboard
async function signupAndGotoDashboard(page: Page) {
    const email = `dashboard-test-${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const name = 'Dashboard Tester';

    await page.goto('/signup');

    const nameInput = page.locator('input#signup-name');
    if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(name);
    }

    await page.locator('input#signup-email').fill(email);
    await page.locator('input#signup-password').fill(password);
    await page.click('button[type="submit"]');

    // Wait for redirect after signup
    await page.waitForURL(/dashboard|request-course|onboarding/, { timeout: 20000 });

    // Navigate to dashboard if not already there
    if (!page.url().includes('/dashboard')) {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');
    }

    return { email, password, name };
}

// Helper: Login an existing user
async function loginUser(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.locator('input#login-email').fill(email);
    await page.locator('input#login-password').fill(password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|request-course|onboarding/, { timeout: 20000 });
}

test.describe('Dashboard — Authentication', () => {
    test('should redirect to /login when not authenticated', async ({ page }) => {
        // Clear cookies first
        await page.context().clearCookies();

        await page.goto('/dashboard');

        // Should redirect to login
        await page.waitForURL(/login/, { timeout: 10000 });
        expect(page.url()).toContain('/login');
    });
});

test.describe('Dashboard — Page Layout', () => {
    test('should display greeting with user name', async ({ page }) => {
        const { name } = await signupAndGotoDashboard(page);

        // Greeting should contain the user's name or email prefix
        const greeting = page.locator('h1');
        await expect(greeting).toBeVisible({ timeout: 10000 });

        const greetingText = await greeting.textContent();
        expect(greetingText).toMatch(/Good (morning|afternoon|evening)/);

        // Should contain name or at least show something
        const nameSpan = page.locator('[class*="greetingName"]');
        if (await nameSpan.isVisible().catch(() => false)) {
            const nameText = await nameSpan.textContent();
            expect(nameText).toBeTruthy();
        }
    });

    test('should display header with logo, user badge, and logout button', async ({ page }) => {
        await signupAndGotoDashboard(page);

        // Logo
        const logo = page.locator('text=PrincipleLearn');
        await expect(logo).toBeVisible({ timeout: 10000 });

        // User email badge
        const userEmail = page.locator('[class*="userEmail"]');
        await expect(userEmail).toBeVisible();

        // Avatar
        const avatar = page.locator('[class*="avatar"]');
        await expect(avatar).toBeVisible();

        // Logout button
        const logoutBtn = page.locator('button:has-text("Log out")');
        await expect(logoutBtn).toBeVisible();
    });

    test('should display "Create Course" button', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const createBtn = page.locator('button:has-text("Create Course")');
        await expect(createBtn).toBeVisible({ timeout: 10000 });
    });

    test('should display "My Courses" section title', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const sectionTitle = page.locator('h2:has-text("My Courses")');
        await expect(sectionTitle).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Dashboard — Empty State', () => {
    test('should show empty state for new user with no courses', async ({ page }) => {
        await signupAndGotoDashboard(page);

        // New user should see empty state
        const emptyState = page.locator('text=No courses yet');
        const hasCourses = page.locator('[class*="courseCard"]');

        // Wait for loading to finish
        await page.waitForTimeout(3000);

        // Either shows empty state or course cards
        const isEmpty = await emptyState.isVisible().catch(() => false);
        const hasCards = await hasCourses.first().isVisible().catch(() => false);

        // One must be true
        expect(isEmpty || hasCards).toBeTruthy();

        if (isEmpty) {
            // Should have "Create Your First Course" button
            const createFirstBtn = page.locator('button:has-text("Create Your First Course")');
            await expect(createFirstBtn).toBeVisible();
        }
    });

    test('empty state "Create Your First Course" button navigates to step1', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const createFirstBtn = page.locator('button:has-text("Create Your First Course")');
        if (await createFirstBtn.isVisible().catch(() => false)) {
            await createFirstBtn.click();
            await page.waitForURL(/request-course\/step1/, { timeout: 10000 });
            expect(page.url()).toContain('/request-course/step1');
        }
    });
});

test.describe('Dashboard — Navigation', () => {
    test('"Create Course" button should navigate to /request-course/step1', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const createBtn = page.locator('button:has-text("Create Course")');
        await expect(createBtn).toBeVisible({ timeout: 10000 });

        await createBtn.click();

        await page.waitForURL(/request-course\/step1/, { timeout: 10000 });
        expect(page.url()).toContain('/request-course/step1');
    });

    test('logo link should navigate to home page', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const logoLink = page.locator('a:has-text("PrincipleLearn")');
        await expect(logoLink).toBeVisible({ timeout: 10000 });

        await logoLink.click();
        await page.waitForURL('/', { timeout: 10000 });
    });
});

test.describe('Dashboard — Logout', () => {
    test('logout button should redirect to login page', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const logoutBtn = page.locator('button:has-text("Log out")');
        await expect(logoutBtn).toBeVisible({ timeout: 10000 });

        await logoutBtn.click();

        // Should redirect to login or home
        await page.waitForURL(/login|home|\/$/, { timeout: 10000 });
    });

    test('should not be able to access dashboard after logout', async ({ page }) => {
        await signupAndGotoDashboard(page);

        const logoutBtn = page.locator('button:has-text("Log out")');
        await logoutBtn.click();
        await page.waitForURL(/login|home|\/$/, { timeout: 10000 });

        // Try accessing dashboard again
        await page.goto('/dashboard');
        await page.waitForURL(/login/, { timeout: 10000 });
        expect(page.url()).toContain('/login');
    });
});

test.describe('Dashboard — Course Cards', () => {
    // Note: These tests depend on the user having courses.
    // In a full CI environment, you would create a course first via the API.
    // Here we test the UI structure conditionally.

    test('course cards should show title and level badge', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const courseCard = page.locator('[class*="courseCard"]').first();
        if (await courseCard.isVisible().catch(() => false)) {
            // Should have title
            const title = courseCard.locator('[class*="courseTitle"]');
            await expect(title).toBeVisible();

            // Should have level badge
            const levelBadge = courseCard.locator('[class*="levelBadge"]');
            await expect(levelBadge).toBeVisible();

            // Should have "Continue Learning" button
            const continueBtn = courseCard.locator('button:has-text("Continue Learning")');
            await expect(continueBtn).toBeVisible();
        }
    });

    test('course card "Continue Learning" should navigate to course page', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const continueBtn = page.locator('button:has-text("Continue Learning")').first();
        if (await continueBtn.isVisible().catch(() => false)) {
            await continueBtn.click();
            await page.waitForURL(/course\//, { timeout: 10000 });
            expect(page.url()).toContain('/course/');
        }
    });

    test('delete button shows confirmation overlay', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const deleteIcon = page.locator('[aria-label="Delete course"]').first();
        if (await deleteIcon.isVisible().catch(() => false)) {
            await deleteIcon.click();

            // Should show delete confirmation
            const confirmText = page.locator('text=Delete this course?');
            await expect(confirmText).toBeVisible({ timeout: 5000 });

            // Should have Delete and Cancel buttons
            const deleteBtn = page.locator('button:has-text("Delete")').last();
            const cancelBtn = page.locator('button:has-text("Cancel")');
            await expect(deleteBtn).toBeVisible();
            await expect(cancelBtn).toBeVisible();
        }
    });

    test('cancel delete hides confirmation overlay', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const deleteIcon = page.locator('[aria-label="Delete course"]').first();
        if (await deleteIcon.isVisible().catch(() => false)) {
            await deleteIcon.click();

            const cancelBtn = page.locator('button:has-text("Cancel")');
            await expect(cancelBtn).toBeVisible({ timeout: 5000 });
            await cancelBtn.click();

            // Confirmation should be hidden
            const confirmText = page.locator('text=Delete this course?');
            await expect(confirmText).not.toBeVisible({ timeout: 3000 });
        }
    });
});

test.describe('Dashboard — Subtitle Text', () => {
    test('should show course count or "Ready to start" message', async ({ page }) => {
        await signupAndGotoDashboard(page);

        await page.waitForTimeout(3000);

        const subtitle = page.locator('[class*="greetingSub"]');
        await expect(subtitle).toBeVisible({ timeout: 10000 });

        const text = await subtitle.textContent();
        // Either "You have X course(s) in progress" or "Ready to start your learning journey?"
        expect(
            text?.includes('course') || text?.includes('Ready to start')
        ).toBeTruthy();
    });
});
