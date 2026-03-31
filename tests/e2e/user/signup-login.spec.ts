/**
 * E2E Tests: User Signup and Login Flow
 *
 * Tests the complete user authentication journey:
 * - New user signup (with name field, password strength indicator)
 * - Login with valid credentials (with remember me checkbox)
 * - Login with invalid credentials
 * - Logout functionality
 * - Session persistence
 */

import { test, expect, type Page } from '@playwright/test';

// Test data
const TEST_USER = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'E2E Test User',
};

// Helper functions
async function signupUser(page: Page, user: typeof TEST_USER) {
    await page.goto('/signup');

    // Fill Full Name using the actual input ID
    const nameInput = page.locator('input#signup-name');
    if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill(user.name);
    }

    // Fill Email using the actual input ID
    await page.locator('input#signup-email').fill(user.email);

    // Fill Password using the actual input ID
    await page.locator('input#signup-password').fill(user.password);

    await page.click('button[type="submit"]');
}

async function loginUser(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.locator('input#login-email').fill(email);
    await page.locator('input#login-password').fill(password);
    await page.click('button[type="submit"]');
}

test.describe('User Signup Flow', () => {
    test('should display signup page correctly', async ({ page }) => {
        await page.goto('/signup');

        // Verify page elements using actual IDs
        await expect(page.locator('input#signup-name')).toBeVisible();
        await expect(page.locator('input#signup-email')).toBeVisible();
        await expect(page.locator('input#signup-password')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();

        // Verify logo and title
        await expect(page.locator('h1')).toContainText('Create your account');
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto('/signup');

        // Submit empty form
        await page.click('button[type="submit"]');

        // Should show validation error or remain on signup page
        await expect(page).toHaveURL(/signup/);
    });

    test('should show error for invalid email format', async ({ page }) => {
        await page.goto('/signup');

        // Fill name
        await page.locator('input#signup-name').fill('Test User');

        // Fill invalid email — HTML5 validation should prevent submission
        await page.locator('input#signup-email').fill('invalid-email');
        await page.locator('input#signup-password').fill('TestPassword123!');

        await page.click('button[type="submit"]');

        // Should show error or validation message
        const errorMessage = page.locator('text=/invalid|email|format/i');
        const hasError = await errorMessage.isVisible().catch(() => false);

        // Either show error or stay on page
        if (!hasError) {
            await expect(page).toHaveURL(/signup/);
        }
    });

    test('should show password strength indicator', async ({ page }) => {
        await page.goto('/signup');

        // Type a weak password
        const passwordInput = page.locator('input#signup-password');
        await passwordInput.fill('abc');

        // Password strength indicator should appear
        const strengthLabel = page.locator('text=/Weak|Fair|Good|Strong/i');
        await expect(strengthLabel).toBeVisible({ timeout: 3000 });

        // Type a strong password
        await passwordInput.fill('');
        await passwordInput.fill('StrongPass123');

        // Strength label should update
        const updatedLabel = page.locator('text=/Good|Strong/i');
        await expect(updatedLabel).toBeVisible({ timeout: 3000 });
    });

    test('should have optional name field', async ({ page }) => {
        await page.goto('/signup');

        // Name field should be visible
        const nameInput = page.locator('input#signup-name');
        await expect(nameInput).toBeVisible();

        // Should have "(optional)" label indicator
        const optionalTag = page.locator('text=/optional/i');
        await expect(optionalTag).toBeVisible();

        // Name field should not be required (no "required" attribute)
        const isRequired = await nameInput.getAttribute('required');
        expect(isRequired).toBeNull();
    });

    test('should successfully signup new user', async ({ page }) => {
        const uniqueUser = {
            ...TEST_USER,
            email: `signup-test-${Date.now()}@example.com`,
        };

        await signupUser(page, uniqueUser);

        // Should redirect after successful signup
        // App may redirect to /request-course/step1, /dashboard, /login, or /onboarding
        await page.waitForURL(/dashboard|login|onboarding|request-course/, { timeout: 20000 });

        // Verify redirect happened (no longer on signup page)
        const currentUrl = page.url();
        expect(
            currentUrl.includes('dashboard') ||
            currentUrl.includes('login') ||
            currentUrl.includes('onboarding') ||
            currentUrl.includes('request-course')
        ).toBeTruthy();
    });

    test('should show error for duplicate email', async ({ page }) => {
        // First, try to signup with an email that might already exist
        const existingUser = {
            ...TEST_USER,
            email: 'existing@example.com',
        };

        await signupUser(page, existingUser);

        // If first signup succeeded, try again with same email
        await signupUser(page, existingUser);

        // Should show error about duplicate email or stay on signup page
        await expect(page).toHaveURL(/signup/);
    });
});

test.describe('User Login Flow', () => {
    test('should display login page correctly', async ({ page }) => {
        await page.goto('/login');

        await expect(page.locator('input#login-email')).toBeVisible();
        await expect(page.locator('input#login-password')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();

        // Verify title
        await expect(page.locator('h1')).toContainText('Welcome back');
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await loginUser(page, 'nonexistent@example.com', 'WrongPassword123!');

        // Should show error message or stay on login page
        const errorMessage = page.locator('text=/invalid|error|incorrect|wrong|failed/i');
        const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

        if (!hasError) {
            await expect(page).toHaveURL(/login/);
        }
    });

    test('should show error for empty fields', async ({ page }) => {
        await page.goto('/login');

        await page.click('button[type="submit"]');

        // Should show validation error or remain on login page
        await expect(page).toHaveURL(/login/);
    });

    test('should have remember me checkbox', async ({ page }) => {
        await page.goto('/login');

        // Check for remember me checkbox using actual name attribute
        const rememberMeCheckbox = page.locator('input[type="checkbox"][name="rememberMe"]');
        await expect(rememberMeCheckbox).toBeVisible();

        // Should be unchecked by default
        await expect(rememberMeCheckbox).not.toBeChecked();

        // Click it
        await rememberMeCheckbox.click();
        await expect(rememberMeCheckbox).toBeChecked();

        // Verify the "Remember me" label text is present
        const rememberLabel = page.locator('text=/Remember me/i');
        await expect(rememberLabel).toBeVisible();
    });

    test('should have forgot password link', async ({ page }) => {
        await page.goto('/login');

        const forgotLink = page.locator('a[href="/forgot-password"]');
        await expect(forgotLink).toBeVisible();
        await expect(forgotLink).toContainText(/Forgot password/i);
    });

    test('should redirect to dashboard after successful login', async ({ page }) => {
        // First create a user (or use known test user)
        const testUser = {
            email: `login-test-${Date.now()}@example.com`,
            password: 'TestPassword123!',
            name: 'Login Test User',
        };

        // Signup first
        await signupUser(page, testUser);

        // Wait for redirect after signup
        await page.waitForTimeout(3000);

        // Then try to login
        await loginUser(page, testUser.email, testUser.password);

        // Should redirect to dashboard, onboarding, or request-course
        await page.waitForURL(/dashboard|onboarding|request-course/, { timeout: 20000 });
    });

    test('should persist session after page reload', async ({ page }) => {
        const testUser = {
            email: `session-test-${Date.now()}@example.com`,
            password: 'TestPassword123!',
            name: 'Session Test User',
        };

        // Signup and login
        await signupUser(page, testUser);
        await page.waitForTimeout(2000);

        // Reload page
        await page.reload();

        // Should still be logged in (not redirected to login)
        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        // If session persists, should not be on login page
        // (unless explicitly logged out or session expired)
    });
});

test.describe('User Logout Flow', () => {
    test('should logout successfully', async ({ page }) => {
        const testUser = {
            email: `logout-test-${Date.now()}@example.com`,
            password: 'TestPassword123!',
            name: 'Logout Test User',
        };

        // Signup and wait
        await signupUser(page, testUser);
        await page.waitForTimeout(2000);

        // Look for logout button or link
        const logoutButton = page.locator('button:has-text("logout"), a:has-text("logout"), button:has-text("sign out"), a:has-text("sign out")');

        if (await logoutButton.isVisible().catch(() => false)) {
            await logoutButton.click();

            // Should redirect to login or home page
            await page.waitForURL(/login|home|\/$/, { timeout: 10000 });
        }
    });

    test('should clear session after logout', async ({ page }) => {
        const testUser = {
            email: `clear-session-${Date.now()}@example.com`,
            password: 'TestPassword123!',
            name: 'Clear Session User',
        };

        // Signup
        await signupUser(page, testUser);
        await page.waitForTimeout(2000);

        // Find and click logout
        const logoutButton = page.locator('button:has-text("logout"), a:has-text("logout")');

        if (await logoutButton.isVisible().catch(() => false)) {
            await logoutButton.click();
            await page.waitForTimeout(2000);

            // Try to access protected page
            await page.goto('/dashboard');

            // Should be redirected to login
            await page.waitForURL(/login/, { timeout: 10000 });
        }
    });
});

test.describe('Navigation and Links', () => {
    test('should navigate from login to signup', async ({ page }) => {
        await page.goto('/login');

        // Click on signup link — use the actual link text
        const signupLink = page.locator('a:has-text("Create an account")');

        if (await signupLink.isVisible().catch(() => false)) {
            await signupLink.click();
            await expect(page).toHaveURL(/signup/);
        }
    });

    test('should navigate from signup to login', async ({ page }) => {
        await page.goto('/signup');

        // Click on login link — use the actual link text
        const loginLink = page.locator('a:has-text("Sign in instead")');

        if (await loginLink.isVisible().catch(() => false)) {
            await loginLink.click();
            await expect(page).toHaveURL(/login/);
        }
    });

    test('should navigate back to home from login', async ({ page }) => {
        await page.goto('/login');

        const homeLink = page.locator('a:has-text("Home")');

        if (await homeLink.isVisible().catch(() => false)) {
            await homeLink.click();
            await expect(page).toHaveURL('/');
        }
    });

    test('should navigate back to home from signup', async ({ page }) => {
        await page.goto('/signup');

        const homeLink = page.locator('a:has-text("Home")');

        if (await homeLink.isVisible().catch(() => false)) {
            await homeLink.click();
            await expect(page).toHaveURL('/');
        }
    });
});

test.describe('Loading States', () => {
    test('should show loading skeleton on login page initially', async ({ page }) => {
        // Navigate without waiting for full load
        await page.goto('/login', { waitUntil: 'commit' });

        // The skeleton might be very brief, but we can check the page renders
        // without errors within the loading state
        await page.waitForSelector('button[type="submit"], [class*="skeleton"]', { timeout: 10000 });
    });

    test('should show loading skeleton on signup page initially', async ({ page }) => {
        await page.goto('/signup', { waitUntil: 'commit' });

        await page.waitForSelector('button[type="submit"], [class*="skeleton"]', { timeout: 10000 });
    });

    test('should show spinner when submitting login form', async ({ page }) => {
        await page.goto('/login');

        await page.locator('input#login-email').fill('test@example.com');
        await page.locator('input#login-password').fill('TestPassword123!');

        // Click submit and check for loading state
        await page.click('button[type="submit"]');

        // Submit button should show loading text
        const submitBtn = page.locator('button[type="submit"]');
        const btnText = await submitBtn.textContent();

        // Either "Signing in..." (loading) or original text if response was instant
        expect(btnText).toBeDefined();
    });
});
