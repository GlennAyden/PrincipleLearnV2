// src/app/api/admin/insights/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';
import { withCacheHeaders } from '@/lib/api-middleware';
import jwt from 'jsonwebtoken';
import type { TimeRange } from '@/types/dashboard';

const JWT_SECRET = process.env.JWT_SECRET!;

// ── Row Interfaces ──
interface PromptRow { id: string; user_id: string; question: string; prompt_components: unknown; prompt_version: string; session_number: number; reasoning_note: string; created_at: string }
interface QuizRow { id: string; user_id: string; is_correct: boolean; reasoning_note: string; created_at: string }
interface JournalRow { id: string; user_id: string; content: unknown; type: string; created_at: string }
interface ChallengeRow { id: string; user_id: string; created_at: string }
interface DiscussionRow { id: string; user_id: string; status: string; created_at: string }
interface PromptClassificationRow { id: string; user_id: string; prompt_stage: string; prompt_stage_score: number; created_at: string; [key: string]: unknown }
interface InsightsUserRow { id: string; email: string; created_at: string }
interface PromptComponents { tujuan?: string; konteks?: string; batasan?: string }
// Unified type for promptList (can be either PromptRow or mapped PromptClassificationRow)
interface PromptListItem { id: string; user_id: string; reasoning_note?: string; prompt_components?: unknown; session_number?: number; created_at: string }

function verifyAdminFromCookie(request: NextRequest): { userId: string; email: string; role: string } | null {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string }
    if (payload.role?.toLowerCase() !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

function getDateSince(range: TimeRange): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  now.setDate(now.getDate() - days)
  return now
}

async function safeQuery<T = Record<string, unknown>>(
  tableName: string,
  selectFields: string = '*',
  filters?: Record<string, string | number | boolean | null>
): Promise<T[]> {
  try {
    let query = adminDb.from(tableName).select(selectFields)
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value)
      }
    }
    const { data, error } = await query
    if (error) {
      console.warn(`[Insights] Query ${tableName} failed:`, error.message || error)
      return []
    }
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn(`[Insights] Query ${tableName} exception:`, err)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    // Auth Guard
    const admin = verifyAdminFromCookie(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const courseId = searchParams.get('courseId') || '';
    const timeRange = (searchParams.get('range') || 'all') as TimeRange;

    console.log('[Admin Insights] Fetching data:', { userId, courseId, timeRange });

    // Parallel Data Fetching with time filter
    const dateSince = getDateSince(timeRange)
    const filterByTime = <T extends { created_at?: string }>(items: T[]): T[] => {
      if (!dateSince) return items
      return items.filter(item => {
        const d = item.created_at ? new Date(item.created_at) : null
        return d && !isNaN(d.getTime()) && d >= dateSince
      })
    }

    const [
      prompts,
      quizzes,
      journals,
      challenges,
      _discussions,
      // Research tables
      promptClassifications,
    ] = await Promise.all([
      safeQuery<PromptRow>('ask_question_history', 'id, user_id, question, prompt_components, prompt_version, session_number, reasoning_note, created_at', userId ? { user_id: userId } : {}),
      safeQuery<QuizRow>('quiz_submissions', 'id, user_id, is_correct, reasoning_note, created_at', userId ? { user_id: userId } : {}),
      safeQuery<JournalRow>('jurnal', 'id, user_id, content, type, created_at', userId ? { user_id: userId } : {}),
      safeQuery<ChallengeRow>('challenge_responses', 'id, user_id, created_at', userId ? { user_id: userId } : {}),
      safeQuery<DiscussionRow>('discussion_sessions', 'id, user_id, status, created_at'),
      safeQuery<PromptClassificationRow>('prompt_classifications', '*'),
    ]);

    // Apply time filter
    const filteredPrompts = filterByTime(prompts);

    // ── RM2: Prompt Evolution (Research + Heuristic) ──
    const hasResearchRM2 = promptClassifications.length > 0
    let promptList: PromptListItem[] = filteredPrompts
    let avgComponentsUsed = 0
    const stageDistribution: Record<string, number> = { SCP: 0, SRP: 0, MQP: 0, Reflektif: 0 }

    if (hasResearchRM2) {
      // Filter research data by time/user
      const filteredPC = promptClassifications.filter(pc => {
        if (userId && pc.user_id !== userId) return false
        if (dateSince) {
          const d = new Date(pc.created_at)
          if (isNaN(d.getTime()) || d < dateSince) return false
        }
        return true
      })

      promptList = filteredPC.map(pc => ({
        ...pc,
        prompt_stage: pc.prompt_stage === 'REFLECTIVE' ? 'Reflektif' : pc.prompt_stage,
        prompt_stage_score: pc.prompt_stage_score || 1
      }))

      filteredPC.forEach(pc => {
        const stage = pc.prompt_stage || 'SCP'
        stageDistribution[stage] = (stageDistribution[stage] || 0) + 1
      })
    } else {
      // Heuristic fallback
      const promptsWithComponents = promptList.filter(p => p.prompt_components)
      avgComponentsUsed = promptsWithComponents.length > 0
        ? promptsWithComponents.reduce((sum: number, p) => {
          const comps = (typeof p.prompt_components === 'string' ? JSON.parse(p.prompt_components) : p.prompt_components) as PromptComponents | null
          let count = 0
          if (comps?.tujuan) count++
          if (comps?.konteks) count++
          if (comps?.batasan) count++
          return sum + count
        }, 0) / promptsWithComponents.length
        : 0
    }

    const promptsWithReasoning = promptList.filter(p => p.reasoning_note?.trim());
    const reasoningRate = promptList.length > 0
      ? Math.round((promptsWithReasoning.length / promptList.length) * 100) : 0;

    // Group prompts by session to track evolution
    const sessionMap: Record<number, PromptListItem[]> = {};
    promptList.forEach(p => {
      const session = p.session_number || 1;
      if (!sessionMap[session]) sessionMap[session] = [];
      sessionMap[session].push(p);
    });

    const promptEvolutionChart = Object.entries(sessionMap)
      .map(([session, items]) => {
        const withComps = items.filter(i => i.prompt_components);
        const avgComps = withComps.length > 0
          ? withComps.reduce((s: number, i) => {
            const c = (typeof i.prompt_components === 'string'
              ? JSON.parse(i.prompt_components) : i.prompt_components) as PromptComponents | null;
            let n = 0;
            if (c?.tujuan) n++;
            if (c?.konteks) n++;
            if (c?.batasan) n++;
            return s + n;
          }, 0) / withComps.length
          : 0;
        const withReason = items.filter(i => i.reasoning_note?.trim());
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
    const quizList = quizzes.map(item => ({
      ...item,
      submitted_at: item.created_at ?? null,
    }));

    const quizCorrect = quizList.filter(q => q.is_correct).length;
    const quizAccuracy = quizList.length > 0
      ? Math.round((quizCorrect / quizList.length) * 100) : 0;
    const quizWithReasoning = quizList.filter(q => q.reasoning_note?.trim()).length;

    // ── 3. Reflection Data (RM3) ──
    const journalList = journals;
    const structuredReflections = journalList.filter(j => j.type === 'structured_reflection');

    // Parse content ratings from structured reflections
    const ratings: number[] = [];
    structuredReflections.forEach(r => {
      try {
        const parsed = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { contentRating?: number } | null;
        if (parsed?.contentRating && parsed.contentRating > 0) {
          ratings.push(parsed.contentRating);
        }
      } catch { /* ignore parse errors */ }
    });
    const avgContentRating = ratings.length > 0
      ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
      : 0;

    // CT indicator counts from structured reflections
    let ctIndicators = 0;
    structuredReflections.forEach(r => {
      try {
        const parsed = (typeof r.content === 'string' ? JSON.parse(r.content) : r.content) as { understood?: string; confused?: string; strategy?: string; promptEvolution?: string } | null;
        if (parsed?.understood?.trim()) ctIndicators++;
        if (parsed?.confused?.trim()) ctIndicators++;
        if (parsed?.strategy?.trim()) ctIndicators++;
        if (parsed?.promptEvolution?.trim()) ctIndicators++;
      } catch { /* ignore parse errors */ }
    });

    // ── 4. Challenge Responses ──
    const challengeList = challenges;
    // Note: challenge_responses table has no reasoning_note column; always 0.
    const challengesWithReasoning = 0;

    // ── 5. Per-student summary ──
    let studentSummary: { userId: string; email: string; totalPrompts: number; totalQuizzes: number; quizAccuracy: number; totalReflections: number; totalChallenges: number; joinedAt: string }[] = [];
    if (!userId) {
      const { data: allUsers } = await adminDb
        .from('users')
        .select('id, email, created_at')
        .eq('role', 'user');

      const userList = Array.isArray(allUsers) ? allUsers as InsightsUserRow[] : [];
      studentSummary = userList.map(u => {
        const userPrompts = promptList.filter(p => p.user_id === u.id);
        const userQuizzes = quizList.filter(q => q.user_id === u.id);
        const userJournals = journalList.filter(j => j.user_id === u.id);
        const userChallenges = challengeList.filter(c => c.user_id === u.id);

        const correctQuiz = userQuizzes.filter(q => q.is_correct).length;

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
      }).sort((a, b) => b.totalPrompts - a.totalPrompts);
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

    return withCacheHeaders(NextResponse.json({
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
    }), 60);
  } catch (err: unknown) {
    console.error('[Admin Insights] Error:', err);
    return NextResponse.json(
      { error: 'Failed to load insights' },
      { status: 500 }
    );
  }
}
