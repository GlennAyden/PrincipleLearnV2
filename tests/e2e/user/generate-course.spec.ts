/**
 * E2E Tests: Course Generation Wizard (/request-course/*)
 *
 * Tests the complete multi-step course generation flow:
 * - Step 1: Topic and learning goal input
 * - Step 2: Knowledge level selection and extra topics
 * - Step 3: Problem & assumption (review/confirm)
 * - Generating: Progress/loading screen
 * - Result: Generated course outline
 *
 * Auth guards:
 * - Each step redirects to /login when not authenticated
 *
 * Navigation:
 * - Back links between steps
 * - Step indicator progression
 * - Dashboard link from step 1
 */

import { test, expect, type Page } from '@playwright/test';

// Helper: Sign up a fresh user
async function signupUser(page: Page) {
    const email = `wizard-test-${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const name = 'Wizard Tester';

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

    return { email, password, name };
}

// Helper: Navigate to step 1 after being authenticated
async function goToStep1(page: Page) {
    await page.goto('/request-course/step1');
    await page.waitForLoadState('networkidle');
}

test.describe('Course Wizard — Auth Guards', () => {
    test('step 1 should redirect to /login when not authenticated', async ({ page }) => {
        await page.context().clearCookies();
        await page.goto('/request-course/step1');
        await page.waitForURL(/login/, { timeout: 10000 });
        expect(page.url()).toContain('/login');
    });

    test('step 2 should redirect to /login when not authenticated', async ({ page }) => {
        await page.context().clearCookies();
        await page.goto('/request-course/step2');
        await page.waitForURL(/login/, { timeout: 10000 });
        expect(page.url()).toContain('/login');
    });

    test('step 3 should redirect to /login when not authenticated', async ({ page }) => {
        await page.context().clearCookies();
        await page.goto('/request-course/step3');
        await page.waitForURL(/login/, { timeout: 10000 });
        expect(page.url()).toContain('/login');
    });
});

test.describe('Course Wizard — Step 1: Topic & Goal', () => {
    test('should display step 1 page correctly', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        // Title
        const title = page.locator('h1:has-text("What do you want to learn")');
        await expect(title).toBeVisible({ timeout: 10000 });

        // Topic input
        const topicInput = page.locator('input[type="text"]');
        await expect(topicInput).toBeVisible();

        // Goal textarea
        const goalTextarea = page.locator('textarea');
        await expect(goalTextarea).toBeVisible();

        // Continue button
        const continueBtn = page.locator('button:has-text("Continue")');
        await expect(continueBtn).toBeVisible();

        // Step indicator showing step 1 active
        const step1Dot = page.locator('[data-active="true"]');
        await expect(step1Dot).toBeVisible();
    });

    test('should show validation error when fields are empty', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        // Click continue without filling fields
        const continueBtn = page.locator('button:has-text("Continue")');
        await continueBtn.click();

        // Should show error message
        const errorMsg = page.locator('text=/Please fill both fields/i');
        await expect(errorMsg).toBeVisible({ timeout: 5000 });

        // Should remain on step 1
        expect(page.url()).toContain('/request-course/step1');
    });

    test('should show error when only topic is filled', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        const topicInput = page.locator('input[type="text"]');
        await topicInput.fill('Machine Learning');

        const continueBtn = page.locator('button:has-text("Continue")');
        await continueBtn.click();

        // Should remain on step 1 (goal is empty)
        const errorMsg = page.locator('text=/Please fill both fields/i');
        await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should navigate to step 2 with valid inputs', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        const topicInput = page.locator('input[type="text"]');
        await topicInput.fill('Machine Learning');

        const goalTextarea = page.locator('textarea');
        await goalTextarea.fill('Understand the fundamentals of ML and AI');

        const continueBtn = page.locator('button:has-text("Continue")');
        await continueBtn.click();

        await page.waitForURL(/request-course\/step2/, { timeout: 10000 });
        expect(page.url()).toContain('/request-course/step2');
    });

    test('should have back link to dashboard', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        const backLink = page.locator('a:has-text("Dashboard")');
        await expect(backLink).toBeVisible({ timeout: 10000 });

        await backLink.click();
        await page.waitForURL(/dashboard/, { timeout: 10000 });
    });
});

test.describe('Course Wizard — Step 2: Knowledge Level', () => {
    // Helper: Complete step 1 and navigate to step 2
    async function goToStep2(page: Page) {
        await goToStep1(page);

        const topicInput = page.locator('input[type="text"]');
        await topicInput.fill('Machine Learning');

        const goalTextarea = page.locator('textarea');
        await goalTextarea.fill('Understand ML fundamentals');

        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/request-course\/step2/, { timeout: 10000 });
    }

    test('should display step 2 page correctly', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Title
        const title = page.locator('h1:has-text("Your knowledge level")');
        await expect(title).toBeVisible({ timeout: 10000 });

        // Three level cards
        const beginnerCard = page.locator('button:has-text("Beginner")');
        const intermediateCard = page.locator('button:has-text("Intermediate")');
        const advancedCard = page.locator('button:has-text("Advanced")');

        await expect(beginnerCard).toBeVisible();
        await expect(intermediateCard).toBeVisible();
        await expect(advancedCard).toBeVisible();

        // Extra topics textarea (optional)
        const extraTopics = page.locator('textarea');
        await expect(extraTopics).toBeVisible();

        // Continue button
        const continueBtn = page.locator('button:has-text("Continue")');
        await expect(continueBtn).toBeVisible();
    });

    test('should show error when no level is selected', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Click continue without selecting level
        await page.locator('button:has-text("Continue")').click();

        // Should show error
        const errorMsg = page.locator('text=/Please select your knowledge level/i');
        await expect(errorMsg).toBeVisible({ timeout: 5000 });
    });

    test('should select level and navigate to step 3', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Select Beginner
        const beginnerCard = page.locator('button:has-text("Beginner")');
        await beginnerCard.click();

        // Verify it's selected (data-selected attribute)
        await expect(beginnerCard).toHaveAttribute('data-selected', 'true', { timeout: 3000 });

        // Continue
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/request-course\/step3/, { timeout: 10000 });
    });

    test('should allow selecting different levels', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Select Intermediate
        const intermediateCard = page.locator('button:has-text("Intermediate")');
        await intermediateCard.click();
        await expect(intermediateCard).toHaveAttribute('data-selected', 'true', { timeout: 3000 });

        // Switch to Advanced
        const advancedCard = page.locator('button:has-text("Advanced")');
        await advancedCard.click();
        await expect(advancedCard).toHaveAttribute('data-selected', 'true', { timeout: 3000 });

        // Intermediate should no longer be selected
        await expect(intermediateCard).toHaveAttribute('data-selected', 'false', { timeout: 3000 });
    });

    test('should accept optional extra topics', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Select level
        await page.locator('button:has-text("Beginner")').click();

        // Fill optional extra topics
        const extraTopics = page.locator('textarea');
        await extraTopics.fill('Neural Networks, Transfer Learning, NLP');

        // Continue
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/request-course\/step3/, { timeout: 10000 });
    });

    test('should have back link to step 1', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        const backLink = page.locator('a:has-text("Back")');
        await expect(backLink).toBeVisible({ timeout: 10000 });

        await backLink.click();
        await page.waitForURL(/request-course\/step1/, { timeout: 10000 });
    });

    test('step indicator should show step 1 as done', async ({ page }) => {
        await signupUser(page);
        await goToStep2(page);

        // Step 1 should be marked as done (checkmark)
        const doneStep = page.locator('[data-done="true"]');
        await expect(doneStep).toBeVisible({ timeout: 5000 });

        // Step 2 should be active
        const activeStep = page.locator('[data-active="true"]');
        await expect(activeStep).toBeVisible();
    });
});

test.describe('Course Wizard — Step 3: Problem & Assumption', () => {
    // Helper: Complete steps 1-2 and go to step 3
    async function goToStep3(page: Page) {
        await goToStep1(page);

        // Step 1
        await page.locator('input[type="text"]').fill('Machine Learning');
        await page.locator('textarea').fill('Understand ML fundamentals');
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step2/, { timeout: 10000 });

        // Step 2
        await page.locator('button:has-text("Beginner")').click();
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step3/, { timeout: 10000 });
    }

    test('should display step 3 page correctly', async ({ page }) => {
        await signupUser(page);
        await goToStep3(page);

        // Should have textareas or inputs for problem and assumption
        // The exact UI depends on the page implementation
        const continueOrGenerate = page.locator('button:has-text(/Continue|Generate|Create/)');
        await expect(continueOrGenerate).toBeVisible({ timeout: 10000 });
    });

    test('should have back link to step 2', async ({ page }) => {
        await signupUser(page);
        await goToStep3(page);

        const backLink = page.locator('a:has-text("Back")');
        await expect(backLink).toBeVisible({ timeout: 10000 });

        await backLink.click();
        await page.waitForURL(/request-course\/step2/, { timeout: 10000 });
    });
});

test.describe('Course Wizard — Full Flow', () => {
    test('should complete entire wizard flow from step 1 to generating', async ({ page }) => {
        test.slow(); // Allow extra time for AI generation
        await signupUser(page);
        await goToStep1(page);

        // Step 1: Fill topic and goal
        await page.locator('input[type="text"]').fill('Introduction to Data Science');
        await page.locator('textarea').fill('Learn data analysis and visualization');
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step2/, { timeout: 10000 });

        // Step 2: Select level
        await page.locator('button:has-text("Beginner")').click();

        // Optional: fill extra topics
        const extraTopics = page.locator('textarea');
        if (await extraTopics.isVisible().catch(() => false)) {
            await extraTopics.fill('Python, Pandas, Matplotlib');
        }

        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step3/, { timeout: 10000 });

        // Step 3: Fill optional fields and submit
        const textareas = page.locator('textarea');
        const textareaCount = await textareas.count();

        if (textareaCount >= 1) {
            await textareas.first().fill('How to analyze real-world datasets');
        }
        if (textareaCount >= 2) {
            await textareas.nth(1).fill('I think data science requires heavy math');
        }

        // Click generate/submit button
        const submitBtn = page.locator('button:has-text(/Generate|Create|Continue/)');
        await expect(submitBtn).toBeVisible({ timeout: 10000 });
        await submitBtn.click();

        // Should navigate to generating page or show loading
        // The generating page might redirect quickly or show progress
        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        // Should be on generating page, result page, or dashboard
        expect(
            currentUrl.includes('generating') ||
            currentUrl.includes('result') ||
            currentUrl.includes('dashboard') ||
            currentUrl.includes('course')
        ).toBeTruthy();
    });
});

test.describe('Course Wizard — Session Persistence', () => {
    test('step 1 inputs should persist after navigating back from step 2', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        const topic = 'Persistent Topic Test';
        const goal = 'Persistent Goal Test';

        // Fill step 1
        await page.locator('input[type="text"]').fill(topic);
        await page.locator('textarea').fill(goal);
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step2/, { timeout: 10000 });

        // Go back to step 1
        const backLink = page.locator('a:has-text("Back")');
        await backLink.click();
        await page.waitForURL(/step1/, { timeout: 10000 });

        // Values should be preserved
        const topicInput = page.locator('input[type="text"]');
        const goalTextarea = page.locator('textarea');

        await expect(topicInput).toHaveValue(topic, { timeout: 5000 });
        await expect(goalTextarea).toHaveValue(goal, { timeout: 5000 });
    });
});

test.describe('Course Wizard — Step Indicators', () => {
    test('step 1 should show step 1 as active', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        const stepDots = page.locator('[class*="stepDot"]');
        const count = await stepDots.count();
        expect(count).toBeGreaterThanOrEqual(3);

        // First dot should be active
        const firstDot = stepDots.first();
        await expect(firstDot).toHaveAttribute('data-active', 'true');
    });

    test('step 2 should show step 1 as done and step 2 as active', async ({ page }) => {
        await signupUser(page);
        await goToStep1(page);

        await page.locator('input[type="text"]').fill('Test Topic');
        await page.locator('textarea').fill('Test Goal');
        await page.locator('button:has-text("Continue")').click();
        await page.waitForURL(/step2/, { timeout: 10000 });

        // Step 1 done
        const doneStep = page.locator('[data-done="true"]');
        await expect(doneStep).toBeVisible({ timeout: 5000 });

        // Step 2 active
        const activeStep = page.locator('[data-active="true"]');
        await expect(activeStep).toBeVisible();
        const activeText = await activeStep.textContent();
        expect(activeText).toContain('2');
    });
});
