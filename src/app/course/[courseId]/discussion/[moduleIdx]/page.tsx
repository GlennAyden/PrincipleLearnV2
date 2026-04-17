'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import styles from './page.module.scss';
import {
  normalizeDiscussionResponse,
  type DiscussionMessage,
  type DiscussionSession,
  type DiscussionStep,
  type ModulePrerequisiteDetails,
} from '@/types/discussion';
import { apiFetch } from '@/lib/api-client';

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

const PHASE_LABELS: Record<string, string> = {
  diagnosis: 'Diagnosis',
  exploration: 'Penjelasan',
  explanation: 'Penjelasan',
  practice: 'Latihan',
  synthesis: 'Konsolidasi',
  consolidation: 'Konsolidasi',
  completed: 'Selesai',
};

const DISCUSSION_TEMPLATE_PREPARING_CODE = 'DISCUSSION_TEMPLATE_PREPARING';
const DISCUSSION_PREPARING_MESSAGE =
  'Diskusi sedang disiapkan. Coba tekan mulai ulang diskusi beberapa saat lagi.';
const DISCUSSION_PREPARING_DEFAULT_RETRY_SECONDS = 30;

type ApiErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
  status?: string;
  retryAfterSeconds?: number;
  prerequisites?: ModulePrerequisiteDetails;
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

async function readApiPayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    return (await response.json()) as ApiErrorPayload;
  } catch {
    return null;
  }
}

function payloadMessage(payload: ApiErrorPayload | null, fallback: string) {
  return payload?.message || payload?.error || fallback;
}

function responseRetryAfterSeconds(response: Response, payload: ApiErrorPayload | null) {
  if (typeof payload?.retryAfterSeconds === 'number' && payload.retryAfterSeconds > 0) {
    return payload.retryAfterSeconds;
  }
  const retryAfter = response.headers.get('Retry-After');
  const parsed = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DISCUSSION_PREPARING_DEFAULT_RETRY_SECONDS;
}

function numberFromMetadata(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function deriveInteractionState(nextMessages: DiscussionMessage[]) {
  const lastMessage = nextMessages[nextMessages.length - 1];
  const metadata = lastMessage?.metadata ?? {};
  const type = metadata.type;

  if (lastMessage?.role === 'agent' && type === 'retry_prompt') {
    const displayedAttempt = numberFromMetadata(metadata.attempt_number ?? metadata.attemptNumber);
    return {
      isRetrying: true,
      retryAttempt: Math.max(0, displayedAttempt - 1),
      isRemediation: false,
      remediationRound: 0,
    };
  }

  if (lastMessage?.role === 'agent' && type === 'remediation_prompt') {
    return {
      isRetrying: false,
      retryAttempt: 0,
      isRemediation: true,
      remediationRound: numberFromMetadata(metadata.remediation_round ?? metadata.remediationRound),
    };
  }

  return {
    isRetrying: false,
    retryAttempt: 0,
    isRemediation: false,
    remediationRound: 0,
  };
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
  const [, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState('');

  const [session, setSession] = useState<DiscussionSession | null>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [currentStep, setCurrentStep] = useState<DiscussionStep | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requiresPreparation, setRequiresPreparation] = useState(false);
  const [discussionPreparing, setDiscussionPreparing] = useState(false);
  const [preparingMessage, setPreparingMessage] = useState(DISCUSSION_PREPARING_MESSAGE);
  const [preparingRetryAfterSeconds, setPreparingRetryAfterSeconds] = useState(
    DISCUSSION_PREPARING_DEFAULT_RETRY_SECONDS,
  );
  const [prereqDetails, setPrereqDetails] = useState<ModulePrerequisiteDetails | null>(null);
  const [prereqChecked, setPrereqChecked] = useState(discussionScope !== 'module');
  const [reloadKey, setReloadKey] = useState(0);

  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showGoalPanel, setShowGoalPanel] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isRemediation, setIsRemediation] = useState(false);
  const [remediationRound, setRemediationRound] = useState(0);
  const [effortWarning, setEffortWarning] = useState('');

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const goalToggleRef = useRef<HTMLButtonElement | null>(null);
  const goalPanelRef = useRef<HTMLDivElement | null>(null);

  const clearDiscussionState = useCallback(() => {
    setSession(null);
    setMessages([]);
    setCurrentStep(null);
    setInputValue('');
    setSelectedOption(null);
    setIsRetrying(false);
    setRetryAttempt(0);
    setIsRemediation(false);
    setRemediationRound(0);
    setEffortWarning('');
    setShowGoalPanel(false);
  }, []);

  const syncInteractionStateFromMessages = useCallback((nextMessages: DiscussionMessage[]) => {
    const state = deriveInteractionState(nextMessages);
    setIsRetrying(state.isRetrying);
    setRetryAttempt(state.retryAttempt);
    setIsRemediation(state.isRemediation);
    setRemediationRound(state.remediationRound);
  }, []);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!showGoalPanel) return;

    function handleClickAway(event: MouseEvent) {
      const target = event.target as Node;
      if (
        goalPanelRef.current?.contains(target) ||
        goalToggleRef.current?.contains(target)
      ) {
        return;
      }
      setShowGoalPanel(false);
    }

    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, [showGoalPanel]);

  useEffect(() => {
    setShowGoalPanel(false);
  }, [session?.id]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;

    async function fetchCourse() {
      setCourseLoading(true);
      setCourseError('');
      try {
        const response = await apiFetch(`/api/courses/${courseId}`);
        if (!response.ok) {
          throw new Error('Gagal memuat data kursus');
        }
        const result = await response.json();
        if (!result?.success) {
          throw new Error(result?.error || 'Kursus tidak ditemukan');
        }

        const outline: OutlineModule[] =
          result.course.subtopics?.map((subtopic: { id?: string; title?: string; content: string }, index: number) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch {
              content = { module: subtopic.title, subtopics: [] };
            }
            return {
              id: String(subtopic.id ?? `module-${index}`),
              rawTitle: subtopic.title ?? undefined,
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
      } catch (err: unknown) {
        if (!cancelled) {
          setCourseError(err instanceof Error ? err.message : 'Tidak dapat memuat data kursus');
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
    if (discussionScope === 'module') {
      return moduleData?.module ?? moduleData?.rawTitle ?? queryTitle ?? '';
    }
    if (queryTitle) return queryTitle;
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
  const moduleSubtopicId = moduleData?.id ?? moduleIdParam ?? null;
  const subtitleLabel = discussionScope === 'module' ? 'Cakupan Diskusi' : 'Subtopik';

  useEffect(() => {
    if (discussionScope !== 'module') {
      setPrereqDetails(null);
      setPrereqChecked(true);
      setRequiresPreparation(false);
      setDiscussionPreparing(false);
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
        const response = await apiFetch(`/api/discussion/module-status?${params.toString()}`);

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Gagal memeriksa prasyarat diskusi');
        }

        const data = (await response.json()) as ModulePrerequisiteDetails;
        if (!cancelled) {
          setPrereqDetails(data);
          setRequiresPreparation(!data.ready);
          setDiscussionPreparing(false);
          if (data.ready) {
            setError('');
          } else {
            clearDiscussionState();
            setError(
              'Selesaikan seluruh subtopik (termasuk kuis) sebelum memulai diskusi wajib.'
            );
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setPrereqDetails(null);
          setRequiresPreparation(true);
          setDiscussionPreparing(false);
          clearDiscussionState();
          setError(err instanceof Error ? err.message : 'Gagal memeriksa prasyarat diskusi');
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
  }, [clearDiscussionState, courseId, discussionScope, moduleSubtopicId]);

  useEffect(() => {
    if (!courseId || !apiSubtopicTitle) return;
    if (discussionScope === 'module') {
      if (!prereqChecked) return;
      if (requiresPreparation) {
        clearDiscussionState();
        setDiscussionPreparing(false);
        setLoading(false);
        setInitializing(false);
        return;
      }
    }
    let cancelled = false;

    function buildDiscussionPayload() {
      const payload: Record<string, unknown> = {
        courseId,
        subtopicTitle: apiSubtopicTitle,
        moduleTitle: moduleTitle || undefined,
      };
      if (moduleSubtopicId) {
        payload.subtopicId = moduleSubtopicId;
      }
      return payload;
    }

    async function prepareDiscussionTemplate(payload: Record<string, unknown>) {
      const response = await apiFetch('/api/discussion/prepare', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const responsePayload = await readApiPayload(response);
      const retryAfterSeconds = responseRetryAfterSeconds(response, responsePayload);

      if (response.status === 401) {
        throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
      }

      if (response.status === 409) {
        if (!cancelled) {
          clearDiscussionState();
          setRequiresPreparation(true);
          setDiscussionPreparing(false);
          setPrereqDetails(responsePayload?.prerequisites ?? null);
          setError(
            payloadMessage(
              responsePayload,
              'Selesaikan seluruh subtopik modul sebelum memulai diskusi wajib.',
            ),
          );
        }
        return;
      }

      if (response.status === 202) {
        if (!cancelled) {
          clearDiscussionState();
          setRequiresPreparation(false);
          setDiscussionPreparing(true);
          setPreparingMessage(payloadMessage(responsePayload, DISCUSSION_PREPARING_MESSAGE));
          setPreparingRetryAfterSeconds(retryAfterSeconds);
          setError('');
        }
        return;
      }

      if (response.ok) {
        if (!cancelled) {
          setRequiresPreparation(false);
          setDiscussionPreparing(true);
          setPreparingMessage('Diskusi siap dimulai. Memuat sesi...');
          setPreparingRetryAfterSeconds(1);
          setError('');
          setReloadKey((value) => value + 1);
        }
        return;
      }

      if (!cancelled) {
        clearDiscussionState();
        setRequiresPreparation(false);
        setDiscussionPreparing(true);
        setPreparingMessage(payloadMessage(responsePayload, DISCUSSION_PREPARING_MESSAGE));
        setPreparingRetryAfterSeconds(retryAfterSeconds);
        setError('');
      }
    }

    async function startNewSession() {
      try {
        const payload = buildDiscussionPayload();

        const response = await apiFetch('/api/discussion/start', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (response.status === 202) {
          const responsePayload = await readApiPayload(response);
          const retryAfterSeconds = responseRetryAfterSeconds(response, responsePayload);
          if (!cancelled) {
            clearDiscussionState();
            setRequiresPreparation(false);
            setDiscussionPreparing(true);
            setPreparingMessage(payloadMessage(responsePayload, DISCUSSION_PREPARING_MESSAGE));
            setPreparingRetryAfterSeconds(retryAfterSeconds);
            setError('');
          }
          await prepareDiscussionTemplate(payload);
          return;
        }

        if (response.status === 401) {
          throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
        }

        if (response.status === 409) {
          const responsePayload = await readApiPayload(response);
          if (!cancelled) {
            clearDiscussionState();
            setRequiresPreparation(true);
            setDiscussionPreparing(false);
            setPrereqDetails(responsePayload?.prerequisites ?? null);
            setError(
              payloadMessage(
                responsePayload,
                'Selesaikan seluruh subtopik modul sebelum memulai diskusi wajib.',
              ),
            );
          }
          return;
        }

        if (!response.ok) {
          const responsePayload = await readApiPayload(response);
          if (responsePayload?.code === DISCUSSION_TEMPLATE_PREPARING_CODE) {
            const retryAfterSeconds = responseRetryAfterSeconds(response, responsePayload);
            if (!cancelled) {
              clearDiscussionState();
              setRequiresPreparation(false);
              setDiscussionPreparing(true);
              setPreparingMessage(payloadMessage(responsePayload, DISCUSSION_PREPARING_MESSAGE));
              setPreparingRetryAfterSeconds(retryAfterSeconds);
              setError('');
            }
            await prepareDiscussionTemplate(payload);
            return;
          }
          throw new Error(payloadMessage(responsePayload, 'Gagal memulai diskusi'));
        }

        const data = await response.json();
        if (!cancelled) {
          const normalized = normalizeDiscussionResponse(data);
          setRequiresPreparation(false);
          setDiscussionPreparing(false);
          setError('');
          setSession(normalized.session);
          setMessages(normalized.messages);
          syncInteractionStateFromMessages(normalized.messages);
          setCurrentStep(normalized.currentStep);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Tidak dapat memulai sesi diskusi';
          if (/unable to resolve discussion context/i.test(message) || /discussion session not found/i.test(message)) {
            setRequiresPreparation(true);
            setDiscussionPreparing(false);
            clearDiscussionState();
            setError(
              'Diskusi wajib baru tersedia setelah semua subtopik modul selesai dipelajari dan digenerate.'
            );
          } else {
            setDiscussionPreparing(false);
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
      setDiscussionPreparing(false);
      clearDiscussionState();
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
        const response = await apiFetch(`/api/discussion/history?${params.toString()}`);

        if (response.status === 404) {
          const responsePayload = await readApiPayload(response);
          if (responsePayload?.code === 'SESSION_NOT_FOUND') {
            await startNewSession();
            return;
          }
          if (!cancelled) {
            setRequiresPreparation(true);
            setDiscussionPreparing(false);
            setError(
              'Diskusi wajib baru tersedia setelah semua subtopik modul selesai dipelajari dan digenerate.'
            );
          }
          return;
        }

        if (response.status === 401) {
          throw new Error('Sesi diskusi memerlukan login. Silakan masuk kembali.');
        }

        if (!response.ok) {
          const responsePayload = await readApiPayload(response);
          throw new Error(payloadMessage(responsePayload, 'Gagal memuat sesi diskusi'));
        }

        const data = await response.json();
        if (!cancelled) {
          const normalized = normalizeDiscussionResponse(data);
          setRequiresPreparation(false);
          setDiscussionPreparing(false);
          setError('');
          setSession(normalized.session);
          setMessages(normalized.messages);
          syncInteractionStateFromMessages(normalized.messages);
          setCurrentStep(normalized.currentStep);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Tidak dapat memuat sesi diskusi';
          if (/unable to resolve discussion context/i.test(message) || /discussion session not found/i.test(message)) {
            setRequiresPreparation(true);
            setDiscussionPreparing(false);
            clearDiscussionState();
            setError(
              'Diskusi wajib baru tersedia setelah semua subtopik modul selesai dipelajari dan digenerate.'
            );
          } else {
            setDiscussionPreparing(false);
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
    clearDiscussionState,
    courseId,
    moduleSubtopicId,
    moduleTitle,
    discussionScope,
    prereqChecked,
    requiresPreparation,
    reloadKey,
    syncInteractionStateFromMessages,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || session.status !== 'in_progress' || !currentStep) return;

    const isMcq = (currentStep.expectedType ?? '').toLowerCase() === 'mcq';
    const payload = isMcq ? selectedOption : inputValue.trim();
    if (!payload) return;

    setSubmitting(true);
    setError('');
    setEffortWarning('');
    try {
      const response = await apiFetch('/api/discussion/respond', {
        method: 'POST',
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
      const normalized = normalizeDiscussionResponse(data);
      setSession(normalized.session);
      setMessages(normalized.messages);
      const nextStep =
        normalized.nextStep ??
        (normalized.session.status === 'completed' ? null : normalized.currentStep ?? null);
      setCurrentStep(nextStep);

      // Handle effort rejection — keep input so student can edit
      if (data.effortRejection) {
        setEffortWarning('Jawaban Anda belum memenuhi syarat. Silakan baca umpan balik di atas.');
        setSelectedOption(null);
        return;
      }

      // Handle retry state
      if (data.isRetry) {
        setIsRetrying(true);
        setRetryAttempt(data.attemptNumber ?? 1);
      } else {
        setIsRetrying(false);
        setRetryAttempt(0);
      }

      // Handle clarification — keep step, clear input
      if (data.clarificationGiven) {
        setIsRetrying(false);
        setRetryAttempt(0);
        setInputValue('');
        setSelectedOption(null);
        return;
      }

      // Handle remediation phase
      if (data.isRemediation) {
        setIsRemediation(true);
        setRemediationRound(data.remediationRound ?? 1);
        setIsRetrying(false);
        setRetryAttempt(0);
      } else if (!data.isRetry) {
        setIsRemediation(false);
        setRemediationRound(0);
      }

      if (normalized.session.status === 'completed') {
        setIsRemediation(false);
        setRemediationRound(0);
        setIsRetrying(false);
        setRetryAttempt(0);
      }

      setInputValue('');
      setSelectedOption(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tidak dapat mengirim jawaban');
    } finally {
      setSubmitting(false);
    }
  };

  const MIN_OPEN_RESPONSE_LENGTH = 10;

  const goals = session?.learningGoals ?? [];
  const completedGoals = goals.filter((goal) => goal.covered).length;
  const totalGoals = goals.length;
  const allGoalsCompleted = totalGoals > 0 && completedGoals === totalGoals;
  const hasMessages = messages.length > 0;
  const goalPanelId = session?.id ? `discussion-goal-panel-${session.id}` : 'discussion-goal-panel';
  const isCurrentStepMcq =
    (currentStep?.expectedType ?? '').toLowerCase() === 'mcq' &&
    Array.isArray(currentStep?.options);
  const mcqOptions = isCurrentStepMcq ? (currentStep?.options as string[]) : [];

  const openResponseTooShort = !isCurrentStepMcq && inputValue.trim().length > 0 && inputValue.trim().length < MIN_OPEN_RESPONSE_LENGTH;

  const canSubmitResponse = currentStep
    ? isCurrentStepMcq
      ? Boolean(selectedOption)
      : inputValue.trim().length >= MIN_OPEN_RESPONSE_LENGTH
    : false;

  useEffect(() => {
    if (showGoalPanel && totalGoals === 0) {
      setShowGoalPanel(false);
    }
  }, [showGoalPanel, totalGoals]);

  const shouldRenderComposer =
    !loading &&
    !requiresPreparation &&
    !discussionPreparing &&
    session?.status === 'in_progress' &&
    Boolean(currentStep);

  const renderComposer = () => {
    if (!currentStep) return null;
    const baseClass = [styles.composer, styles.composerStandalone];
    return (
      <form className={baseClass.join(' ')} onSubmit={handleSubmit}>
        {isRetrying && (
          <div className={styles.retryBanner}>
            <span className={styles.retryIcon}>↻</span>
            <span>Coba lagi (percobaan ke-{retryAttempt + 1} dari 2) — Perhatikan umpan balik di atas sebelum menjawab ulang.</span>
          </div>
        )}
        {isRemediation && !isRetrying && (
          <div className={styles.remediationBanner}>
            <span className={styles.remediationIcon}>🎯</span>
            <span>Fase Pendalaman (putaran {remediationRound}/2) — Pertanyaan ini menarget tujuan yang belum tercapai.</span>
          </div>
        )}
        {isCurrentStepMcq ? (
          <>
            <div className={styles.optionList}>
              {mcqOptions.map((option) => (
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
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.mcqSubmit}
                disabled={submitting || !canSubmitResponse}
              >
                {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.responseWrapper}>
            <textarea
              className={styles.textarea}
              placeholder="Tuliskan pemikiran dan penjelasan Anda (minimal 10 karakter)..."
              value={inputValue}
              onChange={(event) => { setInputValue(event.target.value); setEffortWarning(''); }}
              disabled={submitting}
              rows={3}
            />
            {!isCurrentStepMcq && inputValue.trim().length > 0 && (
              <span className={`${styles.charCount} ${openResponseTooShort ? styles.charCountWarn : styles.charCountOk}`}>
                {inputValue.trim().length}/{MIN_OPEN_RESPONSE_LENGTH}
              </span>
            )}
            {effortWarning && (
              <p className={styles.effortWarning}>{effortWarning}</p>
            )}
            <button
              type="submit"
              className={styles.sendButton}
              disabled={submitting || !canSubmitResponse}
            >
              <span className={styles.sendButtonText}>
                {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
              </span>
              <span className={styles.sendButtonIcon} aria-hidden="true">
                ↑
              </span>
            </button>
          </div>
        )}
      </form>
    );
  };

  const statusBadge =
    session?.status === 'completed'
      ? styles.badgeDone
      : session?.status === 'failed'
      ? styles.badgeProgress
      : session?.status === 'in_progress'
      ? styles.badgeProgress
      : styles.badgeIdle;

  const statusLabel =
    session?.status === 'completed'
      ? 'Selesai'
      : session?.status === 'failed'
      ? 'Gagal'
      : session?.status === 'in_progress'
      ? 'Sedang Berlangsung'
      : 'Siap';

  const nextModuleHref =
    course && moduleIndex + 1 < course.outline.length
      ? `/course/${courseId}?module=${moduleIndex + 1}`
      : `/course/${courseId}`;
  const handleGoToModule = () => {
    router.push(`/course/${courseId}?module=${moduleIndex}`);
  };

  const formatAssessment = (assessment: unknown): string => {
    if (typeof assessment === 'string') {
      return assessment;
    }
    if (!assessment || typeof assessment !== 'object') {
      return String(assessment ?? '');
    }

    const obj = assessment as Record<string, unknown>;
    const fragments: string[] = [];

    const mainText =
      typeof obj.comment === 'string' && obj.comment.trim()
        ? obj.comment.trim()
        : typeof obj.notes === 'string' && obj.notes.trim()
        ? obj.notes.trim()
        : typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : '';

    if (mainText) {
      fragments.push(mainText);
    }

    const goalIdentifier =
      obj.goalId ?? obj.goal_id ?? obj.goal ?? null;

    if (goalIdentifier !== null && goalIdentifier !== undefined) {
      const goalLabel = `Goal ${goalIdentifier}`;
      const satisfied =
        typeof obj.satisfied === 'boolean'
          ? obj.satisfied
          : typeof obj.satisfied === 'string'
          ? obj.satisfied.toLowerCase() === 'true'
          : null;
      if (satisfied !== null) {
        fragments.push(
          `${goalLabel} ${satisfied ? 'tercapai' : 'belum tercapai'}`
        );
      } else {
        fragments.push(goalLabel);
      }
    } else if (typeof obj.satisfied === 'boolean') {
      fragments.push(obj.satisfied ? 'Goal tercapai' : 'Goal belum tercapai');
    }

    if (typeof obj.explanation === 'string' && obj.explanation.trim()) {
      fragments.push(obj.explanation.trim());
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
          <h1 className={styles.title}>Diskusi Wajib</h1>
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
            Diskusi wajib modul akan aktif setelah semua subtopik selesai digenerate, kuis
            tersimpan, dan refleksi wajib tersimpan.
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
              {prereqDetails.summary.expectedSubtopics > 0
                ? ` (≥${prereqDetails.summary.minQuestionsPerSubtopic} per subtopik)`
                : ''}
            </span>
            <span>
              Refleksi tersimpan: {prereqDetails.summary.reflectedSubtopics}/
              {prereqDetails.summary.expectedSubtopics}
            </span>
          </div>
              <ul className={styles.preparationStatusList}>
                {prereqDetails.subtopics.map((item) => {
                    const quizDone = item.userHasCompletion || item.quizCompleted;
                    const statusLabel = !item.generated
                      ? 'Belum digenerate'
                      : !quizDone
                      ? item.quizQuestionCount === 0
                        ? 'Kuis belum tersedia'
                        : item.quizQuestionCount < prereqDetails.summary.minQuestionsPerSubtopic
                        ? 'Kuis belum lengkap'
                        : 'Kuis belum selesai'
                      : !item.reflectionCompleted
                      ? 'Refleksi belum tersimpan'
                      : 'Siap';
                    const statusClass = item.completed
                      ? styles.statusReady
                      : styles.statusPending;
                  return (
                    <li key={item.key} className={styles.preparationStatusItem}>
                      <div>
                        <strong>{cleanTitle(item.title) || item.title}</strong>
                        <p className={styles.preparationStats}>
                          Kuis terjawab: {item.answeredCount}/{Math.max(
                            item.quizQuestionCount,
                            prereqDetails.summary.minQuestionsPerSubtopic
                          )}
                        </p>
                        {!item.generated && (
                          <p className={styles.preparationHint}>
                            Buka subtopik ini dan jalankan generator materi melalui tombol{' '}
                            <strong>Get Started</strong>.
                          </p>
                        )}
                        {item.generated && !item.userHasCompletion && !item.quizCompleted && (
                          <p className={styles.preparationHint}>
                            Kerjakan kuis pada akhir subtopik ini untuk menandai penyelesaian.
                          </p>
                        )}
                        {item.generated &&
                          (item.userHasCompletion || item.quizCompleted) &&
                          !item.reflectionCompleted && (
                            <p className={styles.preparationHint}>
                              Harap mengisi feedback dulu pada halaman akhir subtopik ini.
                            </p>
                          )}
                        {item.generated &&
                          !item.userHasCompletion &&
                          item.quizQuestionCount < prereqDetails.summary.minQuestionsPerSubtopic && (
                            <p className={styles.preparationHint}>
                              Kuis terbaru belum lengkap. Buka kembali subtopik ini dan jalankan{' '}
                              <strong>Get Started</strong> untuk memastikan pertanyaan diperbarui.
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
              <li>Isi empat refleksi wajib dan rating bintang pada tiap subtopik.</li>
            </ol>
          )}
          <button type="button" className={styles.preparationButton} onClick={handleGoToModule}>
            Pelajari Subtopik Modul
          </button>
        </div>
      ) : discussionPreparing ? (
        <div className={styles.preparationNotice}>
          <h2>Diskusi Sedang Disiapkan</h2>
          <p>{preparingMessage}</p>
          <ol className={styles.preparationList}>
            <li>
              Tunggu sekitar {preparingRetryAfterSeconds} detik agar sistem selesai
              menyiapkan pertanyaan diskusi.
            </li>
            <li>Tekan tombol di bawah ini untuk mengecek ulang kesiapan diskusi.</li>
          </ol>
          <button
            type="button"
            className={styles.preparationButton}
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            {loading ? 'Memeriksa...' : 'Mulai Ulang Diskusi'}
          </button>
        </div>
      ) : initializing ? (
        <div className={styles.loadingPanel}>Menyiapkan sesi diskusi...</div>
      ) : (
        <>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.layout}>
            <section className={styles.threadSection}>
              <div className={styles.discussionTop}>
                <button
                  type="button"
                  ref={goalToggleRef}
                  className={`${styles.goalToggle} ${
                    showGoalPanel ? styles.goalToggleOpen : ''
                  } ${allGoalsCompleted ? styles.goalToggleDone : ''}`}
                  onClick={() => setShowGoalPanel((prev) => !prev)}
                  disabled={totalGoals === 0}
                  aria-expanded={showGoalPanel}
                  aria-controls={totalGoals > 0 ? goalPanelId : undefined}
                  aria-haspopup="listbox"
                >
                  <span className={styles.goalToggleLabel}>Goal Diskusi</span>
                  <span className={styles.goalToggleSummary}>
                    {totalGoals > 0 ? `${completedGoals}/${totalGoals} tercapai` : 'Belum ada goal'}
                  </span>
                  <span className={styles.goalToggleChevron} aria-hidden="true" />
                </button>
                {showGoalPanel && totalGoals > 0 && (
                  <div
                    id={goalPanelId}
                    className={styles.goalDropdown}
                    ref={goalPanelRef}
                    role="listbox"
                    aria-label="Daftar goal diskusi"
                  >
                    <div className={styles.goalDropdownHeader}>
                      <h3>Tujuan Diskusi</h3>
                      <p>
                        {completedGoals}/{totalGoals} tercapai
                      </p>
                      <span className={styles.goalDropdownPhase}>
                        Fase aktif: {getPhaseLabel(session?.phase)}
                      </span>
                    </div>
                    <ul className={styles.goalDropdownList}>
                      {goals.map((goal) => (
                        <li
                          key={goal.id}
                          className={styles.goalDropdownItem}
                          role="option"
                          aria-selected={goal.covered}
                        >
                          <span
                            className={`${styles.goalCircle} ${
                              goal.covered ? styles.goalCircleDone : ''
                            }`}
                            aria-hidden="true"
                          />
                          <p>{goal.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className={`${styles.thread} ${!hasMessages ? styles.threadEmpty : ''}`}>
                {!hasMessages && (
                  <div className={styles.introCard}>
                    <h2>Mari kita diskusi untuk memperkuat pemahamanmu. Kau siap?</h2>
                    {currentStep?.prompt && (
                      <p className={styles.introPrompt}>{currentStep.prompt}</p>
                    )}
                    <p className={styles.introHint}>
                      Ketik jawabanmu lalu tekan tombol kirim untuk melanjutkan diskusi wajib ini.
                    </p>
                  </div>
                )}
                {messages.map((message, index) => {
                  const isAgent = message.role === 'agent';
                  const meta = message.metadata ?? {};
                  const metaType = message.metadata?.type;
                  const timestamp = formatTimestamp(message.createdAt);
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
                        {metaType === 'retry_prompt' && (
                          <span className={styles.retryTag}>Coba Lagi</span>
                        )}
                        {metaType === 'effort_rejection' && (
                          <span className={styles.effortTag}>Perlu Perbaikan</span>
                        )}
                        {metaType === 'clarification_response' && (
                          <span className={styles.clarificationTag}>Klarifikasi</span>
                        )}
                        {metaType === 'remediation_prompt' && (
                          <span className={styles.remediationTag}>Pendalaman</span>
                        )}
                        {timestamp && <span className={styles.messageTime}>{timestamp}</span>}
                      </div>
                      <div className={styles.messageBody}>{message.content}</div>
                      {Array.isArray(meta.assessments) && meta.assessments.length > 0 && (
                        <ul className={styles.assessmentList}>
                          {meta.assessments.map((item: unknown, idx: number) => (
                            <li key={idx}>{formatAssessment(item)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {session?.status === 'completed' && (
                  <div className={`${styles.completedPanel} ${allGoalsCompleted ? styles.completedFull : styles.completedPartial}`}>
                    <h3 className={styles.completionTitle}>
                      {allGoalsCompleted
                        ? 'Semua tujuan pembelajaran telah tercapai!'
                        : `${completedGoals} dari ${totalGoals} tujuan tercapai`}
                    </h3>
                    {!allGoalsCompleted && (
                      <p className={styles.completionSubtext}>
                        Beberapa tujuan belum sepenuhnya tercapai setelah sesi pendalaman. Tinjau kembali materi untuk memperkuat pemahaman.
                      </p>
                    )}

                    {totalGoals > 0 && (
                      <ul className={styles.completionGoalList}>
                        {goals.map((goal) => (
                          <li key={goal.id} className={goal.covered ? styles.completionGoalCovered : styles.completionGoalMissed}>
                            <span className={goal.covered ? styles.goalIconDone : styles.goalIconPending}>
                              {goal.covered ? '✓' : '✗'}
                            </span>
                            <span>{goal.description}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className={styles.completionActions}>
                      {!allGoalsCompleted && (
                        <button
                          className={styles.secondaryButton}
                          onClick={() => router.push(`/course/${courseId}`)}
                          type="button"
                        >
                          Tinjau Materi Modul
                        </button>
                      )}
                      <button
                        className={styles.primaryButton}
                        onClick={() => router.push(nextModuleHref)}
                        type="button"
                      >
                        Lanjut Modul Berikutnya
                      </button>
                    </div>
                  </div>
                )}
                {!shouldRenderComposer && session?.status !== 'completed' && (
                  <div className={styles.waitingPanel}>
                    {loading
                      ? 'Memuat instruksi berikutnya...'
                      : 'Sesi diskusi ditutup. Tunggu arahan mentor berikutnya.'}
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>
              {shouldRenderComposer && (
                <div className={styles.composerDock}>{renderComposer()}</div>
              )}
            </section>

          </div>
        </>
      )}
    </div>
  );
}
