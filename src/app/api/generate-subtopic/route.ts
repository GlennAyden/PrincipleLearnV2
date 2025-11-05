// src/app/api/generate-subtopic/route.ts

import { NextResponse } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { generateDiscussionTemplate, generateModuleDiscussionTemplate } from '@/services/discussion/generateDiscussionTemplate';

// OpenAI client and model are centralized in src/lib/openai

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const { module: moduleTitle, subtopic, courseId } = payload;
    if (!moduleTitle || !subtopic) {
      return NextResponse.json(
        { error: 'module and subtopic are required' },
        { status: 400 }
      );
    }

    let existingCacheContent: any = null;
    let computedCacheKey: string | null = null;
    // Database caching for performance optimization
    if (courseId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Check cache first
        const cacheKey = `${courseId}-${moduleTitle}-${subtopic}`;
        const { data: cached } = await supabase
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .single();

        if (cached?.content) {
          existingCacheContent = cached.content;
          console.log('[GenerateSubtopic] Returning cached subtopic data');
          try {
            await syncQuizQuestions({
              supabase,
              courseId,
              moduleTitle,
              subtopicTitle: subtopic,
              quizItems: cached.content?.quiz,
            });
          } catch (syncError) {
            console.warn('[GenerateSubtopic] Quiz sync from cache failed', syncError);
          }
          return NextResponse.json(cached.content);
        }

      } catch (cacheError) {
        // Continue with generation if cache fails
        console.warn('Cache read failed:', cacheError);
      }
    }

    // System prompt: content generation with dynamic language policy
    const systemMessage = {
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
    const userMessage = {
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

    const resp = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      messages: [systemMessage, userMessage],
      max_tokens: 4000,
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

    // Save to cache for next time
    if (courseId && data) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const cacheKey = `${courseId}-${moduleTitle}-${subtopic}`;
        await supabase
          .from('subtopic_cache')
          .upsert({
            cache_key: cacheKey,
            content: data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        console.log('💾 Subtopic data cached successfully');

        // Also save quiz questions to database for proper data structure
        if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
          try {
            // Find subtopic record by matching the module content, not the individual subtopic name
            const { data: allSubtopics } = await supabase
              .from('subtopics')
              .select('id, title, content')
              .eq('course_id', courseId);

            let subtopicData = null;
            
            // Find the subtopic that contains this module in its content
            if (allSubtopics) {
              for (const sub of allSubtopics) {
                try {
                  const parsedContent = JSON.parse(sub.content);
                  if (parsedContent.module === moduleTitle) {
                    subtopicData = sub;
                    break;
                  }
                } catch (parseError) {
                  // If content is not valid JSON, try direct title match
                  if (sub.title === moduleTitle) {
                    subtopicData = sub;
                    break;
                  }
                }
              }
            }

            const moduleRecord = subtopicData;

            // Fallback: try direct lookup by subtopic parameter
            if (!subtopicData) {
              const { data: fallbackData } = await supabase
                .from('subtopics')
                .select('id, title')
                .eq('course_id', courseId)
                .eq('title', subtopic)
                .single();
              subtopicData = fallbackData;
            }

            const subtopicId = subtopicData?.id;
            
            if (subtopicId) {
              await syncQuizQuestions({
                supabase,
                courseId,
                moduleTitle,
                subtopicTitle: subtopic,
                quizItems: data.quiz,
                subtopicId,
                subtopicData,
              });

              try {
                const templateResult = await generateDiscussionTemplate({
                  courseId,
                  subtopicId,
                  moduleTitle,
                  subtopicTitle: subtopic,
                  learningObjectives: Array.isArray(data.objectives) ? data.objectives : [],
                  summary: buildDiscussionSummary(data),
                  keyTakeaways: Array.isArray(data.keyTakeaways) ? data.keyTakeaways : [],
                  misconceptions: extractMisconceptions(data),
                });

              if (templateResult) {
                console.log('[GenerateSubtopic] Discussion template stored', {
                  subtopicId,
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
                try {
                  const moduleContext = await assembleModuleDiscussionContext({
                    supabase,
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
                    });

                    if (moduleTemplateResult) {
                      console.log('[GenerateSubtopic] Module-level discussion template stored', {
                        moduleId: moduleContext.moduleId,
                        templateId: moduleTemplateResult.templateId,
                        version: moduleTemplateResult.templateVersion,
                      });
                    } else {
                      console.warn('[GenerateSubtopic] Module-level discussion template generation skipped');
                    }
                  } else {
                    console.warn('[GenerateSubtopic] Module discussion context incomplete, skipping generation', {
                      courseId,
                      moduleTitle,
                    });
                  }
                } catch (moduleTemplateError) {
                  console.error('[GenerateSubtopic] Failed to generate module-level discussion template', moduleTemplateError);
                }
              }
            } catch (discussionError) {
              console.error('[GenerateSubtopic] Failed to generate discussion template', discussionError);
            }
          } else {
            console.warn('Subtopic not found for quiz saving:', { 
                courseId, 
                moduleTitle, 
                subtopic, 
                availableSubtopics: allSubtopics?.map(s => ({ id: s.id, title: s.title })) 
              });
            }
          } catch (quizSaveError) {
            console.warn('Quiz database save failed:', quizSaveError);
          }
        }
      } catch (saveError) {
        // Don't fail the request if caching fails
        console.warn('Cache save failed:', saveError);
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Error generating subtopic:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

interface SyncQuizParams {
  supabase: any;
  courseId?: string;
  moduleTitle?: string;
  subtopicTitle?: string;
  quizItems?: any[];
  subtopicId?: string;
  subtopicData?: { id?: string; title?: string; content?: string | null };
}

async function syncQuizQuestions({
  supabase,
  courseId,
  moduleTitle,
  subtopicTitle,
  quizItems,
  subtopicId,
  subtopicData,
}: SyncQuizParams) {
  try {
    if (!supabase || !courseId || !Array.isArray(quizItems) || quizItems.length === 0) {
      return;
    }

    let resolvedSubtopic = subtopicData ?? null;

    if (!resolvedSubtopic?.id) {
      try {
        const { data: allSubtopics, error: subtopicsError } = await supabase
          .from('subtopics')
          .select('id, title, content')
          .eq('course_id', courseId);

        if (subtopicsError) {
          console.warn('[GenerateSubtopic] Failed to load subtopics for quiz sync', subtopicsError);
        } else if (allSubtopics) {
          for (const sub of allSubtopics) {
            try {
              const parsed = sub?.content ? JSON.parse(sub.content) : null;
              if (parsed?.module && moduleTitle && parsed.module === moduleTitle) {
                resolvedSubtopic = sub;
                break;
              }
            } catch {
              // Fall back to direct title comparison if JSON parse fails
              if (moduleTitle && sub?.title === moduleTitle) {
                resolvedSubtopic = sub;
                break;
              }
            }
          }
        }

        if (!resolvedSubtopic && subtopicTitle) {
          const { data: fallbackSubtopic } = await supabase
            .from('subtopics')
            .select('id, title')
            .eq('course_id', courseId)
            .eq('title', subtopicTitle)
            .maybeSingle();

          if (fallbackSubtopic) {
            resolvedSubtopic = fallbackSubtopic;
          }
        }
      } catch (lookupError) {
        console.warn('[GenerateSubtopic] Subtopic lookup for quiz sync failed', lookupError);
      }
    }

    const resolvedSubtopicId = subtopicId ?? resolvedSubtopic?.id;
    if (!resolvedSubtopicId) {
      console.warn('[GenerateSubtopic] Unable to resolve subtopic for quiz persistence', {
        courseId,
        moduleTitle,
        subtopicTitle,
      });
      return;
    }

    const quizInserts = quizItems
      .map((q: any, index: number) => {
        if (!q || typeof q !== 'object') return null;

        const rawQuestion = typeof q.question === 'string' && q.question.trim().length > 0
          ? q.question.trim()
          : `Quiz ${index + 1}: Pertanyaan opsional`;

        const optionsArray = Array.isArray(q.options)
          ? q.options.map((opt: any) => (typeof opt === 'string' ? opt.trim() : `${opt}`)).filter(Boolean)
          : [];

        if (optionsArray.length < 4) {
          while (optionsArray.length < 4) {
            optionsArray.push(`Opsi ${optionsArray.length + 1}`);
          }
        } else if (optionsArray.length > 4) {
          optionsArray.length = 4;
        }

        const candidateIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
        const boundedIndex =
          candidateIndex >= 0 && candidateIndex < optionsArray.length ? candidateIndex : 0;
        const correctAnswer = optionsArray[boundedIndex] ?? optionsArray[0] ?? '';

        return {
          course_id: courseId,
          subtopic_id: resolvedSubtopicId,
          question: rawQuestion,
          options: optionsArray,
          correct_answer: correctAnswer,
          explanation: correctAnswer ? `The correct answer is: ${correctAnswer}` : null,
          created_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (quizInserts.length === 0) {
      console.warn('[GenerateSubtopic] Quiz sync skipped because sanitized quiz data is empty');
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('quiz')
        .delete()
        .eq('course_id', courseId)
        .eq('subtopic_id', resolvedSubtopicId);

      if (deleteError) {
        console.warn('[GenerateSubtopic] Failed to clean existing quiz entries', deleteError);
      }
    } catch (cleanupError) {
      console.warn('[GenerateSubtopic] Quiz cleanup threw unexpectedly', cleanupError);
    }

    const { error: insertError } = await supabase.from('quiz').insert(quizInserts);

    if (insertError) {
      console.warn('[GenerateSubtopic] Quiz insert failed', insertError);
    } else {
      console.log('[GenerateSubtopic] Quiz questions synced to database', {
        courseId,
        subtopicId: resolvedSubtopicId,
        count: quizInserts.length,
      });
    }
  } catch (quizSyncError) {
    console.warn('[GenerateSubtopic] Sync quiz questions failed', quizSyncError);
  }
}

function buildDiscussionSummary(content: any): string {
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

function extractMisconceptions(content: any): string[] {
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

interface ModuleDiscussionContextParams {
  supabase: any;
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
  supabase,
  courseId,
  moduleTitle,
  moduleRecord,
}: ModuleDiscussionContextParams): Promise<ModuleDiscussionContextResult | null> {
  if (!moduleRecord?.id) {
    return null;
  }

  let outline: any = null;
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

    const cacheKey = `${courseId}-${moduleTitle}-${subtopicTitle}`;
    let cachedContent: any = null;

    try {
      const { data: cacheRow } = await supabase
        .from('subtopic_cache')
        .select('content')
        .eq('cache_key', cacheKey)
        .single();
      cachedContent = cacheRow?.content ?? null;
    } catch (cacheError) {
      console.warn('[GenerateSubtopic] Failed to load cached content for module aggregation', {
        courseId,
        moduleTitle,
        subtopicTitle,
        error: cacheError,
      });
    }

    const objectives = Array.isArray(cachedContent?.objectives)
      ? cachedContent.objectives.filter((item: any) => typeof item === 'string' && item.trim())
      : [];
    const takeaways = Array.isArray(cachedContent?.keyTakeaways)
      ? cachedContent.keyTakeaways.filter((item: any) => typeof item === 'string' && item.trim())
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

