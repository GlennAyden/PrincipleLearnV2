// src/app/api/admin/insights/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const courseId = searchParams.get('courseId') || '';

    console.log('[Admin Insights] Fetching data with filters:', { userId, courseId });

    // ── 1. Prompt Evolution Data (RM2) ──
    let promptQuery = adminDb
      .from('ask_question_history')
      .select('id, user_id, question, prompt_components, prompt_version, session_number, reasoning_note, created_at');

    if (userId) promptQuery = promptQuery.eq('user_id', userId);
    if (courseId) promptQuery = promptQuery.eq('course_id', courseId);

    const { data: prompts, error: promptError } = await promptQuery;
    if (promptError) console.error('[Admin Insights] Prompt query error:', promptError);
    console.log('[Admin Insights] Prompts fetched:', prompts?.length || 0);
    const promptList = Array.isArray(prompts) ? prompts : [];

    // Compute prompt complexity metrics
    const promptsWithComponents = promptList.filter((p: any) => p.prompt_components);
    const avgComponentsUsed = promptsWithComponents.length > 0
      ? promptsWithComponents.reduce((sum: number, p: any) => {
        const comps = typeof p.prompt_components === 'string'
          ? JSON.parse(p.prompt_components) : p.prompt_components;
        let count = 0;
        if (comps?.tujuan) count++;
        if (comps?.konteks) count++;
        if (comps?.batasan) count++;
        return sum + count;
      }, 0) / promptsWithComponents.length
      : 0;

    const promptsWithReasoning = promptList.filter((p: any) => p.reasoning_note?.trim());
    const reasoningRate = promptList.length > 0
      ? Math.round((promptsWithReasoning.length / promptList.length) * 100) : 0;

    // Group prompts by session to track evolution
    const sessionMap: Record<number, any[]> = {};
    promptList.forEach((p: any) => {
      const session = p.session_number || 1;
      if (!sessionMap[session]) sessionMap[session] = [];
      sessionMap[session].push(p);
    });

    const promptEvolutionChart = Object.entries(sessionMap)
      .map(([session, items]) => {
        const withComps = items.filter((i: any) => i.prompt_components);
        const avgComps = withComps.length > 0
          ? withComps.reduce((s: number, i: any) => {
            const c = typeof i.prompt_components === 'string'
              ? JSON.parse(i.prompt_components) : i.prompt_components;
            let n = 0;
            if (c?.tujuan) n++;
            if (c?.konteks) n++;
            if (c?.batasan) n++;
            return s + n;
          }, 0) / withComps.length
          : 0;
        const withReason = items.filter((i: any) => i.reasoning_note?.trim());
        return {
          session: `Sesi ${session}`,
          totalPrompts: items.length,
          avgComponents: Math.round(avgComps * 10) / 10,
          reasoningRate: items.length > 0
            ? Math.round((withReason.length / items.length) * 100) : 0,
        };
      })
      .sort((a, b) => parseInt(a.session.replace('Sesi ', '')) - parseInt(b.session.replace('Sesi ', '')));

    // ── 2. Quiz Performance (RM3) ──
    let quizQuery = adminDb
      .from('quiz_submissions')
      .select('id, user_id, is_correct, reasoning_note, created_at');

    if (userId) quizQuery = quizQuery.eq('user_id', userId);

    const { data: quizzes } = await quizQuery;
    const quizList = Array.isArray(quizzes)
      ? quizzes.map((item: any) => ({
        ...item,
        submitted_at: item.created_at ?? null,
      }))
      : [];

    const quizCorrect = quizList.filter((q: any) => q.is_correct).length;
    const quizAccuracy = quizList.length > 0
      ? Math.round((quizCorrect / quizList.length) * 100) : 0;
    const quizWithReasoning = quizList.filter((q: any) => q.reasoning_note?.trim()).length;

    // ── 3. Reflection Data (RM3) ──
    let reflectionQuery = adminDb
      .from('jurnal')
      .select('id, user_id, content, type, created_at');

    if (userId) reflectionQuery = reflectionQuery.eq('user_id', userId);

    const { data: journals } = await reflectionQuery;
    const journalList = Array.isArray(journals) ? journals : [];
    const structuredReflections = journalList.filter((j: any) => j.type === 'structured_reflection');
    const freeTextReflections = journalList.filter((j: any) => j.type !== 'structured_reflection');

    // Parse content ratings from structured reflections
    const ratings: number[] = [];
    structuredReflections.forEach((r: any) => {
      try {
        const parsed = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
        if (parsed?.contentRating && parsed.contentRating > 0) {
          ratings.push(parsed.contentRating);
        }
      } catch { }
    });
    const avgContentRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : 0;

    // CT indicator counts from structured reflections
    let ctIndicators = 0;
    structuredReflections.forEach((r: any) => {
      try {
        const parsed = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
        if (parsed?.understood?.trim()) ctIndicators++;
        if (parsed?.confused?.trim()) ctIndicators++;
        if (parsed?.strategy?.trim()) ctIndicators++;
        if (parsed?.promptEvolution?.trim()) ctIndicators++;
      } catch { }
    });

    // ── 4. Challenge Responses ──
    let challengeQuery = adminDb
      .from('challenge_responses')
      .select('id, user_id, reasoning_note, created_at');

    if (userId) challengeQuery = challengeQuery.eq('user_id', userId);

    const { data: challenges } = await challengeQuery;
    const challengeList = Array.isArray(challenges) ? challenges : [];
    const challengesWithReasoning = challengeList.filter((c: any) => c.reasoning_note?.trim()).length;

    // ── 5. Per-student summary ──
    let studentSummary: any[] = [];
    if (!userId) {
      const { data: allUsers } = await adminDb
        .from('users')
        .select('id, email, created_at')
        .eq('role', 'user');

      const userList = Array.isArray(allUsers) ? allUsers : [];
      studentSummary = userList.map((u: any) => {
        const userPrompts = promptList.filter((p: any) => p.user_id === u.id);
        const userQuizzes = quizList.filter((q: any) => q.user_id === u.id);
        const userJournals = journalList.filter((j: any) => j.user_id === u.id);
        const userChallenges = challengeList.filter((c: any) => c.user_id === u.id);

        const correctQuiz = userQuizzes.filter((q: any) => q.is_correct).length;

        return {
          userId: u.id,
          email: u.email,
          totalPrompts: userPrompts.length,
          totalQuizzes: userQuizzes.length,
          quizAccuracy: userQuizzes.length > 0 ? Math.round((correctQuiz / userQuizzes.length) * 100) : 0,
          totalReflections: userJournals.length,
          totalChallenges: userChallenges.length,
          joinedAt: u.created_at,
        };
      }).sort((a: any, b: any) => b.totalPrompts - a.totalPrompts);
    }

    // ── 6. Users list for filter ──
    const { data: userOptions } = await adminDb
      .from('users')
      .select('id, email')
      .eq('role', 'user');

    // ── 7. Courses list for filter ──
    const { data: courseOptions } = await adminDb
      .from('courses')
      .select('id, title');

    return NextResponse.json({
      // Summary cards
      summary: {
        totalPrompts: promptList.length,
        avgComponentsUsed: Math.round(avgComponentsUsed * 10) / 10,
        reasoningRate,
        quizAccuracy,
        quizTotal: quizList.length,
        quizWithReasoning,
        reflectionTotal: journalList.length,
        structuredReflections: structuredReflections.length,
        avgContentRating,
        ctIndicators,
        challengeTotal: challengeList.length,
        challengesWithReasoning,
      },
      // Charts
      promptEvolutionChart,
      // Student table
      studentSummary,
      // Filter options
      users: Array.isArray(userOptions) ? userOptions : [],
      courses: Array.isArray(courseOptions) ? courseOptions : [],
    });
  } catch (err: any) {
    console.error('[Admin Insights] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to load insights' },
      { status: 500 }
    );
  }
}
