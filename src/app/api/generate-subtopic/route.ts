// src/app/api/generate-subtopic/route.ts

import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateDiscussionTemplate, generateModuleDiscussionTemplate } from '@/services/discussion/generateDiscussionTemplate';
import { aiRateLimiter } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/jwt';
import { GenerateSubtopicSchema, parseBody } from '@/lib/schemas';
import { chatCompletionWithRetry, sanitizePromptInput } from '@/services/ai.service';
import {
  syncQuizQuestions as syncQuizQuestionsHelper,
  buildSubtopicCacheKey,
} from '@/lib/quiz-sync';
import {
  mergeSubtopicCacheContent,
  sanitizeSubtopicContentForClient,
} from '@/lib/quiz-content';
import { withApiLogging } from '@/lib/api-logger';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import { buildLearningProgressStatus } from '@/lib/learning-progress';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

async function postHandler(request: NextRequest) {
  try {
    // Resolve caller identity: prefer the middleware-injected header, fall
    // back to the JWT cookie directly (middleware propagation has been
    // unreliable in production). Unlike the old fallback, we DO NOT allow
    // anonymous/IP-based callers — ownership is enforced per user below.
    let authUserId = request.headers.get('x-user-id');
    let authUserRole = request.headers.get('x-user-role') ?? undefined;
    if (!authUserId) {
      // Wrap verifyToken defensively: a malformed cookie (not just expired)
      // used to bubble as an uncaught synchronous throw and surface to the
      // client as a 500, even though the correct response for "token
      // unverifiable" is a 401 that triggers the apiFetch refresh retry.
      const accessToken = request.cookies.get('access_token')?.value;
      try {
        const tokenPayload = accessToken ? verifyToken(accessToken) : null;
        if (tokenPayload?.userId) {
          authUserId = tokenPayload.userId;
          authUserRole = authUserRole ?? tokenPayload.role;
        }
      } catch (tokenErr) {
        console.warn('[GenerateSubtopic] Cookie token verification threw', tokenErr);
      }
    }
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }
    const rateLimitKey = authUserId;

    const rawPayload = await request.json().catch(() => null);
    if (!rawPayload) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const parsed = parseBody(GenerateSubtopicSchema, rawPayload);
    if (!parsed.success) return parsed.response;
    const {
      module: rawModuleTitle,
      subtopic: rawSubtopic,
      courseId,
      moduleId,
      moduleIndex,
      subtopicIndex,
    } = parsed.data;

    // Enforce ownership BEFORE any DB / AI work. Admins bypass.
    try {
      await assertCourseOwnership(authUserId, courseId, authUserRole);
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr);
      if (asOwnership) {
        return NextResponse.json(
          { error: asOwnership.message },
          { status: asOwnership.status },
        );
      }
      throw ownershipErr;
    }

    const gateResponse = await enforceSubtopicGenerationAccess({
      userId: authUserId,
      courseId,
      moduleId,
      moduleTitle: rawModuleTitle,
      subtopicTitle: rawSubtopic,
      moduleIndex,
      subtopicIndex,
    });
    if (gateResponse) {
      return gateResponse;
    }

    // Sanitize user-provided prompt inputs before they reach the model.
    // Defense-in-depth layered on top of the XML boundary markers.
    const moduleTitle = sanitizePromptInput(rawModuleTitle);
    const subtopic = sanitizePromptInput(rawSubtopic);
    if (!moduleTitle || !subtopic) {
      return NextResponse.json(
        { error: 'module and subtopic must be non-empty after sanitization' },
        { status: 400 },
      );
    }

    // Database caching for performance optimization.
    // `courseId` is guaranteed present (schema marks it required) so the
    // previous `if (courseId)` guard has been removed. A bare block scopes
    // the cacheKey/adminDb variables without widening the outer handler.
    {
      try {
        const { adminDb } = await import('@/lib/database');

        // Check cache first (use adminDb — anon client has no RLS read policy on subtopic_cache)
        const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, subtopic);
        const { data: cached } = await adminDb
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        // Treat cache entries with a missing/empty quiz array as
        // INCOMPLETE (partial write, corruption, or legacy schema) and
        // fall through to fresh generation. Returning such an entry would
        // either serve the user meaningless content OR force the inline
        // sync below into a guaranteed-fail path where it 500s despite
        // the data being recoverable.
        const cachedQuizArr = Array.isArray(
          (cached?.content as { quiz?: unknown } | null)?.quiz,
        )
          ? ((cached!.content as { quiz: unknown[] }).quiz)
          : null;
        const cacheHasUsableQuiz = Boolean(cachedQuizArr && cachedQuizArr.length > 0);

        if (cached?.content && !cacheHasUsableQuiz) {
          console.warn('[GenerateSubtopic] Cache entry missing quiz — bypassing cache to regenerate', {
            courseId,
            cacheKey,
          });
        }

        if (cached?.content && cacheHasUsableQuiz) {
          console.log('[GenerateSubtopic] Returning cached subtopic data');

          // Pre-resolve the subtopic row (subtopics table is keyed per MODULE)
          // so we can both (a) check whether quiz rows already exist for the
          // specific (module, subtopic) pair and (b) hand the resolved id to
          // syncQuizQuestions without making it redo the fragile title lookup.
          const trimmedModuleTitle = moduleTitle?.trim() ?? '';
          const trimmedSubtopicLabel = subtopic?.trim() ?? '';
          let preResolvedSubtopicId: string | null = null;
          try {
            if (trimmedModuleTitle) {
              const { data: moduleRow } = await adminDb
                .from('subtopics')
                .select('id')
                .eq('course_id', courseId)
                .ilike('title', trimmedModuleTitle)
                .maybeSingle();
              preResolvedSubtopicId = (moduleRow as { id?: string } | null)?.id ?? null;
            }
          } catch (lookupError) {
            console.error('[GenerateSubtopic] Pre-resolve subtopic id failed', {
              error: lookupError,
              courseId,
              moduleTitle: trimmedModuleTitle,
            });
          }
          console.log('[GenerateSubtopic] Cache-hit sync diagnostic', {
            cacheKey,
            courseId,
            trimmedModuleTitle,
            trimmedSubtopicLabel,
            preResolvedSubtopicId,
            quizType: typeof (cached.content as { quiz?: unknown } | null)?.quiz,
            quizIsArray: Array.isArray((cached.content as { quiz?: unknown } | null)?.quiz),
            quizLength: Array.isArray((cached.content as { quiz?: unknown[] } | null)?.quiz)
              ? (cached.content as { quiz: unknown[] }).quiz.length
              : null,
          });

          // If the quiz table already has rows for this (subtopic_id,
          // subtopic_label) pair, we can defer the sync (background refresh).
          // Otherwise we MUST block until sync completes — returning early
          // would let the user submit against an empty `quiz` table and hit
          // "Pertanyaan kuis tidak ditemukan di database".
          let quizAlreadySeeded = false;
          if (preResolvedSubtopicId && trimmedSubtopicLabel) {
            try {
              const { data: existingQuiz } = await adminDb
                .from('quiz')
                .select('id')
                .eq('course_id', courseId)
                .eq('subtopic_id', preResolvedSubtopicId)
                .eq('subtopic_label', trimmedSubtopicLabel)
                .limit(1);
              quizAlreadySeeded = Array.isArray(existingQuiz) && existingQuiz.length > 0;
            } catch (existsError) {
              console.warn('[GenerateSubtopic] Quiz existence probe failed', existsError);
            }
          }

          if (!quizAlreadySeeded) {
            // Blocking inline sync — short critical path (single INSERT).
            // Must NOT swallow errors: a silent failure here used to return
            // 200 + cached content while the `quiz` table stayed empty,
            // which surfaced later as a mysterious "Pertanyaan kuis tidak
            // ditemukan" on quiz submit. Fail the request instead so the
            // client's retry has a chance to recover.
            try {
              const inlineSyncResult = await syncQuizQuestions({
                adminDb,
                courseId,
                moduleTitle,
                subtopicTitle: subtopic,
                quizItems: cached.content?.quiz,
                subtopicId: preResolvedSubtopicId ?? undefined,
              });
              console.log('[GenerateSubtopic] Inline sync result', {
                cacheKey,
                result: inlineSyncResult,
              });
              if (!inlineSyncResult || inlineSyncResult.insertedCount === 0) {
                console.error('[GenerateSubtopic] Inline quiz seed returned 0 rows', {
                  cacheKey,
                  preResolvedSubtopicId,
                });
                return NextResponse.json(
                  { error: 'Failed to seed quiz from cached content' },
                  { status: 500 },
                );
              }
            } catch (syncError) {
              console.error('[GenerateSubtopic] Inline quiz seed from cache failed', {
                error: syncError,
                cacheKey,
                preResolvedSubtopicId,
              });
              return NextResponse.json(
                { error: 'Failed to seed quiz from cached content' },
                { status: 500 },
              );
            }
          } else {
            // Already seeded — refresh in the background so stale quiz rows
            // get rotated without blocking the response.
            after(async () => {
              try {
                const { adminDb: bgAdminDb } = await import('@/lib/database');
                await syncQuizQuestions({
                  adminDb: bgAdminDb,
                  courseId,
                  moduleTitle,
                  subtopicTitle: subtopic,
                  quizItems: cached.content?.quiz,
                  subtopicId: preResolvedSubtopicId ?? undefined,
                });
              } catch (syncError) {
                console.error('[GenerateSubtopic] Background quiz sync from cache failed', {
                  error: syncError,
                  cacheKey,
                  preResolvedSubtopicId,
                });
              }
            });
          }

          const response = NextResponse.json(
            sanitizeSubtopicContentForClient(
              (cached.content ?? {}) as Record<string, unknown>,
            ),
          );
          response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
          return response;
        }

      } catch (cacheError) {
        // Continue with generation if cache fails
        console.warn('Cache read failed:', cacheError);
      }
    }

    // System prompt: content generation with dynamic language policy
    const systemMessage: ChatCompletionMessageParam = {
      role: 'system',
      content: [
        'You are an expert educational content creator that generates structured, comprehensive learning content in JSON format.',
        'Language policy:',
        '- Write in the same language as the provided module title and subtopic text.',
        '- If mixed, choose the dominant language; do not translate proper technical terms.',
        'Output must exactly follow this JSON schema without additional fields or markdown:',
        '{',
        '  "objectives": [string],',
        '  "pages": [{ "title": string, "paragraphs": [string] }],',
        '  "keyTakeaways": [string],',
        '  "quiz": [{ "question": string, "options": [string], "correctIndex": number }],',
        '  "whatNext": { "summary": string, "encouragement": string }',
        '}'
      ].join('\n')
    };

    // User prompt: request content for a specific subtopic
    const userMessage: ChatCompletionMessageParam = {
      role: 'user',
      content: [
        `Generate content for subtopic "${subtopic}" in module "${moduleTitle}":`,
        '- Learning objectives list (`objectives`).',
        '- `pages` array with:',
        '  * `title` for each page (clear and descriptive)',
        '  * `paragraphs` array with EXACTLY 3-5 comprehensive paragraphs per page.',
        '  * Each paragraph should be 2-4 sentences with detailed explanations.',
        '  * Paragraphs should build a cohesive understanding.',
        '- `keyTakeaways` list.',
        '- `quiz` with 5 questions (each has 4 options & `correctIndex`).',
        '- `whatNext` object containing `summary` and `encouragement`.',
        'Return only the JSON object without any extra text.'
      ].join(' ')
    };

    // Rate-limit only actual OpenAI generations. Cache hits above return
    // without consuming quota because they incur no model cost, so a learner
    // browsing previously-generated content can never be locked out.
    if (!(await aiRateLimiter.isAllowed(rateLimitKey))) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Use retry helper so a transient OpenAI 429 / 5xx / network blip does
    // not immediately surface as "Failed to load subtopic" to the learner.
    // Three attempts with exponential backoff has absorbed the vast
    // majority of real-world transient failures on the generate-course
    // path; we want the same resilience here.
    const resp = await chatCompletionWithRetry({
      messages: [systemMessage, userMessage],
      maxTokens: 4000,
      timeoutMs: 60000, // 60s — subtopic generation produces large content
      maxAttempts: 3,
    });

    const raw = resp.choices?.[0]?.message?.content ?? '';
    if (!raw.trim()) {
      return NextResponse.json(
        { error: 'Empty response from model' },
        { status: 502 }
      );
    }
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const sanitized = cleaned.replace(/,(?=\s*?[}\]])/g, '').trim();

    let data;
    try {
      data = JSON.parse(sanitized);

      // Validate that each page has 3-5 paragraphs
      let hasIssues = false;
      if (data.pages && Array.isArray(data.pages)) {
        for (let i = 0; i < data.pages.length; i++) {
          const page = data.pages[i];

          // Check if paragraphs array exists and has valid length
          if (!page.paragraphs || !Array.isArray(page.paragraphs)) {
            console.warn(`Page ${i + 1} has invalid paragraphs structure`);
            hasIssues = true;
            // Create empty paragraphs array if missing
            page.paragraphs = [];
          }

          // Handle too few paragraphs (less than 3)
          if (page.paragraphs.length < 3) {
            console.warn(`Page ${i + 1} has only ${page.paragraphs.length} paragraphs, minimum is 3`);
            hasIssues = true;

            // If we have at least one paragraph, duplicate the last one to reach minimum
            if (page.paragraphs.length > 0) {
              const lastParagraph = page.paragraphs[page.paragraphs.length - 1];
              while (page.paragraphs.length < 3) {
                page.paragraphs.push(lastParagraph);
              }
            } else {
              // If no paragraphs, add placeholder content
              page.paragraphs = [
                "Materi ini menjelaskan konsep dasar yang penting untuk dipahami.",
                "Pemahaman terhadap bagian ini akan membantu Anda mengikuti materi selanjutnya dengan lebih baik.",
                "Mari kita eksplorasi lebih dalam tentang topik ini untuk memperluas pengetahuan Anda."
              ];
            }
          }

          // Handle too many paragraphs (more than 5)
          if (page.paragraphs.length > 5) {
            console.warn(`Page ${i + 1} has ${page.paragraphs.length} paragraphs, maximum is 5`);
            hasIssues = true;
            // Keep only the first 5 paragraphs
            page.paragraphs = page.paragraphs.slice(0, 5);
          }
        }
      }

      // Validate quiz data
      if (!data.quiz || !Array.isArray(data.quiz)) {
        console.warn('Quiz data is missing or invalid, adding fallback quiz');
        hasIssues = true;
        data.quiz = [
          {
            question: "Apa yang telah Anda pelajari dari materi ini?",
            options: [
              "Konsep dasar yang dijelaskan dalam materi",
              "Penerapan praktis dari teori yang dipelajari",
              "Hubungan antara konsep dengan implementasi",
              "Semua jawaban di atas benar"
            ],
            correctIndex: 3
          },
          {
            question: "Manakah dari pernyataan berikut yang paling tepat?",
            options: [
              "Materi ini mudah dipahami",
              "Materi ini memerlukan pemahaman mendalam",
              "Materi ini dapat diterapkan langsung",
              "Semua pernyataan di atas benar"
            ],
            correctIndex: 3
          },
          {
            question: "Bagaimana cara terbaik untuk menguasai materi ini?",
            options: [
              "Membaca berulang-ulang",
              "Praktik dan latihan",
              "Diskusi dengan orang lain",
              "Kombinasi membaca, praktik, dan diskusi"
            ],
            correctIndex: 3
          },
          {
            question: "Apa langkah selanjutnya setelah memahami materi ini?",
            options: [
              "Melanjutkan ke materi berikutnya",
              "Mengulang materi dari awal",
              "Mencoba menerapkan dalam praktek",
              "Melanjutkan sambil tetap berlatih"
            ],
            correctIndex: 3
          },
          {
            question: "Seberapa penting pemahaman materi ini untuk pembelajaran selanjutnya?",
            options: [
              "Tidak terlalu penting",
              "Cukup penting sebagai dasar",
              "Sangat penting untuk materi lanjutan",
              "Esensial untuk seluruh pembelajaran"
            ],
            correctIndex: 2
          }
        ];
      } else if (data.quiz.length !== 5) {
        console.warn(`Expected 5 quiz questions, got ${data.quiz.length}, fixing...`);
        hasIssues = true;

        // If we have some questions, pad with fallback
        while (data.quiz.length < 5) {
          data.quiz.push({
            question: `Pertanyaan tambahan ${data.quiz.length + 1}: Apa yang dapat Anda simpulkan dari materi ini?`,
            options: [
              "Materi memberikan pemahaman baru",
              "Materi memperkuat konsep sebelumnya",
              "Materi membuka wawasan lebih luas",
              "Semua jawaban di atas benar"
            ],
            correctIndex: 3
          });
        }

        // If too many questions, trim to 5
        if (data.quiz.length > 5) {
          data.quiz = data.quiz.slice(0, 5);
        }
      } else {
        // Validate each quiz question
        for (let i = 0; i < data.quiz.length; i++) {
          const quiz = data.quiz[i];
          if (!quiz.question || !Array.isArray(quiz.options) || quiz.options.length !== 4 ||
            typeof quiz.correctIndex !== 'number' || quiz.correctIndex < 0 || quiz.correctIndex > 3) {
            console.warn(`Quiz question ${i + 1} has invalid structure, fixing...`);
            hasIssues = true;
            data.quiz[i] = {
              question: `Pertanyaan ${i + 1}: Apa yang dapat Anda pelajari dari bagian ini?`,
              options: [
                "Konsep teoritis",
                "Penerapan praktis",
                "Pemahaman mendalam",
                "Semua aspek di atas"
              ],
              correctIndex: 3
            };
          }
        }
      }

      if (hasIssues) {
        console.warn('Generated content had issues that were automatically fixed');
      }

    } catch (parseErr) {
      console.error('Failed to parse JSON from AI:', { cleaned, sanitized, parseErr });
      return NextResponse.json(
        { error: 'Invalid JSON from AI' },
        { status: 500 }
      );
    }

    // Save to cache for next time. `courseId` is always present (required by
    // the schema), so the outer guard just checks that parsed `data` exists.
    if (data) {
      try {
        // Use adminDb for elevated (service-role) database access
        const { adminDb } = await import('@/lib/database');

        const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, subtopic);
        const { data: existingCache } = await adminDb
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .maybeSingle();
        const mergedCacheContent = mergeSubtopicCacheContent(
          existingCache?.content ?? null,
          data as Record<string, unknown>,
        );
        const { error: cacheError } = await adminDb
          .from('subtopic_cache')
          .upsert(
            {
              cache_key: cacheKey,
              content: mergedCacheContent,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'cache_key' },
          );

        if (cacheError) {
          console.warn('[GenerateSubtopic] Cache upsert failed:', cacheError);
        } else {
          console.log('[GenerateSubtopic] Subtopic data cached successfully');
        }

        // Also save quiz questions to database for proper data structure
        if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
          try {
            // Find subtopic record — try direct title match first (fast), then fallback to scan
            let subtopicData = null;

            // Attempt 1: Direct match by module title (case-insensitive, trimmed)
            const trimmedModuleTitle = moduleTitle?.trim() ?? '';
            const trimmedSubtopicLabel = subtopic?.trim() ?? '';

            const { data: directMatch } = trimmedModuleTitle
              ? await adminDb
                  .from('subtopics')
                  .select('id, title, content')
                  .eq('course_id', courseId)
                  .ilike('title', trimmedModuleTitle)
                  .maybeSingle()
              : { data: null };

            if (directMatch) {
              subtopicData = directMatch;
            } else {
              // Attempt 2: Direct match by subtopic title (case-insensitive, trimmed)
              const { data: fallbackMatch } = trimmedSubtopicLabel
                ? await adminDb
                    .from('subtopics')
                    .select('id, title, content')
                    .eq('course_id', courseId)
                    .ilike('title', trimmedSubtopicLabel)
                    .maybeSingle()
                : { data: null };

              if (fallbackMatch) {
                subtopicData = fallbackMatch;
              } else {
                // Attempt 3: Scan content JSON (last resort for mismatched titles)
                const { data: allSubtopics } = await adminDb
                  .from('subtopics')
                  .select('id, title, content')
                  .eq('course_id', courseId);

                if (allSubtopics && Array.isArray(allSubtopics)) {
                  for (const sub of allSubtopics) {
                    try {
                      const parsedContent = JSON.parse(sub.content);
                      if (parsedContent.module === moduleTitle) {
                        subtopicData = sub;
                        break;
                      }
                    } catch {
                      // Skip unparseable entries
                    }
                  }
                }
              }
            }

            const moduleRecord = subtopicData;

            const localSubtopicId = subtopicData?.id;

            // Always attempt quiz sync — syncQuizQuestions has its own
            // resilient subtopic lookup (resolveSubtopic), so we must not
            // skip it when the inline lookup above missed. Otherwise the
            // `quiz` table stays empty and first-attempt submits fail with
            // "Pertanyaan kuis tidak ditemukan di database", causing the
            // submit to silently fail and the user's results to vanish on
            // re-entry to the quiz page.
            const syncResult = await syncQuizQuestions({
              adminDb,
              courseId,
              moduleTitle,
              subtopicTitle: subtopic,
              quizItems: data.quiz,
              subtopicId: localSubtopicId,
              subtopicData: subtopicData ?? undefined,
            });

            const resolvedSubtopicId = localSubtopicId ?? syncResult?.resolvedSubtopicId ?? null;

            // Hard fail when quiz seeding fails. Previously this merely
            // logged a warning, which let the response succeed even though
            // the next page load would hit "Pertanyaan kuis tidak ditemukan".
            // `insertedCount === 0` covers both "sanitized payload empty"
            // and "DB insert errored" branches in quiz-sync.
            if (!syncResult || syncResult.insertedCount === 0) {
              console.error('[GenerateSubtopic] Quiz seeding failed — failing request', {
                courseId,
                moduleTitle,
                subtopic,
                syncResult,
              });
              return NextResponse.json(
                { error: 'Failed to seed quiz' },
                { status: 500 },
              );
            }

            if (!resolvedSubtopicId) {
              console.warn('Subtopic not found for quiz saving:', {
                courseId,
                moduleTitle,
                subtopic,
              });
            }

            if (resolvedSubtopicId) {
              // Defer discussion template generation to after response is sent
              // This prevents Vercel timeout since these OpenAI calls can take 15-30s
              after(async () => {
                try {
                  const { adminDb: bgAdminDb } = await import('@/lib/database');
                  const templateResult = await generateDiscussionTemplate({
                    courseId,
                    subtopicId: resolvedSubtopicId,
                    moduleTitle,
                    subtopicTitle: subtopic,
                    learningObjectives: Array.isArray(data.objectives) ? data.objectives : [],
                    summary: buildDiscussionSummary(data),
                    keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways : [],
                    misconceptions: extractMisconceptions(data),
                    generationMode: 'ai_initial',
                    generationTrigger: 'generate_subtopic_background',
                  });

                  if (templateResult) {
                    console.log('[GenerateSubtopic] Discussion template stored (background)', {
                      subtopicId: resolvedSubtopicId,
                      templateId: templateResult.templateId,
                      version: templateResult.templateVersion,
                    });
                  } else {
                    console.warn('[GenerateSubtopic] Discussion template generation skipped');
                  }

                  if (
                    moduleRecord?.id &&
                    courseId &&
                    isDiscussionLabel(subtopic)
                  ) {
                    const moduleContext = await assembleModuleDiscussionContext({
                      adminDb: bgAdminDb,
                      courseId,
                      moduleTitle,
                      moduleRecord,
                    });

                    if (moduleContext) {
                      const moduleTemplateResult = await generateModuleDiscussionTemplate({
                        courseId,
                        subtopicId: moduleContext.moduleId,
                        moduleTitle,
                        summary: moduleContext.summary,
                        learningObjectives: moduleContext.learningObjectives,
                        keyTakeaways: moduleContext.keyTakeaways,
                        misconceptions: moduleContext.misconceptions,
                        subtopics: moduleContext.subtopics,
                        generationMode: 'ai_initial',
                        generationTrigger: 'generate_subtopic_module_background',
                      });

                      if (moduleTemplateResult) {
                        console.log('[GenerateSubtopic] Module-level discussion template stored (background)', {
                          moduleId: moduleContext.moduleId,
                          templateId: moduleTemplateResult.templateId,
                          version: moduleTemplateResult.templateVersion,
                        });
                      }
                    }
                  }
                } catch (discussionError) {
                  console.error('[GenerateSubtopic] Background discussion template generation failed', discussionError);
                }
              });
            }
          } catch (quizSaveError) {
            console.error('[GenerateSubtopic] Quiz database save failed', {
              error: quizSaveError,
              courseId,
              moduleTitle,
              subtopic,
            });
            return NextResponse.json(
              { error: 'Failed to seed quiz' },
              { status: 500 },
            );
          }
        }
      } catch (saveError) {
        // Don't fail the request if caching fails
        console.error('[GenerateSubtopic] Cache save failed', {
          error: saveError,
          courseId,
          moduleTitle,
          subtopic,
        });
      }
    }

    return NextResponse.json(
      sanitizeSubtopicContentForClient(data as Record<string, unknown>),
    );
  } catch (err: unknown) {
    console.error('Error generating subtopic:', err);
    return NextResponse.json(
      { error: 'Failed to generate subtopic' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, { label: 'generate-subtopic' });

function normalizeGateText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function coerceIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && String(parsed) === value.trim()) {
      return parsed;
    }
  }

  return null;
}

async function enforceSubtopicGenerationAccess(params: {
  userId: string;
  courseId: string;
  moduleId?: string | null;
  moduleTitle: string;
  subtopicTitle: string;
  moduleIndex?: unknown;
  subtopicIndex?: unknown;
}): Promise<NextResponse | null> {
  const requestedModuleIndex = coerceIndex(params.moduleIndex);
  const requestedSubtopicIndex = coerceIndex(params.subtopicIndex);
  const normalizedModuleTitle = normalizeGateText(params.moduleTitle);
  const normalizedSubtopicTitle = normalizeGateText(params.subtopicTitle);

  let progress;
  try {
    progress = await buildLearningProgressStatus({
      courseId: params.courseId,
      userId: params.userId,
    });
  } catch (progressError) {
    console.error('[GenerateSubtopic] Strict progress gate failed', {
      courseId: params.courseId,
      moduleTitle: params.moduleTitle,
      subtopicTitle: params.subtopicTitle,
      error: progressError,
    });
    return NextResponse.json(
      { error: 'Gagal memuat progres belajar. Coba lagi sebelum membuka materi.' },
      { status: 503 },
    );
  }

  const moduleStatus = progress.modules.find((candidate) => {
    if (params.moduleId && candidate.moduleId === params.moduleId) return true;
    if (requestedModuleIndex !== null && candidate.moduleIndex === requestedModuleIndex) return true;
    return normalizeGateText(candidate.title) === normalizedModuleTitle;
  });

  if (!moduleStatus) {
    return NextResponse.json(
      { error: 'Module tidak ditemukan dalam progres belajar' },
      { status: 404 },
    );
  }

  if (!moduleStatus.unlocked) {
    return NextResponse.json(
      { error: 'Modul sebelumnya perlu diselesaikan terlebih dahulu.' },
      { status: 403 },
    );
  }

  const subtopicStatus = moduleStatus.subtopics.find((candidate) => {
    if (requestedSubtopicIndex !== null && candidate.subtopicIndex === requestedSubtopicIndex) {
      return true;
    }
    return normalizeGateText(candidate.title) === normalizedSubtopicTitle;
  });

  if (!subtopicStatus) {
    return NextResponse.json(
      { error: 'Subtopic tidak ditemukan dalam progres belajar' },
      { status: 404 },
    );
  }

  if (!subtopicStatus.unlocked) {
    return NextResponse.json(
      {
        error:
          subtopicStatus.reason ||
          'Selesaikan generate materi, kuis, dan refleksi subtopic sebelumnya terlebih dahulu.',
      },
      { status: 403 },
    );
  }

  return null;
}

interface QuizItem {
  question?: string;
  options?: unknown[];
  correctIndex?: number;
}

// Delegates to src/lib/quiz-sync.ts — which now preserves old quiz rows
// when they are referenced by existing quiz_submissions (to keep the admin
// display's FK join intact). Returns the helper's result so callers can
// recover the resolved subtopic id even when the inline lookup missed.
async function syncQuizQuestions(params: {
  adminDb: typeof import('@/lib/database').adminDb;
  courseId?: string;
  moduleTitle?: string;
  subtopicTitle?: string;
  quizItems?: QuizItem[];
  subtopicId?: string;
  subtopicData?: { id?: string; title?: string; content?: string | null };
}) {
  try {
    return await syncQuizQuestionsHelper(params);
  } catch (err) {
    console.warn('[GenerateSubtopic] Sync quiz questions failed', err);
    return null;
  }
}

interface SubtopicContent {
  whatNext?: { summary?: string; encouragement?: string };
  keyTakeaways?: string[];
  objectives?: string[];
  pages?: Array<{ title?: string; paragraphs?: string[] }>;
  quiz?: QuizItem[];
  commonPitfalls?: string[];
  misconceptions?: string[];
  [key: string]: unknown;
}

function buildDiscussionSummary(content: SubtopicContent | null): string {
  const summaryParts: string[] = [];

  if (content?.whatNext?.summary) {
    summaryParts.push(content.whatNext.summary);
  }

  if (Array.isArray(content?.keyTakeaways) && content.keyTakeaways.length > 0) {
    summaryParts.push(
      'Key takeaways:\n' + content.keyTakeaways.map((item: string) => `- ${item}`).join('\n')
    );
  }

  if (Array.isArray(content?.objectives) && content.objectives.length > 0) {
    summaryParts.push(
      'Learning objectives:\n' + content.objectives.map((item: string) => `- ${item}`).join('\n')
    );
  }

  if (Array.isArray(content?.pages) && content.pages.length > 0) {
    const firstPage = content.pages[0];
    if (Array.isArray(firstPage?.paragraphs) && firstPage.paragraphs.length > 0) {
      summaryParts.push(firstPage.paragraphs[0]);
    }
  }

  return summaryParts.join('\n\n');
}

function extractMisconceptions(content: SubtopicContent | null): string[] {
  if (Array.isArray(content?.commonPitfalls) && content.commonPitfalls.length > 0) {
    return content.commonPitfalls;
  }

  return [];
}

function isDiscussionLabel(label: string): boolean {
  if (!label) return false;
  const normalized = label.toLowerCase();
  return normalized.includes('diskusi penutup') || normalized.includes('closing discussion');
}

type AdminDbType = typeof import('@/lib/database').adminDb;

interface ModuleDiscussionContextParams {
  adminDb: AdminDbType;
  courseId: string;
  moduleTitle: string;
  moduleRecord: { id?: string; title?: string; content?: string | null };
}

interface ModuleDiscussionContextResult {
  moduleId: string;
  summary: string;
  learningObjectives: string[];
  keyTakeaways: string[];
  misconceptions: string[];
  subtopics: Array<{
    title: string;
    summary: string;
    objectives: string[];
    keyTakeaways: string[];
    misconceptions: string[];
  }>;
}

async function assembleModuleDiscussionContext({
  adminDb,
  courseId,
  moduleTitle,
  moduleRecord,
}: ModuleDiscussionContextParams): Promise<ModuleDiscussionContextResult | null> {
  if (!moduleRecord?.id) {
    return null;
  }

  let outline: { subtopics?: Array<string | { title?: string; type?: string; isDiscussion?: boolean; overview?: string }> } | null = null;
  try {
    outline = moduleRecord.content ? JSON.parse(moduleRecord.content) : null;
  } catch (parseError) {
    console.warn('[GenerateSubtopic] Failed to parse module content for discussion aggregation', {
      courseId,
      moduleTitle,
      error: parseError,
    });
  }

  const moduleSubtopics = Array.isArray(outline?.subtopics) ? outline.subtopics : [];
  const aggregated: ModuleDiscussionContextResult['subtopics'] = [];
  const learningObjectives: string[] = [];
  const keyTakeaways: string[] = [];
  const misconceptions: string[] = [];

  for (const sub of moduleSubtopics) {
    const isDiscussion =
      typeof sub === 'object' &&
      (sub?.type === 'discussion' || sub?.isDiscussion === true || isDiscussionLabel(String(sub?.title ?? '')));
    if (isDiscussion) {
      continue;
    }

    const subtopicTitle =
      typeof sub === 'string'
        ? sub
        : typeof sub?.title === 'string'
          ? sub.title
          : '';

    if (!subtopicTitle) {
      continue;
    }

    const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, subtopicTitle);
    let cachedContent: SubtopicContent | null = null;

    try {
      const { data: cacheRow } = await adminDb
        .from('subtopic_cache')
        .select('content')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      cachedContent = (cacheRow?.content ?? null) as SubtopicContent | null;
    } catch (cacheError) {
      console.warn('[GenerateSubtopic] Failed to load cached content for module aggregation', {
        courseId,
        moduleTitle,
        subtopicTitle,
        error: cacheError,
      });
    }

    const objectives = Array.isArray(cachedContent?.objectives)
      ? cachedContent.objectives.filter((item: string) => typeof item === 'string' && item.trim())
      : [];
    const takeaways = Array.isArray(cachedContent?.keyTakeaways)
      ? cachedContent.keyTakeaways.filter((item: string) => typeof item === 'string' && item.trim())
      : [];
    const subMisconceptions = extractMisconceptions(cachedContent);
    const summaryText =
      buildDiscussionSummary(cachedContent) ||
      (typeof sub === 'object' && typeof sub.overview === 'string' ? sub.overview : '') ||
      objectives.join('; ');

    aggregated.push({
      title: subtopicTitle,
      summary: summaryText,
      objectives,
      keyTakeaways: takeaways,
      misconceptions: subMisconceptions,
    });

    pushUniqueRange(learningObjectives, objectives);
    pushUniqueRange(keyTakeaways, takeaways);
    pushUniqueRange(misconceptions, subMisconceptions);
  }

  if (!aggregated.length) {
    return null;
  }

  const summary = buildModuleSummary(moduleTitle, aggregated);

  return {
    moduleId: moduleRecord.id,
    summary,
    learningObjectives,
    keyTakeaways,
    misconceptions,
    subtopics: aggregated,
  };
}

function pushUniqueRange(target: string[], values: string[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !target.includes(value)) {
      target.push(value);
    }
  }
}

function buildModuleSummary(
  moduleTitle: string,
  subtopics: ModuleDiscussionContextResult['subtopics']
): string {
  const sections = subtopics.map((item, index) => {
    const lines: string[] = [`${index + 1}. ${item.title}`];
    if (item.summary) {
      lines.push(`Ringkasan: ${item.summary}`);
    }
    if (item.objectives.length) {
      lines.push('Tujuan utama:');
      lines.push(...item.objectives.map((goal) => `- ${goal}`));
    }
    if (item.keyTakeaways.length) {
      lines.push('Poin penting:');
      lines.push(...item.keyTakeaways.map((point) => `- ${point}`));
    }
    return lines.join('\n');
  });

  return [
    `Modul "${moduleTitle}" mencakup ${subtopics.length} subtopik utama dengan fokus berikut:`,
    ...sections,
  ].join('\n\n');
}

