// src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch, readStream } from '@/lib/api-client';
import AnswerList from '@/components/AskQuestion/AnswerList';
import ChallengeBox from '@/components/ChallengeThinking/ChallengeBox';
import FeedbackList from '@/components/ChallengeThinking/FeedbackList';
import ExampleList from '@/components/Examples/ExampleList';
import KeyTakeaways from '@/components/KeyTakeaways/KeyTakeaways';
import WhatNext from '@/components/WhatNext/WhatNext';
import NextSubtopics from '@/components/NextSubtopics/NextSubtopics';
import AILoadingIndicator from '@/components/AILoadingIndicator/AILoadingIndicator';
import styles from './page.module.scss';

// Dynamic imports for heavy interactive components
const Quiz = dynamic(() => import('@/components/Quiz/Quiz'));
const QuestionBox = dynamic(() => import('@/components/AskQuestion/QuestionBox'));
const StructuredReflection = dynamic(() => import('@/components/StructuredReflection/StructuredReflection'));
const PromptTimeline = dynamic(() => import('@/components/PromptTimeline/PromptTimeline'));

interface SubtopicResponse {
  objectives: string[];
  pages: { title: string; paragraphs: string[] }[];
  keyTakeaways: string[];
  quiz: { question: string; options: string[]; correctIndex: number }[];
  whatNext: { summary: string; encouragement: string };
}

// Challenge history item interface
interface ChallengeItem {
  question: string;
  answer: string;
  feedback?: string;
  reasoningNote?: string;
}

interface SubtopicOutlineItem {
  title: string;
  overview?: string;
  type?: string;
  isDiscussion?: boolean;
}

interface ModuleOutline {
  id: string;
  rawTitle?: string;
  module: string;
  subtopics: (SubtopicOutlineItem | string)[];
}

interface CourseState {
  id: string;
  title: string;
  level: string;
  outline: ModuleOutline[];
  subtopicDetails?: Record<number, Record<number, SubtopicResponse>>;
}

// Skeleton loading component for subtopic content
const SkeletonLoading = () => {
  return (
    <div className={styles.skeletonContainer}>
      {/* Progress bar */}
      <div className={styles.progressBar}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className={`${styles.progressStep} ${i === 0 ? styles.activeStep : ''}`}
          />
        ))}
      </div>
      
      {/* Title skeleton */}
      <div className={styles.skeletonTitle}></div>
      
      {/* Content skeletons - updated to 5 paragraphs */}
      <div className={styles.skeletonContent}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={styles.skeletonParagraph}></div>
        ))}
      </div>
      
      {/* Interactive buttons skeleton */}
      <div className={styles.skeletonButtonsContainer}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={styles.skeletonButton}></div>
        ))}
      </div>
      
      {/* Navigation buttons */}
      <div className={styles.navigationButtons}>
        <div className={styles.skeletonNavButton}></div>
      </div>
    </div>
  );
};

export default function SubtopicPage() {
  const router = useRouter();
  const { user } = useAuth();
  // Cast params to ensure courseId, subIdx, pageIdx are strings
  const { courseId, subIdx: pathSubIdx, pageIdx: pathPageIdx } =
    useParams() as { courseId: string; subIdx: string; pageIdx: string };
  const searchParams = useSearchParams();

  // Parse numeric indices
  const moduleIndex = Number(pathSubIdx);
  const pageNumber = Number(pathPageIdx);
  const subtopicIndex = (() => {
    const s = searchParams.get('subIdx');
    return s !== null && !isNaN(Number(s)) ? Number(s) : 0;
  })();

  const keyBase = `pl-${user?.id ?? 'anon'}-${courseId}-${moduleIndex}-${subtopicIndex}-${pageNumber}`;
  const [, setSubtopicProgress] = useLocalStorage<Record<string, boolean>>(
    'pl_subtopic_generated',
    {}
  );
  const subtopicProgressKey = `${courseId}:${moduleIndex}:${subtopicIndex}`;

  const [askData, setAskData] = useSessionStorage<{ question: string; answer: string }[]>(
    `${keyBase}-ask`,
    []
  );

  // Session-scoped challenge history (cleared on tab close)
  const [challengeData, setChallengeData] = useSessionStorage<ChallengeItem[]>(
    `${keyBase}-challenge-data`,
    []
  );
  const [challengeQ, setChallengeQ] = useState<string>('');
  const [challengeAnswer, setChallengeAnswer] = useState<string>('');
  const [challengeReasoning, setChallengeReasoning] = useState<string>('');
  const [activeChallengeIndex, setActiveChallengeIndex] = useState<number>(-1);

  const [examplesData, setExamplesData] = useSessionStorage<string[]>(
    `${keyBase}-examples`,
    []
  );
  // Default to the most-recent example so re-landing on the tab shows the
  // newest generation, not the oldest.
  const [activeExampleIndex, setActiveExampleIndex] = useState<number>(() =>
    examplesData.length > 0 ? examplesData.length - 1 : 0
  );
  const [examplesError, setExamplesError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'ask' | 'challenge' | 'examples' | null>(
    null
  );
  
  const [loadingChallenge, setLoadingChallenge] = useState<boolean>(false);
  const [loadingExamples, setLoadingExamples] = useState(false);

  const [course, setCourse] = useState<CourseState | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [data, setData] = useState<SubtopicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Quiz: status + reshuffle
  interface QuizStatus {
    completed: boolean;
    attemptCount: number;
    latest: {
      attemptNumber: number;
      quizAttemptId: string;
      score: number;
      correctCount: number;
      totalQuestions: number;
      submittedAt: string;
    } | null;
  }
  const [quizStatus, setQuizStatus] = useState<QuizStatus | null>(null);
  const [quizQuestionsOverride, setQuizQuestionsOverride] = useState<SubtopicResponse['quiz'] | null>(null);
  const [reshuffling, setReshuffling] = useState(false);

  const activeModule = course?.outline?.[moduleIndex];
  const activeSubtopic = activeModule?.subtopics?.[subtopicIndex];
  const quizModuleTitle =
    typeof activeModule?.module === 'string'
      ? activeModule.module
      : activeModule?.rawTitle ?? `Module ${moduleIndex + 1}`;
  const quizSubtopicTitle =
    typeof activeSubtopic === 'string'
      ? activeSubtopic
      : activeSubtopic?.title ?? `Subtopic ${subtopicIndex + 1}`;

  // Load course data — check sessionStorage first to avoid sequential fetch
  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;

      // Try sessionStorage cache first (instant, avoids API roundtrip on navigation)
      const cacheKey = `pl_course_${courseId}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as CourseState;
          if (parsed?.outline?.length) {
            setCourse(parsed);
            setCourseLoading(false);
            return;
          }
        }
      } catch {
        // Ignore parse errors, proceed with API fetch
      }

      setCourseLoading(true);

      try {
        const response = await apiFetch(`/api/courses/${courseId}`);
        const result = await response.json();

        if (result.success && result.course) {
          // Transform subtopics to outline format
          const outline = result.course.subtopics?.map((subtopic: { id?: string; title?: string; content: string }, index: number) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch {
              content = { module: subtopic.title, subtopics: [] };
            }

            return {
              id: String(subtopic.id ?? `module-${index}`),
              rawTitle: subtopic.title ?? undefined,
              module: content.module || subtopic.title || 'Module',
              subtopics: content.subtopics || []
            };
          }) || [];

          const courseData: CourseState = {
            id: result.course.id,
            title: result.course.title,
            level: result.course.difficulty_level || 'Beginner',
            outline
          };

          setCourse(courseData);

          // Save to sessionStorage (without subtopicDetails to keep it small)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(courseData));
          } catch {
            // sessionStorage full — ignore
          }
        }
      } catch (error) {
        console.error('[Subtopic] Error loading course:', error);
        setError('Failed to load course data');
      } finally {
        setCourseLoading(false);
      }
    }

    loadCourse();
  }, [courseId]);

  useEffect(() => {
    if (!course?.outline) return;
    const moduleInfo = course.outline[moduleIndex];
    const subInfo = moduleInfo?.subtopics?.[subtopicIndex];
    if (!moduleInfo || !subInfo) {
      setError('Invalid module or subtopic');
      return;
    }
    const moduleTitle = moduleInfo.module;
    const subTitle = typeof subInfo === 'string' ? subInfo : subInfo.title;
    const cached =
      course?.subtopicDetails?.[moduleIndex]?.[subtopicIndex] ?? null;
    if (cached) {
      setData(cached);
      setSubtopicProgress((prev) => {
        if (prev && prev[subtopicProgressKey]) {
          return prev;
        }
        return { ...(prev ?? {}), [subtopicProgressKey]: true };
      });
      return;
    }

    async function loadSubtopic() {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/api/generate-subtopic', {
          method: 'POST',
          body: JSON.stringify({
            module: moduleTitle,
            subtopic: subTitle,
            courseId: courseId
          }),
        });
        if (res.status === 403) {
          setError('Anda tidak memiliki akses ke subtopic ini');
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setError('Course atau subtopic tidak ditemukan');
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to load subtopic');
        const json = (await res.json()) as SubtopicResponse;
        setData(json);

        // Cache the generated content in course state
        if (course) {
          const updated: CourseState = {
            ...course,
            subtopicDetails: {
              ...course.subtopicDetails,
              [moduleIndex]: {
                ...course.subtopicDetails?.[moduleIndex],
                [subtopicIndex]: json,
              },
            },
          };
          setCourse(updated);
        }
        setSubtopicProgress((prev) => {
          if (prev && prev[subtopicProgressKey]) {
            return prev;
          }
          return { ...(prev ?? {}), [subtopicProgressKey]: true };
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadSubtopic();

  }, [course, moduleIndex, subtopicIndex, courseId, subtopicProgressKey]);

  // Background preload adjacent subtopics for faster navigation
  useEffect(() => {
    if (!data || !course?.outline) return;

    const currentModule = course.outline[moduleIndex];
    const prefetchTargets: { module: string; subtopic: string }[] = [];

    // Preload next subtopic in same module
    const nextSubIdx = subtopicIndex + 1;
    if (currentModule?.subtopics?.[nextSubIdx]) {
      const sub = currentModule.subtopics[nextSubIdx];
      prefetchTargets.push({
        module: currentModule.module,
        subtopic: typeof sub === 'string' ? sub : sub.title,
      });
    }

    // If last subtopic in module, preload first subtopic of next module
    if (!currentModule?.subtopics?.[nextSubIdx]) {
      const nextModule = course.outline[moduleIndex + 1];
      if (nextModule?.subtopics?.[0]) {
        const sub = nextModule.subtopics[0];
        prefetchTargets.push({
          module: nextModule.module,
          subtopic: typeof sub === 'string' ? sub : sub.title,
        });
      }
    }

    if (prefetchTargets.length === 0) return;

    // Short delay to let current render settle, then prefetch
    const timer = setTimeout(() => {
      prefetchTargets.forEach((target) => {
        apiFetch('/api/generate-subtopic', {
          method: 'POST',
          body: JSON.stringify({ ...target, courseId }),
        }).catch(() => {});
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [data, course, moduleIndex, subtopicIndex, courseId]);

  // Initialize challenge question when opening the tab
  useEffect(() => {
    if (activeTab === 'challenge' && challengeData.length === 0 && !challengeQ) {
      fetchChallengeQ();
    }
  }, [activeTab]);

  // Load challenge history from database on initial render
  useEffect(() => {
    async function loadChallengeHistory() {
      if (!user?.id) return;

      try {
        const response = await apiFetch(
          `/api/challenge-response?userId=${encodeURIComponent(user.id)}&courseId=${courseId}&moduleIndex=${moduleIndex}&subtopicIndex=${subtopicIndex}&pageNumber=${pageNumber}`
        );
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.responses) {
            // Transform API response to match component format
            const transformedData = result.responses.map((resp: { question: string; answer: string; feedback?: string; reasoning_note?: string }) => ({
              question: resp.question,
              answer: resp.answer,
              feedback: resp.feedback,
              reasoningNote: resp.reasoning_note || ''
            }));
            setChallengeData(transformedData);
          }
        }
      } catch (error) {
        console.error('Error loading challenge history from database:', error);
        // Intentionally do NOT wipe sessionStorage on transient errors —
        // that would destroy any in-session progress the user just made.
      }
    }

    loadChallengeHistory();
  }, [user?.id, courseId, moduleIndex, subtopicIndex, pageNumber]);

  // Load ask-question history from database on initial render so prior
  // conversations restore after refresh / new session (parallels challenge).
  useEffect(() => {
    async function loadAskHistory() {
      if (!user?.id) return;
      try {
        const response = await apiFetch(
          `/api/ask-question?userId=${encodeURIComponent(user.id)}&courseId=${courseId}&moduleIndex=${moduleIndex}&subtopicIndex=${subtopicIndex}&pageNumber=${pageNumber}`
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.responses) && result.responses.length > 0) {
            const transformed = result.responses.map((r: { question: string; answer: string }) => ({
              question: r.question,
              answer: r.answer,
            }));
            setAskData(transformed);
          }
        }
      } catch (err) {
        console.error('Error loading ask-question history from database:', err);
        // Intentionally do NOT wipe sessionStorage on transient errors.
      }
    }
    loadAskHistory();
  }, [user?.id, courseId, moduleIndex, subtopicIndex, pageNumber]);

  // Load quiz completion status whenever the user/course/subtopic changes.
  // Runs independently of `data` loading so that navigating back to the quiz
  // page immediately re-fetches prior attempts (mirrors loadAskHistory).
  useEffect(() => {
    async function loadQuizStatus() {
      if (!user?.id || !courseId || !quizSubtopicTitle) return;

      try {
        // Pass moduleTitle too — `subtopics` table is keyed per module, so
        // without it the server falls back to subtopicTitle-only lookup and
        // fails on any mismatch.
        const params = new URLSearchParams({
          courseId,
          subtopicTitle: quizSubtopicTitle,
        });
        if (quizModuleTitle) params.set('moduleTitle', quizModuleTitle);

        const response = await apiFetch(`/api/quiz/status?${params.toString()}`);
        if (response.ok) {
          const result = await response.json();
          setQuizStatus(result);
        }
      } catch (err) {
        console.warn('Failed to load quiz status:', err);
      }
    }
    loadQuizStatus();
  }, [user?.id, courseId, quizSubtopicTitle, quizModuleTitle]);

  // Reshuffle: generate new quiz questions for this subtopic
  const handleQuizReshuffle = useCallback(async () => {
    if (!courseId || !quizModuleTitle || !quizSubtopicTitle) return;
    setReshuffling(true);
    try {
      const response = await apiFetch('/api/quiz/regenerate', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          moduleTitle: quizModuleTitle,
          subtopicTitle: quizSubtopicTitle,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal membuat kuis baru');
      }
      const result = await response.json();
      if (Array.isArray(result.quiz) && result.quiz.length > 0) {
        setQuizQuestionsOverride(result.quiz);
        // Reset status so Quiz component exits the summary view and shows
        // the fresh interactive quiz.
        setQuizStatus(null);
      }
    } catch (err) {
      console.error('Quiz reshuffle failed:', err);
      if (typeof window !== 'undefined') {
        window.alert(err instanceof Error ? err.message : 'Gagal membuat kuis baru');
      }
    } finally {
      setReshuffling(false);
    }
  }, [courseId, quizModuleTitle, quizSubtopicTitle]);

  if (courseLoading) return <div className={styles.loading}>Memuat kursus…</div>;
  if (!course) return <div className={styles.error}>Kursus tidak ditemukan</div>;
  if (loading && !data) return <SkeletonLoading />;
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!data) return <div className={styles.error}>Konten tidak tersedia.</div>;

  const contentCount = data.pages.length;
  const feedbackStep = contentCount + 2;

  const goNext = () => {
    if (pageNumber < feedbackStep) {
      router.push(
        `/course/${courseId}/subtopic/${moduleIndex}/${pageNumber + 1}?module=${moduleIndex}&subIdx=${subtopicIndex}`
      );
    } else {
      router.push(`/course/${courseId}?module=${moduleIndex}`);
    }
  };
  const goBack = () => {
    if (pageNumber > 0) {
      router.push(
        `/course/${courseId}/subtopic/${moduleIndex}/${pageNumber - 1}?module=${moduleIndex}&subIdx=${subtopicIndex}`
      );
    }
  };

  // Function to select a challenge from history
  const selectChallengeItem = (index: number) => {
    setActiveChallengeIndex(index);
    // Clear the current challenge if viewing history
    setChallengeQ('');
    setChallengeAnswer('');
    setChallengeReasoning('');
  };

  // Generate a challenge question
  const fetchChallengeQ = async () => {
    setLoadingChallenge(true);
    setChallengeQ('');
    setChallengeAnswer('');
    setChallengeReasoning('');
    setActiveChallengeIndex(-1);

    try {
      const response = await apiFetch('/api/challenge-thinking', {
        method: 'POST',
        body: JSON.stringify({
          context: data.pages[pageNumber].paragraphs.join(' '),
          level: course.level || 'intermediate',
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch challenge question');

      // /api/challenge-thinking always streams text/plain; no JSON fallback.
      if (response.body) {
        await readStream(response, setChallengeQ);
      }
    } catch (error) {
      console.error('Error fetching challenge question:', error);
    } finally {
      setLoadingChallenge(false);
    }
  };

  // Handle challenge answer submission
  const handleChallengeSubmit = async () => {
    if (!challengeAnswer.trim() || !challengeQ || loadingChallenge) return;
    if (!user?.id) {
      console.warn('Challenge submission skipped: missing user ID');
      return;
    }
    
    setLoadingChallenge(true);
    
    try {
      const response = await apiFetch('/api/challenge-feedback', {
        method: 'POST',
        body: JSON.stringify({
          question: challengeQ,
          answer: challengeAnswer,
          context: data.pages[pageNumber].paragraphs.join(' '),
          level: course.level || 'intermediate',
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get feedback');

      const responseData = await response.json();

      // Save to challenge history in state
      const newChallengeItem = {
        question: challengeQ,
        answer: challengeAnswer,
        feedback: responseData.feedback,
        reasoningNote: challengeReasoning.trim()
      };
      const newChallengeData = [...challengeData, newChallengeItem];
      setChallengeData(newChallengeData);
      
      // Save to database via API
      try {
        const saveResponse = await apiFetch('/api/challenge-response', {
          method: 'POST',
          body: JSON.stringify({
            userId: user?.id,
            courseId: courseId,
            moduleIndex: moduleIndex,
            subtopicIndex: subtopicIndex,
            pageNumber: pageNumber,
            question: challengeQ,
            answer: challengeAnswer,
            feedback: responseData.feedback,
            reasoningNote: challengeReasoning.trim()
          })
        });

        if (!saveResponse.ok) {
          const errorDetails = await saveResponse.json().catch(() => ({}));
          console.error('Failed to persist challenge response:', errorDetails);
        }
      } catch (saveError) {
        console.error('Error saving challenge to database:', saveError);
        // Continue execution even if save fails
      }
    } catch (error) {
      console.error('Error submitting challenge:', error);
    } finally {
      setLoadingChallenge(false);
    }
  };

  const fetchExamples = async () => {
    setLoadingExamples(true);
    setExamplesError(null);
    try {
      const res = await apiFetch('/api/generate-examples', {
        method: 'POST',
        body: JSON.stringify({
          context: data.pages[pageNumber].paragraphs.join(' '),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Request failed with status ${res.status}`);
      }
      const data2 = await res.json();
      if (!Array.isArray(data2?.examples)) {
        throw new Error('Invalid examples response format');
      }
      const examples = data2.examples as string[];

      // Add new example to history and set it as active
      const updatedExamples = [...examplesData, ...examples];
      setExamplesData(updatedExamples);
      setActiveExampleIndex(updatedExamples.length - 1); // Select the newest example
    } catch (e: unknown) {
      console.error(e);
      setExamplesError(
        'Gagal generate contoh: ' + (e instanceof Error ? e.message : 'Unknown error')
      );
    } finally {
      setLoadingExamples(false);
    }
  };

  // Function to navigate to the next example in history
  const nextExample = () => {
    if (examplesData.length > 1 && activeExampleIndex < examplesData.length - 1) {
      setActiveExampleIndex(activeExampleIndex + 1);
    }
  };

  // Function to navigate to the previous example in history
  const prevExample = () => {
    if (examplesData.length > 1 && activeExampleIndex > 0) {
      setActiveExampleIndex(activeExampleIndex - 1);
    }
  };

  return (
    <>
      {/* Progress */}
      <div className={styles.progressBar}>
        {Array.from({ length: contentCount + 3 }).map((_, i) => (
          <span
            key={i}
            className={`${styles.progressStep} ${i <= pageNumber ? styles.activeStep : ''}`}
          />
        ))}
      </div>

      {/* Materi */}
      {pageNumber < contentCount && (
        <>
          <h2 className={styles.topicTitle}>{data.pages[pageNumber].title}</h2>
          {data.pages[pageNumber].paragraphs.map((p, idx) => (
            <p key={idx} className={styles.pageParagraph}>
              {p}
            </p>
          ))}

          {/* Interaktif */}
          {activeTab === null ? (
            <div className={styles.initialButtons}>
              <button className={styles.initialBtn} onClick={() => setActiveTab('ask')}>
                Tanya Pertanyaan
              </button>
              <button
                className={styles.initialBtn}
                onClick={() => {
                  setActiveTab('challenge');
                  if (!challengeQ) fetchChallengeQ();
                }}
              >
                Tantang Pemikiranku
              </button>
              <button
                className={styles.initialBtn}
                onClick={() => {
                  setActiveTab('examples');
                  if (!examplesData.length) fetchExamples();
                }}
              >
                Beri Contoh
              </button>
            </div>
          ) : (
            <div className={styles.cardContainer}>
              <button className={styles.closeBtn} onClick={() => setActiveTab(null)}>
                ×
              </button>
              <div className={styles.tabNav}>
                <button
                  className={`${styles.tab} ${activeTab === 'ask' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('ask')}
                >
                  Tanya Pertanyaan
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'challenge' ? styles.activeTab : ''}`}
                  onClick={() => {
                    setActiveTab('challenge');
                    if (!challengeQ) fetchChallengeQ();
                  }}
                >
                  Tantang Pemikiranku
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'examples' ? styles.activeTab : ''}`}
                  onClick={() => {
                    setActiveTab('examples');
                    if (!examplesData.length) fetchExamples();
                  }}
                >
                  Beri Contoh
                </button>
              </div>
              <div className={styles.tabContent}>
                {activeTab === 'ask' && (
                  <>
                    {askData.length > 0 && <AnswerList qaList={askData} />}
                    <QuestionBox
                      context={data.pages[pageNumber].paragraphs.join(' ')}
                      onAnswer={(q, a) => setAskData([...askData, { question: q, answer: a }])}
                      courseId={courseId}
                      subtopic={`Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`}
                      moduleIndex={moduleIndex}
                      subtopicIndex={subtopicIndex}
                      pageNumber={pageNumber}
                    />
                    {/* Prompt Journey Timeline - show after asking questions */}
                    {user?.id && askData.length > 0 && (
                      <PromptTimeline userId={user.id} courseId={courseId} />
                    )}
                  </>
                )}
                {activeTab === 'challenge' && (
                  <>
                    {/* Show challenge history if available */}
                    {challengeData.length > 0 && (
                      <div className={styles.challengeHistory}>
                        <h3 className={styles.historyTitle}>Tantangan Sebelumnya:</h3>
                        <div className={styles.historyList}>
                          {challengeData.map((item, idx) => (
                            <div 
                              key={idx}
                              onClick={() => selectChallengeItem(idx)}
                              className={`${styles.historyItem} ${activeChallengeIndex === idx ? styles.activeHistoryItem : ''}`}
                            >
                              <div className={styles.historyQuestion}>
                                <span className={styles.historyNumber}>{idx + 1}</span>
                                <span className={styles.historyText}>{item.question}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* If a history item is selected, show its details */}
                    {activeChallengeIndex >= 0 && challengeData[activeChallengeIndex] && (
                      <div className={styles.challengeReview}>
                        <ChallengeBox question={challengeData[activeChallengeIndex].question} />
                        <div className={styles.challengeAnswer}>
                          <div className={styles.answerLabel}>Jawabanmu:</div>
                          <div className={styles.answerContent}>{challengeData[activeChallengeIndex].answer}</div>
                        </div>
                        {challengeData[activeChallengeIndex].feedback && (
                          <FeedbackList feedback={challengeData[activeChallengeIndex].feedback!} />
                        )}
                        {challengeData[activeChallengeIndex].reasoningNote && (
                          <div className={styles.challengeAnswer}>
                            <div className={styles.answerLabel}>Penalaranmu:</div>
                            <div className={styles.answerContent}>{challengeData[activeChallengeIndex].reasoningNote}</div>
                          </div>
                        )}
                        <button 
                          onClick={() => setActiveChallengeIndex(-1)} 
                          className={styles.newChallengeBtn}
                        >
                          Coba Tantangan Baru
                        </button>
                      </div>
                    )}
                    
                    {/* Show current challenge question if not viewing history */}
                    {activeChallengeIndex < 0 && (
                      <>
                        {challengeQ ? (
                          <>
                            <ChallengeBox question={challengeQ} />
                            <div className={styles.challengeActions}>
                              <button 
                                className={styles.regenerateBtn} 
                                onClick={fetchChallengeQ} 
                                disabled={loadingChallenge}
                                title="Buat pertanyaan tantangan baru"
                              >
                                {loadingChallenge ? (
                                  <span className={styles.loadingSpinner}></span>
                                ) : (
                                  <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Buat Ulang</span>
                                  </>
                                )}
                              </button>
                              <div className={styles.answerInputContainer}>
                                <input
                                  type="text"
                                  value={challengeAnswer}
                                  onChange={(e) => setChallengeAnswer(e.target.value)}
                                  placeholder="Ketik jawabanmu di sini..."
                                  className={styles.answerInput}
                                  disabled={loadingChallenge}
                                />
                                <input
                                  type="text"
                                  value={challengeReasoning}
                                  onChange={(e) => setChallengeReasoning(e.target.value)}
                                  placeholder="Mengapa kamu memilih jawaban ini? (opsional)"
                                  className={styles.answerInput}
                                  disabled={loadingChallenge}
                                />
                                <button 
                                  onClick={handleChallengeSubmit} 
                                  disabled={loadingChallenge || !challengeAnswer.trim()}
                                  className={styles.submitButton}
                                >
                                  Submit
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className={styles.loadingContainer}>
                            {loadingChallenge ? (
                              <AILoadingIndicator
                                messages={['Menyiapkan pertanyaan...', 'Menganalisis materi...', 'Hampir siap...']}
                              />
                            ) : (
                              <>
                                {challengeData.length > 0 ? (
                                  <button onClick={fetchChallengeQ} className={styles.startChallengeBtn}>
                                    Buat Pertanyaan Baru
                                  </button>
                                ) : (
                                  <button onClick={fetchChallengeQ} className={styles.startChallengeBtn}>
                                    Generate Pertanyaan
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {activeTab === 'examples' && (
                  <>
                    {examplesError && (
                      <div className={styles.examplesError} role="alert">
                        {examplesError}
                      </div>
                    )}
                    <ExampleList
                      examples={examplesData.length > 0 ? [examplesData[activeExampleIndex]] : []}
                      onRegenerate={fetchExamples}
                      isLoading={loadingExamples}
                      onPrev={examplesData.length > 1 && activeExampleIndex > 0 ? prevExample : undefined}
                      onNext={examplesData.length > 1 && activeExampleIndex < examplesData.length - 1 ? nextExample : undefined}
                      exampleNumber={activeExampleIndex + 1}
                      totalExamples={examplesData.length}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Key Takeaways Section */}
      {pageNumber === contentCount && (
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>💡 Poin Penting</h2>
            <p className={styles.sectionDescription}>
              Poin-poin penting yang perlu Anda ingat dari materi ini
            </p>
          </div>
          <KeyTakeaways items={data.keyTakeaways} />
        </div>
      )}

      {/* Quiz Time Section */}
      {pageNumber === contentCount + 1 && course?.outline && (
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>🧠 Waktu Kuis!</h2>
            <p className={styles.sectionDescription}>
              Uji pemahaman Anda tentang materi yang telah dipelajari
            </p>
          </div>
          <Quiz
            questions={quizQuestionsOverride ?? data.quiz}
            courseId={courseId}
            moduleTitle={quizModuleTitle}
            subtopic={`Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`}
            subtopicTitle={quizSubtopicTitle}
            moduleIndex={moduleIndex}
            subtopicIndex={subtopicIndex}
            completedState={
              quizStatus?.completed && quizStatus.latest && !quizQuestionsOverride
                ? { attemptCount: quizStatus.attemptCount, latest: quizStatus.latest }
                : null
            }
            onReshuffle={handleQuizReshuffle}
            reshuffling={reshuffling}
          />
        </div>
      )}

      {/* Feedback & Next Steps Section */}
      {pageNumber === contentCount + 2 && (
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>📝 Umpan Balik & Langkah Selanjutnya</h2>
            <p className={styles.sectionDescription}>
              Berikan masukan dan lihat langkah selanjutnya dalam pembelajaran Anda
            </p>
          </div>
          <WhatNext
            summary={data.whatNext.summary}
            encouragement={data.whatNext.encouragement}
          />
          {/* Structured Reflection + Content Feedback (merged) */}
          <StructuredReflection
            courseId={courseId}
            subtopic={`Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`}
            moduleIndex={moduleIndex}
            subtopicIndex={subtopicIndex}
          />
          <NextSubtopics 
            items={course.outline[moduleIndex].subtopics} 
            moduleIndex={moduleIndex}
            moduleId={course.outline[moduleIndex].id}
            moduleTitle={
              typeof course.outline[moduleIndex].module === 'string'
                ? course.outline[moduleIndex].module
                : undefined
            }
          />
          </div>
      )}

      {/* Navigation */}
      <div className={styles.navigationButtons}>
        {pageNumber > 0 && (
          <button className={styles.backBtn} onClick={goBack}>
            Kembali
          </button>
        )}
        <button className={styles.nextBtn} onClick={goNext}>
          {pageNumber === feedbackStep ? 'Selesai' : 'Selanjutnya'}
        </button>
      </div>
    </>
  );
}
