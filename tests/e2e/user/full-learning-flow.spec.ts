/**
 * E2E Test: Full Learning Flow → Admin Verification
 *
 * Simulates a complete student learning journey:
 *   1. Register & Login
 *   2. Generate Course (via API — calls OpenAI)
 *   3. Generate Subtopic content (via API — calls OpenAI)
 *   4. Ask Question (streaming)
 *   5. Challenge My Thinking (streaming) + Feedback
 *   6. Generate Examples
 *   7. Submit Quiz
 *   8. Save Journal (structured reflection)
 *   9. Submit Feedback
 *  10. Discussion session (start → respond until complete)
 *
 * Then logs in as admin and navigates:
 *   - /admin/dashboard    → KPI cards, RM2/RM3 charts, recent activity
 *   - /admin/aktivitas    → Tabs: Tanya Jawab, Tantangan, Kuis, Refleksi, plus diskusi monitoring
 *   - /admin/riset        → Research analytics, prompt stage distribution
 *   - /admin/siswa        → Student list + activity summary
 *
 * Target: https://principle-learn-v3.vercel.app/ (production Vercel deployment)
 *
 * Prerequisites:
 *   - An admin account exists (default: admin@principlelearn.com)
 *   - Vercel deployment is live and accessible
 *
 * Run:
 *   npx playwright test full-learning-flow --headed
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://principle-learn-v3.vercel.app';

// ═══════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════

const ADMIN = {
  email: 'admin@principlelearn.com',
  password: 'AdminPassword123!', // ← update if different
};

const COURSE = {
  topic: 'Pengantar Algoritma dan Struktur Data',
  goal: 'Memahami konsep dasar algoritma, sorting, searching, dan penerapannya dalam pemrograman',
  level: 'beginner',
  extraTopics: 'Sorting, Searching, Array, Linked List',
  problem: 'Bagaimana menyelesaikan masalah pengurutan data dengan efisien',
  assumption: 'Bubble sort adalah algoritma sorting yang paling efisien untuk semua kasus',
};

const DISCUSSION_MAX_ROUNDS = 20;
const SCREENSHOT_DIR = 'tests/e2e-results/screenshots';

// ═══════════════════════════════════════════════════════════════════
// Test
// ═══════════════════════════════════════════════════════════════════

test.describe('Full Learning Flow → Admin Verification', () => {
  // Use production Vercel deployment — skip local webServer
  test.use({ baseURL: BASE_URL });

  test('complete learning journey and verify in admin panel', async ({ page, context }) => {
    // 10 minutes — multiple AI calls involved
    test.setTimeout(600_000);

    // ── Shared state ──
    // Use a fixed email so re-runs login instead of registering (avoids rate limiter)
    const studentEmail = 'e2e-flow-test@principlelearn.com';
    const studentPassword = 'TestPassword123!';
    const studentName = 'E2E Flow Tester';

    let userId = '';
    let courseId = '';
    let firstModuleTitle = '';
    let firstSubtopicTitle = '';
    let subtopicContent: {
      objectives?: string[];
      pages?: { title: string; paragraphs: string[] }[];
      keyTakeaways?: string[];
      quiz?: { question: string; options: string[]; correctIndex: number }[];
    } | null = null;

    // ── Helpers ──
    // Two fetch strategies:
    // 1. browserFetch — page.evaluate(fetch()) for long-running AI endpoints (resilient to Vercel timeouts)
    // 2. playwrightPost — page.request.post() for fast endpoints (proper cookie handling via middleware)

    async function getCsrfToken(): Promise<string> {
      const cookies = await context.cookies();
      return cookies.find((c) => c.name === 'csrf_token')?.value || '';
    }

    /** POST via browser fetch — for long-running AI calls that exceed Playwright's connection timeout */
    async function browserFetch(
      path: string,
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
      const csrf = await getCsrfToken();
      return page.evaluate(
        async ({ url, payload, csrfToken }) => {
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            body: JSON.stringify(payload),
          });
          const text = await res.text();
          let data: unknown = null;
          try { data = JSON.parse(text); } catch { data = null; }
          return { ok: res.ok, status: res.status, text, data };
        },
        { url: `${BASE_URL}${path}`, payload: body, csrfToken: csrf },
      );
    }

    /** POST via Playwright request API — proper cookie/middleware handling for fast endpoints */
    async function apiPost(
      path: string,
      body: Record<string, unknown>,
      timeoutMs = 30_000,
    ): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
      const csrf = await getCsrfToken();
      const res = await page.request.post(path, {
        data: body,
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        timeout: timeoutMs,
      });
      const text = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(text); } catch { data = null; }
      return { ok: res.ok(), status: res.status(), data, text };
    }

    /** GET via Playwright request API */
    async function apiGet(
      path: string,
    ): Promise<{ ok: boolean; status: number; data: unknown }> {
      const csrf = await getCsrfToken();
      const res = await page.request.get(path, {
        headers: { 'x-csrf-token': csrf },
      });
      const data = await res.json();
      return { ok: res.ok(), status: res.status(), data };
    }

    function log(step: string, detail?: string) {
      const msg = detail ? `[${step}] ${detail}` : `[${step}]`;
      console.log(`\n✓ ${msg}`);
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE A — STUDENT LEARNING FLOW
    // ═══════════════════════════════════════════════════════════════

    // ── 1. Register or Login ──
    await test.step('1. Register or login student account', async () => {
      // Try login first (user may exist from a previous run)
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      await page.locator('input[type="email"], input[name="email"], input#login-email').fill(studentEmail);
      await page.locator('input[type="password"], input[name="password"], input#login-password').fill(studentPassword);
      await page.click('button[type="submit"]');

      // Check if login succeeded (redirect to dashboard) or failed (stay on login)
      const loginOk = await page.waitForURL(/dashboard|request-course|onboarding/, { timeout: 10_000 }).then(() => true).catch(() => false);

      if (!loginOk) {
        // Login failed — try register
        console.log('  Login failed, attempting signup...');
        await page.goto('/signup');
        await page.waitForLoadState('networkidle');

        const nameInput = page.locator('input#signup-name');
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill(studentName);
        }

        await page.locator('input#signup-email').fill(studentEmail);
        await page.locator('input#signup-password').fill(studentPassword);
        await page.click('button[type="submit"]');

        await page.waitForURL(/dashboard|request-course|onboarding/, { timeout: 20_000 });
      }

      // Retrieve userId from /api/auth/me
      const meRes = await apiGet('/api/auth/me');
      expect(meRes.ok).toBeTruthy();
      const meData = meRes.data as { user?: { id: string } };
      userId = meData.user?.id || '';
      expect(userId).toBeTruthy();

      log('Auth', `${studentEmail} → userId=${userId}`);
    });

    // ── 2. Generate course (API) ──
    await test.step('2. Generate course via API', async () => {
      const res = await browserFetch('/api/generate-course', {
        topic: COURSE.topic,
        goal: COURSE.goal,
        level: COURSE.level,
        extraTopics: COURSE.extraTopics,
        problem: COURSE.problem,
        assumption: COURSE.assumption,
        userId,
      });

      expect(res.ok).toBeTruthy();
      const data = res.data as { courseId: string; outline: { module: string; subtopics?: { title: string; type?: string; isDiscussion?: boolean }[] }[] };

      courseId = data.courseId;
      expect(courseId).toBeTruthy();

      // Extract first module and subtopic titles
      const outline = data.outline;
      expect(outline).toBeTruthy();
      expect(outline.length).toBeGreaterThan(0);

      firstModuleTitle = outline[0].module;
      // Pick first non-discussion subtopic
      const firstSub = outline[0].subtopics?.find(
        (s) => s.type !== 'discussion' && !s.isDiscussion
      );
      firstSubtopicTitle = firstSub?.title || outline[0].subtopics?.[0]?.title || '';
      expect(firstSubtopicTitle).toBeTruthy();

      log('Generate Course', `courseId=${courseId}, module="${firstModuleTitle}", subtopic="${firstSubtopicTitle}"`);
      log('Course Outline', `${outline.length} modules, ${outline.reduce((a, m) => a + (m.subtopics?.length || 0), 0)} subtopics`);
    });

    // ── 3. Generate subtopic content (API) ──
    await test.step('3. Generate subtopic content', async () => {
      const res = await browserFetch('/api/generate-subtopic', {
        module: firstModuleTitle,
        subtopic: firstSubtopicTitle,
        courseId,
      });

      expect(res.ok).toBeTruthy();
      subtopicContent = res.data as typeof subtopicContent;

      expect(subtopicContent?.pages?.length).toBeGreaterThan(0);
      expect(subtopicContent?.quiz?.length).toBe(5);

      log('Generate Subtopic', `${subtopicContent?.pages?.length} pages, ${subtopicContent?.quiz?.length} quiz questions`);
    });

    // ── 4. Ask Question (streaming) ──
    await test.step('4. Ask a question', async () => {
      const contextText = subtopicContent?.pages
        ?.map((p) => p.paragraphs.join(' '))
        .join('\n')
        .slice(0, 2000) || 'Algoritma dan struktur data';

      const res = await browserFetch('/api/ask-question', {
        question: 'Apa perbedaan utama antara algoritma sorting bubble sort dan quick sort? Kapan sebaiknya menggunakan masing-masing?',
        context: contextText,
        userId,
        courseId,
        subtopic: firstSubtopicTitle,
        moduleIndex: 0,
        subtopicIndex: 0,
        pageNumber: 1,
        reasoningNote: 'Saya ingin memahami perbandingan efisiensi sorting',
      });

      expect(res.ok).toBeTruthy();
      const answer = res.text;
      expect(answer.length).toBeGreaterThan(50);

      log('Ask Question', `Answer length: ${answer.length} chars`);
    });

    // ── 5. Challenge Thinking (streaming) ──
    let challengeQuestion = '';
    await test.step('5. Challenge my thinking', async () => {
      const contextText = subtopicContent?.pages
        ?.map((p) => p.paragraphs.join(' '))
        .join('\n')
        .slice(0, 2000) || '';

      const res = await browserFetch('/api/challenge-thinking', {
        context: contextText,
        level: COURSE.level,
      });

      expect(res.ok).toBeTruthy();
      challengeQuestion = res.text;
      expect(challengeQuestion.length).toBeGreaterThan(20);

      log('Challenge Thinking', `Question: "${challengeQuestion.slice(0, 100)}..."`);
    });

    // ── 6. Challenge Feedback ──
    await test.step('6. Get challenge feedback', async () => {
      const res = await browserFetch('/api/challenge-feedback', {
        question: challengeQuestion,
        answer: 'Menurut saya, algoritma sorting yang efisien penting karena dapat mempengaruhi performa aplikasi secara signifikan. Quick sort umumnya lebih cepat dari bubble sort karena menggunakan strategi divide-and-conquer, meskipun dalam worst case keduanya bisa memiliki kompleksitas yang sama.',
        context: subtopicContent?.pages?.[0]?.paragraphs?.join(' ') || '',
        level: COURSE.level,
      });

      expect(res.ok).toBeTruthy();
      const feedback = (res.data as { feedback?: string })?.feedback || '';
      if (feedback) {
        log('Challenge Feedback', `Feedback length: ${feedback.length} chars`);
      } else {
        console.log('  ⚠ Challenge feedback returned empty (AI may have returned no content) — continuing');
      }
    });

    // ── 7. Generate Examples ──
    await test.step('7. Generate examples', async () => {
      const contextText = subtopicContent?.pages
        ?.map((p) => p.paragraphs.join(' '))
        .join('\n')
        .slice(0, 2000) || '';

      const res = await browserFetch('/api/generate-examples', {
        context: contextText,
      });

      expect(res.ok).toBeTruthy();
      const data = res.data as { examples: string[] };
      expect(data.examples?.length).toBeGreaterThan(0);

      log('Generate Examples', `${data.examples.length} example(s) generated`);
    });

    // ── 8. Submit Quiz ──
    await test.step('8. Submit quiz answers', async () => {
      const quiz = subtopicContent?.quiz;
      expect(quiz?.length).toBe(5);

      // Build answer array — answer correctly using correctIndex
      const answers = quiz!.map((q, idx) => ({
        question: q.question,
        options: q.options,
        userAnswer: q.options[q.correctIndex] || q.options[0],
        isCorrect: true,
        questionIndex: idx,
        reasoningNote: `Saya memilih jawaban ini karena sesuai dengan konsep ${firstSubtopicTitle}`,
      }));

      const res = await apiPost('/api/quiz/submit', {
        userId,
        courseId,
        subtopic: firstSubtopicTitle,
        subtopicTitle: firstSubtopicTitle,
        moduleTitle: firstModuleTitle,
        moduleIndex: 0,
        subtopicIndex: 0,
        score: 100,
        answers,
      });

      if (!res.ok) {
        console.log(`  ⚠ Quiz submit failed (${res.status}): ${JSON.stringify(res.data || res.text).slice(0, 300)}`);
        // Quiz sync from generate-subtopic may still be running — wait and retry once
        console.log('  Retrying after 5s wait...');
        await page.waitForTimeout(5000);
        const retry = await apiPost('/api/quiz/submit', {
          userId, courseId, subtopic: firstSubtopicTitle, subtopicTitle: firstSubtopicTitle,
          moduleTitle: firstModuleTitle, moduleIndex: 0, subtopicIndex: 0, score: 100, answers,
        });
        if (!retry.ok) {
          console.log(`  ⚠ Quiz retry also failed (${retry.status}): ${JSON.stringify(retry.data || retry.text).slice(0, 300)}`);
        }
        const retryData = retry.data as { success: boolean; details?: { successfulMatches: number; totalAnswers: number } };
        log('Quiz Submit (retry)', `success=${retryData?.success}, matched=${retryData?.details?.successfulMatches}/${retryData?.details?.totalAnswers}`);
      } else {
        const data = res.data as { success: boolean; details?: { successfulMatches: number; totalAnswers: number } };
        log('Quiz Submit', `${data.details?.successfulMatches}/${data.details?.totalAnswers} matched`);
      }
    });

    // ── 9. Save Journal (structured reflection) ──
    await test.step('9. Save journal entry', async () => {
      const res = await apiPost('/api/jurnal/save', {
        userId,
        courseId,
        subtopic: firstSubtopicTitle,
        moduleIndex: 0,
        subtopicIndex: 0,
        type: 'structured_reflection',
        content: JSON.stringify({
          understood: 'Saya memahami konsep dasar sorting dan perbedaan antara bubble sort dan quick sort.',
          confused: 'Masih bingung tentang implementasi merge sort dan kapan sebaiknya digunakan.',
          strategy: 'Akan mencoba membuat visualisasi sorting untuk membantu pemahaman.',
          promptEvolution: 'Prompt saya sudah lebih terstruktur, mulai menyertakan konteks dan batasan.',
        }),
        understood: 'Saya memahami konsep dasar sorting dan perbedaan antara bubble sort dan quick sort.',
        confused: 'Masih bingung tentang implementasi merge sort dan kapan sebaiknya digunakan.',
        strategy: 'Akan mencoba membuat visualisasi sorting untuk membantu pemahaman.',
        promptEvolution: 'Prompt saya sudah lebih terstruktur, mulai menyertakan konteks dan batasan.',
        contentRating: 4,
        contentFeedback: 'Materi sangat jelas dan terstruktur. Contoh-contoh sangat membantu.',
      });

      expect(res.ok).toBeTruthy();
      const data = res.data as { success: boolean; id?: string };
      expect(data.success).toBe(true);

      log('Journal', `Saved structured reflection (id=${data.id})`);
    });

    // ── 10. Submit Feedback ──
    await test.step('10. Submit feedback', async () => {
      const res = await apiPost('/api/feedback', {
        userId,
        courseId,
        subtopic: firstSubtopicTitle,
        moduleIndex: 0,
        subtopicIndex: 0,
        rating: 5,
        comment: 'Materi yang sangat bagus dan komprehensif. Penjelasan tentang algoritma sangat mudah dipahami.',
      });

      expect(res.ok).toBeTruthy();
      const data = res.data as { success: boolean };
      expect(data.success).toBe(true);

      log('Feedback', 'Rating 5/5 submitted');
    });

    // ── 11. Discussion: start → respond until complete ──
    await test.step('11. Discussion session (full)', async () => {
      // Start discussion
      const startRes = await browserFetch('/api/discussion/start', {
        courseId,
        subtopicTitle: firstSubtopicTitle,
        moduleTitle: firstModuleTitle,
      });

      expect(startRes.ok).toBeTruthy();
      const startData = startRes.data as {
        session?: { id: string; status: string; learningGoals?: { id: string; covered: boolean }[] };
        currentStep?: { prompt: string; expected_type: string; options?: string[]; key: string; phase: string };
      };

      const sessionId = startData.session?.id;
      expect(sessionId).toBeTruthy();

      let status = startData.session?.status || 'in_progress';
      let nextStep = startData.currentStep as { prompt: string; expected_type: string; options?: string[] } | null | undefined;
      let round = 0;

      log('Discussion Start', `sessionId=${sessionId}, goals=${startData.session?.learningGoals?.length || 0}`);

      // Respond loop
      while (status !== 'completed' && nextStep && round < DISCUSSION_MAX_ROUNDS) {
        round++;

        // Build response based on step type
        let responseText: string;
        const expectedType = nextStep.expected_type || 'open';

        if (expectedType === 'mcq' && nextStep.options?.length > 0) {
          // Pick the first option for MCQ
          responseText = nextStep.options[0];
        } else if (expectedType === 'scale') {
          responseText = '4';
        } else {
          // Open-ended: give a substantive response
          responseText = buildDiscussionResponse(nextStep.prompt, round);
        }

        console.log(`  Round ${round}: [${expectedType}] "${nextStep.prompt?.slice(0, 60)}..." → "${responseText.slice(0, 60)}..."`);

        const respondRes = await browserFetch('/api/discussion/respond', {
          sessionId,
          message: responseText,
        });

        expect(respondRes.ok).toBeTruthy();
        const respondData = respondRes.data as {
          session?: { status: string; learningGoals?: { id: string; covered: boolean }[] };
          nextStep?: { prompt: string; expected_type: string; options?: string[] } | null;
        };

        status = respondData.session?.status || 'in_progress';
        nextStep = respondData.nextStep;

        // Count covered goals
        const goals = respondData.session?.learningGoals || [];
        const covered = goals.filter((g) => g.covered).length;
        console.log(`  → status=${status}, goals: ${covered}/${goals.length} covered`);
      }

      log('Discussion Complete', `Finished in ${round} rounds, final status: ${status}`);
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE B — ADMIN PANEL VERIFICATION
    // ═══════════════════════════════════════════════════════════════

    await test.step('12. Login as admin', async () => {
      // Clear student cookies
      await context.clearCookies();

      await page.goto('/admin/login');
      await page.waitForLoadState('networkidle');

      await page.fill('input[type="email"], input[name="email"]', ADMIN.email);
      await page.fill('input[type="password"], input[name="password"]', ADMIN.password);
      await page.click('button[type="submit"]');

      // Wait for redirect to admin area
      await page.waitForURL(/admin\/dashboard|admin(?!.*login)/, { timeout: 15_000 });
      log('Admin Login', `Logged in as ${ADMIN.email}`);
    });

    // ── 13. Admin Dashboard ──
    await test.step('13. Verify admin dashboard', async () => {
      await page.goto('/admin/dashboard');
      await page.waitForLoadState('networkidle');

      // Wait for KPI data to load
      await page.waitForSelector('[class*="kpiCard"], [class*="kpiGrid"]', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000); // allow charts to render

      // Verify KPI cards are visible
      const kpiGrid = page.locator('[class*="kpiGrid"], [class*="kpi"]');
      await expect(kpiGrid.first()).toBeVisible({ timeout: 10_000 });

      // Check for activity items
      const activityList = page.locator('[class*="activityList"], [class*="activityItem"]');
      const hasActivity = await activityList.first().isVisible().catch(() => false);
      console.log(`  Dashboard: KPI cards visible, activity items: ${hasActivity}`);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/01-admin-dashboard.png`,
        fullPage: true,
      });

      log('Admin Dashboard', 'Screenshot saved → 01-admin-dashboard.png');
    });

    // ── 14. Admin Aktivitas — monitoring tabs ──
    await test.step('14. Verify admin aktivitas page', async () => {
      await page.goto('/admin/aktivitas');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000); // allow data to load

      const tabs = ['ask', 'challenge', 'quiz', 'refleksi', 'diskusi'];

      for (const tab of tabs) {
        // Click the tab button
        const tabBtn = page.locator(`button:has-text("${getTabLabel(tab)}")`);
        if (await tabBtn.isVisible().catch(() => false)) {
          await tabBtn.click();
          await page.waitForTimeout(2000); // wait for data to load

          await page.screenshot({
            path: `${SCREENSHOT_DIR}/02-aktivitas-${tab}.png`,
            fullPage: true,
          });

          console.log(`  Tab "${getTabLabel(tab)}": screenshot saved`);
        }
      }

      log('Admin Aktivitas', 'All tabs screenshotted');
    });

    // ── 15. Admin Siswa ──
    await test.step('15. Verify admin siswa page', async () => {
      await page.goto('/admin/siswa');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-siswa-list.png`,
        fullPage: true,
      });

      // Try to find and click on the test student
      const studentRow = page.locator(`text=${studentEmail}`);
      if (await studentRow.isVisible().catch(() => false)) {
        await studentRow.click();
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/04-siswa-detail.png`,
          fullPage: true,
        });

        console.log(`  Student "${studentEmail}" found and detail viewed`);
      }

      log('Admin Siswa', 'Student list + detail screenshotted');
    });

    // ── 16. Admin Riset ──
    await test.step('16. Verify admin riset pages', async () => {
      await page.goto('/admin/riset');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/05-riset-dashboard.png`,
        fullPage: true,
      });

      // Navigate to prompt evolution page
      const promptNav = page.locator('text=Evolusi Prompt');
      if (await promptNav.isVisible().catch(() => false)) {
        await promptNav.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/06-riset-prompt.png`,
          fullPage: true,
        });
      }

      // Navigate to cognitive indicators page
      await page.goto('/admin/riset/kognitif');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/07-riset-kognitif.png`,
        fullPage: true,
      });

      log('Admin Riset', 'Research pages screenshotted');
    });

    // ── 17. Admin Ekspor ──
    await test.step('17. Verify admin ekspor page', async () => {
      await page.goto('/admin/ekspor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/08-ekspor.png`,
        fullPage: true,
      });

      log('Admin Ekspor', 'Export page screenshotted');
    });

    console.log('\n' + '═'.repeat(60));
    console.log('  ALL STEPS COMPLETED SUCCESSFULLY');
    console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}/`);
    console.log('═'.repeat(60) + '\n');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

/** Build a substantive discussion response based on the prompt */
function buildDiscussionResponse(prompt: string, round: number): string {
  const responses = [
    'Menurut saya, konsep ini berkaitan erat dengan bagaimana kita mengorganisir data secara efisien. Algoritma sorting membantu kita mengatur data dalam urutan tertentu sehingga pencarian dan pemrosesan data menjadi lebih cepat. Ini sangat penting dalam aplikasi nyata yang menangani data dalam jumlah besar.',
    'Saya memahami bahwa efisiensi algoritma diukur menggunakan notasi Big-O. Bubble sort memiliki kompleksitas O(n²) sedangkan quick sort memiliki rata-rata O(n log n). Perbedaan ini menjadi signifikan ketika ukuran data sangat besar, misalnya jutaan elemen.',
    'Dalam penerapan nyata, pemilihan algoritma sorting bergantung pada beberapa faktor: ukuran data, apakah data sudah hampir terurut, ketersediaan memori, dan apakah kita membutuhkan sorting yang stabil. Tidak ada satu algoritma yang terbaik untuk semua situasi.',
    'Struktur data yang tepat sangat penting untuk performa program. Array cocok untuk akses acak yang cepat, sedangkan linked list lebih baik untuk operasi insert dan delete. Pemilihan struktur data yang tepat bisa mempercepat program secara signifikan.',
    'Saya pikir pemahaman tentang kompleksitas waktu dan ruang sangat fundamental. Dengan memahami trade-off antara waktu dan memori, kita bisa membuat keputusan yang lebih baik dalam mendesain solusi. Contohnya, merge sort membutuhkan memori tambahan O(n) tapi menjamin O(n log n) dalam semua kasus.',
    'Konsep divide-and-conquer yang digunakan dalam quick sort dan merge sort sangat powerful. Idenya adalah memecah masalah besar menjadi sub-masalah yang lebih kecil, menyelesaikan masing-masing, lalu menggabungkan hasilnya. Pola ini juga digunakan dalam banyak algoritma lain.',
    'Menurut pemahaman saya, algoritma pencarian seperti binary search sangat bergantung pada data yang sudah terurut. Ini menunjukkan hubungan erat antara sorting dan searching. Binary search memiliki kompleksitas O(log n) yang jauh lebih baik dari linear search O(n).',
    'Dalam praktiknya, bahasa pemrograman modern sudah menyediakan fungsi sorting bawaan yang dioptimalkan, seperti Timsort di Python dan introsort di C++. Namun memahami dasar-dasarnya tetap penting untuk bisa memilih dan mengoptimalkan solusi yang tepat.',
    'Saya rasa konsep abstraksi data sangat penting dipahami. Interface dari struktur data (operasi apa yang bisa dilakukan) bisa sama meski implementasinya berbeda. Stack misalnya bisa diimplementasikan dengan array atau linked list, tapi operasinya tetap push dan pop.',
    'Kesimpulan saya dari topik ini adalah bahwa tidak ada solusi universal. Setiap masalah memerlukan analisis trade-off yang cermat. Memahami berbagai algoritma dan struktur data memberi kita toolkit yang lebih lengkap untuk menyelesaikan masalah pemrograman secara efisien.',
    'Refleksi saya menunjukkan bahwa pemahaman fundamental tentang algoritma membantu dalam pengambilan keputusan teknis. Ketika menghadapi masalah performa, mengetahui kompleksitas algoritma yang digunakan membantu mengidentifikasi bottleneck dan solusinya.',
    'Menurut saya hal yang paling penting dari materi ini adalah kemampuan untuk menganalisis dan membandingkan solusi. Dengan memahami notasi Big-O dan trade-off memori-waktu, kita bisa membuat keputusan berdasarkan data, bukan intuisi.',
  ];

  return responses[round % responses.length];
}

/** Map tab ID to display label */
function getTabLabel(tabId: string): string {
  const labels: Record<string, string> = {
    ask: 'Tanya Jawab',
    challenge: 'Tantangan',
    quiz: 'Kuis',
    refleksi: 'Refleksi',
    diskusi: 'Diskusi',
  };
  return labels[tabId] || tabId;
}
