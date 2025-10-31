'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import styles from './page.module.scss';

type OutlineSubtopic = {
  title: string;
  overview?: string;
  type?: string;
  isDiscussion?: boolean;
};

type OutlineModule = {
  id: string;
  rawTitle?: string;
  module: string;
  subtopics: (OutlineSubtopic | string)[];
};

interface CourseData {
  title: string;
  outline: OutlineModule[];
}

interface DiscussionGoal {
  id: string;
  description: string;
  covered: boolean;
  rubric?: any;
}

interface DiscussionSession {
  id: string;
  status: 'in_progress' | 'completed';
  phase: string;
  learningGoals: DiscussionGoal[];
}

interface DiscussionMessage {
  id?: string;
  role: 'agent' | 'student';
  content: string;
  created_at?: string;
  metadata?: {
    phase?: string;
    type?: string;
    expected_type?: string;
    options?: string[];
    [key: string]: any;
  };
  step_key?: string;
}

interface DiscussionStep {
  key: string;
  prompt: string;
  expected_type?: string;
  options?: string[];
  phase?: string;
}

interface ModulePrerequisiteDetails {
  ready: boolean;
  summary: {
    expectedSubtopics: number;
    generatedSubtopics: number;
    totalQuizQuestions: number;
    answeredQuizQuestions: number;
  };
  subtopics: Array<{
    key: string;
    title: string;
    generated: boolean;
    quizQuestionCount: number;
    quizCompleted: boolean;
    missingQuestions: string[];
  }>;
}

const PHASE_SEQUENCE = ['diagnosis', 'exploration', 'practice', 'synthesis'];

const PHASE_LABELS: Record<string, string> = {
  diagnosis: 'Diagnosis',
  exploration: 'Penjelasan',
  explanation: 'Penjelasan',
  practice: 'Latihan',
  synthesis: 'Konsolidasi',
  consolidation: 'Konsolidasi',
  completed: 'Selesai',
};

function normalizePhase(phase?: string) {
  if (!phase) return '';
  return phase.toLowerCase();
}

function getPhaseLabel(phase?: string) {
  if (!phase) return 'Belum Mulai';
  const normalized = normalizePhase(phase);
  return PHASE_LABELS[normalized] ?? phase;
}

function cleanTitle(value?: string) {
  if (!value) return '';
  return value.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
}

function formatTimestamp(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function DiscussionModulePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string; moduleIdx: string }>();
  const searchParams = useSearchParams();

  const courseId = params?.courseId ?? '';
  const moduleIndex = useMemo(() => {
    const raw = params?.moduleIdx ?? '0';
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [params?.moduleIdx]);

  const scopeParam = searchParams.get('scope');
  const discussionScope: 'module' | 'subtopic' =
    scopeParam === 'module' ? 'module' : 'subtopic';
  const moduleIdParam = searchParams.get('moduleId') ?? undefined;
  const targetParamRaw =
    discussionScope === 'module'
      ? null
      : searchParams.get('target') ?? searchParams.get('subIdx');
  const targetSubtopicIndex = useMemo(() => {
    if (discussionScope === 'module') return null;
    if (targetParamRaw === null) return 0;
    const parsed = Number(targetParamRaw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [discussionScope, targetParamRaw]);

  const queryTitle = searchParams.get('title') ?? '';

  const [course, setCourse] = useState<CourseData | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState('');

  const [session, setSession] = useState<DiscussionSession | null>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<DiscussionStep | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requiresPreparation, setRequiresPreparation] = useState(false);
  const [prereqDetails, setPrereqDetails] = useState<ModulePrerequisiteDetails | null>(null);
  const [prereqChecked, setPrereqChecked] = useState(discussionScope !== 'module');

  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    async function fetchCourse() {
      setCourseLoading(true);
      setCourseError('');
      try {
        const response = await fetch(`/api/courses/${courseId}`, {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error('Gagal memuat data kursus');
        }
        const result = await response.json();
        if (!result?.success) {
          throw new Error(result?.error || 'Kursus tidak ditemukan');
        }

        const outline: OutlineModule[] =
          result.course.subtopics?.map((subtopic: any) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch {
              content = { module: subtopic.title, subtopics: [] };
            }
            return {
              module: content?.module || subtopic.title || 'Module',
              subtopics: Array.isArray(content?.subtopics) ? content.subtopics : [],
            };
          }) ?? [];

        if (!cancelled) {
          setCourse({
            title: result.course.title,
            outline,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setCourseError(err?.message ?? 'Tidak dapat memuat data kursus');
        }
      } finally {
        if (!cancelled) {
          setCourseLoading(false);
        }
      }
    }

    fetchCourse();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const moduleData = useMemo(() => {
    if (!course?.outline) return null;
    return course.outline[moduleIndex] ?? null;
  }, [course?.outline, moduleIndex]);

  const targetSubtopic = useMemo(() => {
    if (!moduleData?.subtopics) return null;
    if (discussionScope === 'module' || targetSubtopicIndex === null) return null;
    return moduleData.subtopics[targetSubtopicIndex] ?? null;
  }, [discussionScope, moduleData?.subtopics, targetSubtopicIndex]);

  const apiSubtopicTitle = useMemo(() => {
    if (queryTitle) return queryTitle;
    if (discussionScope === 'module') {
      return moduleData?.module ?? moduleData?.rawTitle ?? '';
    }
    if (!targetSubtopic) return moduleData?.module ?? '';
    return typeof targetSubtopic === 'string'
      ? targetSubtopic
      : targetSubtopic?.title ?? moduleData?.module ?? '';
  }, [discussionScope, moduleData?.module, moduleData?.rawTitle, queryTitle, targetSubtopic]);

  const displaySubtopicTitle = useMemo(() => {
    if (discussionScope === 'module') {
      const base =
        moduleData?.module ||
        moduleData?.rawTitle ||
        'Seluruh materi modul ini';
      return `Seluruh materi modul ${cleanTitle(base) || base}`;
    }
    const raw =
      queryTitle ||
      (typeof targetSubtopic === 'string' ? targetSubtopic : targetSubtopic?.title) ||
      moduleData?.module ||
      '';
    const cleaned = cleanTitle(raw);
    return cleaned || raw || 'Subtopik';
  }, [discussionScope, moduleData?.module, moduleData?.rawTitle, queryTitle, targetSubtopic]);

  const moduleTitle = moduleData?.module ?? 'Modul';
  const moduleSubtopicId = moduleIdParam ?? moduleData?.id ?? null;
  const subtitleLabel = discussionScope === 'module' ? 'Cakupan Diskusi' : 'Subtopik';

  useEffect(() => {
    if (discussionScope !== 'module') {
      setPrereqDetails(null);
      setPrereqChecked(true);
      setRequiresPreparation(false);
      return;
    }

    if (!courseId || !moduleSubtopicId) {
      return;
    }

    let cancelled = false;
    setPrereqChecked(false);

    async function evaluatePrerequisites() {
      try {
        const params = new URLSearchParams({
          courseId,
          moduleId: String(moduleSubtopicId),
        });
        const response = await fetch(`/api/discussion/module-status?${params.toString()}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Gagal memeriksa prasyarat diskusi');
        }

        const data = (await response.json()) as ModulePrerequisiteDetails;
        if (!cancelled) {
          setPrereqDetails(data);
          setRequiresPreparation(!data.ready);
          if (data.ready) {
            setError('');
          } else {
            setError(
              'Selesaikan seluruh subtopik (termasuk kuis) sebelum memulai diskusi penutup.'
            );
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setPrereqDetails(null);
          setRequiresPreparation(true);
          setError(err?.message ?? 'Gagal memeriksa prasyarat diskusi');
        }
      } finally {
        if (!cancelled) {
          setPrereqChecked(true);
        }
      }
    }

    evaluatePrerequisites();

    return () => {
      cancelled = true;
    };
  }, [courseId, discussionScope, moduleSubtopicId]);

  useEffect(() => {
    if (!courseId || !apiSubtopicTitle) return;
    if (discussionScope === 'module') {
      if (!prereqChecked) return;
      if (requiresPreparation) {
        setLoading(false);
        setInitializing(false);
        return;
      }
    }
    let cancelled = false;

    async function startNewSession() {
      try {
        const payload: Record<string, any> = {
          courseId,
          subtopicTitle: apiSubtopicTitle,
          moduleTitle: moduleTitle || undefined,
        };
        if (moduleSubtopicId) {
          payload.subtopicId = moduleSubtopicId;
        }

        const response = await fetch('/api/discussion/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (response.status === 401) {
          throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Gagal memulai diskusi');
        }

        const data = await response.json();
        if (!cancelled) {
          setRequiresPreparation(false);
          setSession({
            id: data.session.id,
            status: data.session.status === 'completed' ? 'completed' : 'in_progress',
            phase: data.session.phase,
            learningGoals: Array.isArray(data.session.learningGoals)
              ? data.session.learningGoals
              : [],
          });
          setMessages(Array.isArray(data.messages) ? data.messages : []);
          setCurrentStep(data.currentStep ?? null);
        }
      } catch (err: any) {
        if (!cancelled) {
          const message = err?.message ?? 'Tidak dapat memulai sesi diskusi';
          if (/unable to resolve discussion context/i.test(message) || /discussion session not found/i.test(message)) {
            setRequiresPreparation(true);
            setError(
              'Diskusi penutup baru tersedia setelah semua subtopik modul selesai dipelajari dan digenerate.'
            );
          } else {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitializing(false);
        }
      }
    }

    async function loadHistory() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          courseId,
        });
        if (moduleSubtopicId) {
          params.set('subtopicId', moduleSubtopicId);
        }
        if (apiSubtopicTitle) {
          params.set('subtopicTitle', apiSubtopicTitle);
        }
        const response = await fetch(`/api/discussion/history?${params.toString()}`, {
          credentials: 'include',
        });

        if (response.status === 404) {
          await startNewSession();
          return;
        }

        if (response.status === 401) {
          throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
        }

        if (!response.ok) {
          throw new Error('Gagal memuat sesi diskusi');
        }

        const data = await response.json();
        if (!cancelled) {
          setRequiresPreparation(false);
          setSession({
            id: data.session.id,
            status: data.session.status === 'completed' ? 'completed' : 'in_progress',
            phase: data.session.phase,
            learningGoals: Array.isArray(data.session.learningGoals)
              ? data.session.learningGoals
              : [],
          });
          setMessages(Array.isArray(data.messages) ? data.messages : []);
          setCurrentStep(data.currentStep ?? null);
        }
      } catch (err: any) {
        if (!cancelled) {
          const message = err?.message ?? 'Tidak dapat memuat sesi diskusi';
          if (/unable to resolve discussion context/i.test(message) || /discussion session not found/i.test(message)) {
            setRequiresPreparation(true);
            setError(
              'Diskusi penutup baru tersedia setelah semua subtopik modul selesai dipelajari dan digenerate.'
            );
          } else {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setInitializing(false);
        }
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [
    apiSubtopicTitle,
    courseId,
    moduleSubtopicId,
    moduleTitle,
    discussionScope,
    prereqChecked,
    requiresPreparation,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || session.status === 'completed' || !currentStep) return;

    const isMcq = (currentStep.expected_type ?? '').toLowerCase() === 'mcq';
    const payload = isMcq ? selectedOption : inputValue.trim();
    if (!payload) return;

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/discussion/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: session.id,
          message: payload,
        }),
      });

      if (response.status === 401) {
        throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
      }

      if (!response.ok) {
        const payloadError = await response.json().catch(() => null);
        throw new Error(payloadError?.error || 'Gagal mengirim jawaban');
      }

      const data = await response.json();
      setSession({
        id: data.session.id,
        status: data.session.status === 'completed' ? 'completed' : 'in_progress',
        phase: data.session.phase,
        learningGoals: Array.isArray(data.session.learningGoals)
          ? data.session.learningGoals
          : [],
      });
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      const nextStep =
        data.nextStep ??
        (data.session.status === 'completed' ? null : data.currentStep ?? null);
      setCurrentStep(nextStep);
      setInputValue('');
      setSelectedOption(null);
    } catch (err: any) {
      setError(err?.message ?? 'Tidak dapat mengirim jawaban');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPhase = normalizePhase(session?.phase);
  const currentPhaseIndex =
    currentPhase === 'completed'
      ? PHASE_SEQUENCE.length
      : Math.max(0, PHASE_SEQUENCE.findIndex((item) => item === currentPhase));

  const phaseItems = PHASE_SEQUENCE.map((phase, index) => {
    let state: 'pending' | 'active' | 'done' = 'pending';
    if (currentPhase === 'completed' || (currentPhaseIndex !== -1 && index < currentPhaseIndex)) {
      state = 'done';
    } else if (index === currentPhaseIndex) {
      state = 'active';
    }
    return {
      key: phase,
      label: getPhaseLabel(phase),
      state,
    };
  });

  const goals = session?.learningGoals ?? [];
  const completedGoals = goals.filter((goal) => goal.covered).length;

  const statusBadge =
    session?.status === 'completed'
      ? styles.badgeDone
      : session?.status === 'in_progress'
      ? styles.badgeProgress
      : styles.badgeIdle;

  const statusLabel =
    session?.status === 'completed'
      ? 'Done'
      : session?.status === 'in_progress'
      ? 'In Progress'
      : 'Ready';

  const nextModuleHref =
    course && moduleIndex + 1 < course.outline.length
      ? `/course/${courseId}?module=${moduleIndex + 1}`
      : `/course/${courseId}`;
  const handleGoToModule = () => {
    router.push(`/course/${courseId}?module=${moduleIndex}`);
  };

  const formatAssessment = (assessment: any): string => {
    if (typeof assessment === 'string') {
      return assessment;
    }
    if (!assessment || typeof assessment !== 'object') {
      return String(assessment ?? '');
    }

    const fragments: string[] = [];

    const mainText =
      typeof assessment.comment === 'string' && assessment.comment.trim()
        ? assessment.comment.trim()
        : typeof assessment.notes === 'string' && assessment.notes.trim()
        ? assessment.notes.trim()
        : typeof assessment.message === 'string' && assessment.message.trim()
        ? assessment.message.trim()
        : '';

    if (mainText) {
      fragments.push(mainText);
    }

    const goalIdentifier =
      assessment.goalId ?? assessment.goal_id ?? assessment.goal ?? null;

    if (goalIdentifier !== null && goalIdentifier !== undefined) {
      const goalLabel = `Goal ${goalIdentifier}`;
      const satisfied =
        typeof assessment.satisfied === 'boolean'
          ? assessment.satisfied
          : typeof assessment.satisfied === 'string'
          ? assessment.satisfied.toLowerCase() === 'true'
          : null;
      if (satisfied !== null) {
        fragments.push(
          `${goalLabel} ${satisfied ? 'tercapai' : 'belum tercapai'}`
        );
      } else {
        fragments.push(goalLabel);
      }
    } else if (typeof assessment.satisfied === 'boolean') {
      fragments.push(assessment.satisfied ? 'Goal tercapai' : 'Goal belum tercapai');
    }

    if (typeof assessment.explanation === 'string' && assessment.explanation.trim()) {
      fragments.push(assessment.explanation.trim());
    }

    if (!fragments.length) {
      try {
        return JSON.stringify(assessment);
      } catch {
        return '[Assessment tidak tersedia]';
      }
    }

    return fragments.join(' - ');
  };

  if (courseError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{courseError}</div>
        <button className={styles.backButton} onClick={() => router.back()}>
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link
            href={`/course/${courseId}?module=${moduleIndex}`}
            className={styles.breadcrumb}
          >
            ← Kembali ke Outline
          </Link>
          <h1 className={styles.title}>Diskusi Penutup</h1>
          <p className={styles.subtitle}>
            Modul <strong>{moduleTitle}</strong> - {subtitleLabel}{' '}
            <strong>{displaySubtopicTitle}</strong>
          </p>
        </div>
        <span className={`${styles.statusBadge} ${statusBadge}`}>{statusLabel}</span>
      </header>

      {requiresPreparation ? (
        <div className={styles.preparationNotice}>
          <h2>Lengkapi Materi Terlebih Dahulu</h2>
          <p>
            Diskusi penutup modul akan aktif setelah semua subtopik selesai dipelajari dan seluruh
            kuis subtopik telah dikerjakan.
          </p>
          {prereqDetails && (
            <>
              <div className={styles.preparationSummary}>
                <span>
                  Subtopik siap: {prereqDetails.summary.generatedSubtopics}/
                  {prereqDetails.summary.expectedSubtopics}
                </span>
                <span>
                  Kuis dijawab: {prereqDetails.summary.answeredQuizQuestions}/
                  {prereqDetails.summary.totalQuizQuestions}
                </span>
              </div>
              <ul className={styles.preparationStatusList}>
                {prereqDetails.subtopics.map((item) => {
                  const statusLabel = !item.generated
                    ? 'Belum digenerate'
                    : item.quizQuestionCount === 0
                    ? 'Kuis belum tersedia'
                    : item.quizCompleted
                    ? 'Siap'
                    : 'Kuis belum selesai';
                  const statusClass =
                    item.generated && item.quizCompleted
                      ? styles.statusReady
                      : styles.statusPending;
                  return (
                    <li key={item.key} className={styles.preparationStatusItem}>
                      <div>
                        <strong>{cleanTitle(item.title) || item.title}</strong>
                        {!item.generated && (
                          <p className={styles.preparationHint}>
                            Buka subtopik ini dan jalankan generator materi melalui tombol{' '}
                            <strong>Get Started</strong>.
                          </p>
                        )}
                        {item.generated && !item.quizCompleted && (
                          <p className={styles.preparationHint}>
                            Kerjakan kuis pada akhir subtopik ini untuk menandai penyelesaian.
                          </p>
                        )}
                      </div>
                      <span className={`${styles.preparationStatusBadge} ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {!prereqDetails && (
            <ol className={styles.preparationList}>
              <li>Buka setiap subtopik pada modul ini melalui menu di kiri.</li>
              <li>Tekan tombol <strong>Get Started</strong> dan tunggu materi selesai digenerate.</li>
              <li>Selesaikan kuis yang tersedia di bagian akhir setiap subtopik.</li>
            </ol>
          )}
          <button type="button" className={styles.preparationButton} onClick={handleGoToModule}>
            Pelajari Subtopik Modul
          </button>
        </div>
      ) : initializing ? (
        <div className={styles.loadingPanel}>Menyiapkan sesi diskusi...</div>
      ) : (
        <>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.layout}>
            <section className={styles.threadSection}>
              <div className={styles.phaseRow}>
                {phaseItems.map((phase) => (
                  <div
                    key={phase.key}
                    className={`${styles.phaseChip} ${
                      phase.state === 'done'
                        ? styles.phaseChipDone
                        : phase.state === 'active'
                        ? styles.phaseChipActive
                        : styles.phaseChipPending
                    }`}
                  >
                    {phase.label}
                  </div>
                ))}
              </div>

              <div className={styles.thread}>
                {messages.length === 0 && (
                  <div className={styles.emptyThread}>
                    Mentor siap memulai diskusi. Berikan jawaban terbaik Anda untuk setiap
                    pertanyaan.
                  </div>
                )}
                {messages.map((message, index) => {
                  const isAgent = message.role === 'agent';
                  const meta = message.metadata ?? {};
                  const phaseLabel = getPhaseLabel(meta.phase);
                  const timestamp = formatTimestamp(message.created_at);
                  return (
                    <div
                      key={message.id ?? `${message.role}-${index}`}
                      className={`${styles.message} ${
                        isAgent ? styles.messageAgent : styles.messageStudent
                      }`}
                    >
                      <div className={styles.messageHeader}>
                        <span className={styles.messageAuthor}>
                          {isAgent ? 'Mentor' : 'Anda'}
                        </span>
                        {meta.phase && (
                          <span className={styles.messagePhase}>{phaseLabel}</span>
                        )}
                        {timestamp && (
                          <span className={styles.messageTime}>{timestamp}</span>
                        )}
                      </div>
                      <div className={styles.messageBody}>{message.content}</div>
                      {Array.isArray(meta.assessments) && meta.assessments.length > 0 && (
                        <ul className={styles.assessmentList}>
                          {meta.assessments.map((item: any, idx: number) => (
                            <li key={idx}>{formatAssessment(item)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            </section>

            <aside className={styles.sidebar}>
              <div className={styles.sidebarCard}>
                <h2 className={styles.sidebarTitle}>Tujuan Pembelajaran</h2>
                <p className={styles.sidebarSubtitle}>
                  {completedGoals}/{goals.length} tercapai
                </p>
                <ul className={styles.goalList}>
                  {goals.map((goal) => (
                    <li
                      key={goal.id}
                      className={`${styles.goalItem} ${
                        goal.covered ? styles.goalItemDone : ''
                      }`}
                    >
                      <span className={styles.goalStatus}>
                        {goal.covered ? '✔' : '○'}
                      </span>
                      <span className={styles.goalText}>{goal.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.sidebarCard}>
                <h2 className={styles.sidebarTitle}>Fase Aktif</h2>
                <p className={styles.sidebarPhase}>{getPhaseLabel(session?.phase)}</p>
                <p className={styles.sidebarHint}>
                  Jawablah sesuai instruksi mentor. Umpan balik otomatis akan muncul setiap
                  kali Anda mengirim respons.
                </p>
              </div>
            </aside>
          </div>

          <footer className={styles.inputContainer}>
            {session?.status === 'completed' ? (
              <div className={styles.completedPanel}>
                <p>
                  Semua tujuan pembelajaran telah tercapai. Lanjutkan perjalanan belajar ke
                  modul berikutnya.
                </p>
                <button
                  className={styles.primaryButton}
                  onClick={() => router.push(nextModuleHref)}
                >
                  Lanjut Modul Berikutnya
                </button>
              </div>
            ) : currentStep ? (
              <form className={styles.inputForm} onSubmit={handleSubmit}>
                <div className={styles.prompt}>
                  <h3>Pertanyaan Mentor</h3>
                  <p>{currentStep.prompt}</p>
                </div>
                {(currentStep.expected_type ?? '').toLowerCase() === 'mcq' &&
                Array.isArray(currentStep.options) ? (
                  <div className={styles.optionList}>
                    {currentStep.options.map((option) => (
                      <label key={option} className={styles.optionItem}>
                        <input
                          type="radio"
                          name="discussion-option"
                          value={option}
                          checked={selectedOption === option}
                          onChange={() => setSelectedOption(option)}
                          disabled={submitting}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className={styles.textarea}
                    placeholder="Tuliskan pemikiran dan penjelasan Anda..."
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    disabled={submitting}
                    rows={4}
                  />
                )}
                <div className={styles.actions}>
                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={
                      submitting ||
                      (!inputValue.trim() &&
                        (currentStep.expected_type ?? '').toLowerCase() !== 'mcq') ||
                      ((currentStep.expected_type ?? '').toLowerCase() === 'mcq' &&
                        !selectedOption)
                    }
                  >
                    {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.waitingPanel}>
                {loading
                  ? 'Memuat instruksi berikutnya…'
                  : 'Sesi diskusi ditutup. Tunggu arahan mentor berikutnya.'}
              </div>
            )}
          </footer>
        </>
      )}
    </div>
  );
}
