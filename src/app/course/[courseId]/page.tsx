// src/app/course/[courseId]/page.tsx

'use client';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import { apiFetch } from '@/lib/api-client';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';
import styles from './page.module.scss';
import { Level } from '@/context/RequestCourseContext';
import {
  normalizeDiscussionSession,
  type DiscussionSession,
} from '@/types/discussion';

interface SubtopicSummary {
  title: string;
  overview: string;
  type?: string;
  isDiscussion?: boolean;
}
interface ModuleOutline {
  id: string;
  rawTitle?: string;
  module: string;
  subtopics: (SubtopicSummary | string)[];
}
interface Course {
  id: string;
  title: string;
  level: Level;
  outline?: ModuleOutline[];
}

function buildPhaseLabels(t: (key: DictKey) => string): Record<string, string> {
  return {
    diagnosis: t('course_overview_phase_diagnosis'),
    exploration: t('course_overview_phase_explanation'),
    explanation: t('course_overview_phase_explanation'),
    practice: t('course_overview_phase_practice'),
    synthesis: t('course_overview_phase_consolidation'),
    consolidation: t('course_overview_phase_consolidation'),
    completed: t('course_overview_phase_completed'),
  };
}

function getPhaseLabel(
  phase: string | undefined,
  t: (key: DictKey) => string,
  phaseLabels: Record<string, string>,
) {
  if (!phase) return t('course_overview_phase_not_started');
  return phaseLabels[phase.toLowerCase()] ?? phase;
}

function cleanTitle(value?: string) {
  if (!value) return '';
  return value.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
}

function DetailDisclosure({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`${styles.detailBlock} ${isOpen ? styles.detailBlockOpen : ''}`}>
      <button
        type="button"
        className={styles.detailToggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? t('course_overview_detail_hide') : t('course_overview_detail_show')}
      </button>
      <div className={styles.cardText}>{children}</div>
    </div>
  );
}

// Skeleton loading component for course outline
const SkeletonLoading = () => {
  return (
    <div className={styles.skeletonContainer}>
      {/* Header skeleton */}
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonTitle}></div>
        <div className={styles.skeletonText}></div>
      </div>
      
      {/* Card skeletons */}
      {[1, 2, 3, 4, 5].map((_, index) => (
        <div key={index} className={styles.skeletonCard}>
          <div className={styles.skeletonCardIndex}></div>
          <div className={styles.skeletonCardTitle}></div>
          <div className={styles.skeletonLines}>
            <div className={styles.skeletonLine}></div>
            <div className={styles.skeletonLine}></div>
            <div className={styles.skeletonLine}></div>
          </div>
          <div className={styles.skeletonButton}></div>
        </div>
      ))}
    </div>
  );
};

interface DiscussionCardProps {
  courseId: string;
  moduleIndex: number;
  moduleTitle: string;
  moduleId: string;
  subtopicTitle: string;
  displaySubtopicTitle: string;
  displayIndex: number;
  scope: 'module' | 'subtopic';
  locked?: boolean;
  lockedReason?: string | null;
}

function DiscussionCard({
  courseId,
  moduleIndex,
  moduleTitle,
  moduleId,
  subtopicTitle,
  displaySubtopicTitle,
  displayIndex,
  scope,
  locked = false,
  lockedReason = null,
}: DiscussionCardProps) {
  const router = useRouter();
  const { t } = useLocale();
  const phaseLabels = buildPhaseLabels(t);
  const isModuleScope = scope === 'module';
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<DiscussionSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedAlert, setLockedAlert] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      if (!courseId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          courseId,
        });
        params.set('scope', scope);
        if (moduleId) {
          params.set('subtopicId', moduleId);
        }
        if (subtopicTitle) {
          params.set('subtopicTitle', subtopicTitle);
        }
        const res = await apiFetch(`/api/discussion/status?${params.toString()}`, {
          cache: 'no-store',
        });
        if (res.status === 404) {
          if (!cancelled) {
            setSession(null);
          }
          return;
        }
        if (!res.ok) {
          throw new Error(t('course_overview_discussion_load_error'));
        }
        const data = await res.json();
        if (!cancelled) {
          setSession(normalizeDiscussionSession(data.session ?? {}));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('[DiscussionCard] unable to load session status:', err);
          setSession(null);
          setError(err instanceof Error ? err.message : '');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [courseId, moduleId, subtopicTitle, scope]);

  const status: 'idle' | 'in_progress' | 'completed' | 'failed' = session
    ? session.status
    : 'idle';
  const showCompletionBadge = status !== 'idle';
  const badgeClass =
    status === 'completed'
      ? styles.discussionBadgeDone
      : status === 'failed'
      ? styles.discussionBadgeFailed
      : styles.discussionBadgeProgress;

  const learningGoals = session?.learningGoals ?? [];
  const completedGoals = learningGoals.filter((goal) => goal.covered).length;
  const statusLabel = status === 'completed'
    ? t('course_overview_discussion_status_completed')
    : status === 'failed'
    ? t('course_overview_discussion_status_failed')
    : status === 'in_progress'
    ? t('course_overview_discussion_status_in_progress')
    : locked
    ? t('course_overview_discussion_status_locked')
    : t('course_overview_discussion_status_ready');
  const cleanedModuleTitle = cleanTitle(moduleTitle);

  const handleNavigate = () => {
    if (locked) {
      setLockedAlert(true);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setLockedAlert(false), 4500);
      return;
    }

    const params = new URLSearchParams({
      module: String(moduleIndex),
      subIdx: String(displayIndex),
      scope,
    });
    if (moduleId) {
      params.set('moduleId', moduleId);
    }
    if (subtopicTitle) {
      params.set('title', subtopicTitle);
    }
    router.push(
      `/course/${courseId}/discussion/${moduleIndex}?${params.toString()}`
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardIndex}>
        {moduleIndex + 1}.{displayIndex + 1}
      </div>
      <div className={styles.cardTitleRow}>
        <div className={styles.cardTitle}>{t('course_overview_discussion_title')}</div>
        {showCompletionBadge && (
          <span className={`${styles.discussionBadge} ${badgeClass}`}>{statusLabel}</span>
        )}
      </div>
      <DetailDisclosure>
        <p>
          {isModuleScope ? (
            <>
              {t('course_overview_discussion_body_module_part1')}{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong>{' '}
              {t('course_overview_discussion_body_module_part2')}
            </>
          ) : (
            <>
              {t('course_overview_discussion_body_subtopic_part1')}{' '}
              <strong>{displaySubtopicTitle}</strong>{' '}
              {t('course_overview_discussion_body_subtopic_part2')}{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong>{' '}
              {t('course_overview_discussion_body_subtopic_part3')}
            </>
          )}
        </p>
        {session && (
          <p className={styles.discussionMeta}>
            {t('course_overview_discussion_phase_label')}:{' '}
            <strong>{getPhaseLabel(session.phase, t, phaseLabels)}</strong> •{' '}
            {completedGoals}/{learningGoals.length}{' '}
            {t('course_overview_discussion_goals_suffix')}
          </p>
        )}
        {error && <p className={styles.discussionError}>{error}</p>}
        {locked && (
          <p className={styles.lockedHint}>
            {lockedReason || t('course_overview_discussion_locked_default')}
          </p>
        )}
      </DetailDisclosure>
      <button
        className={`${styles.getStartedBtn} ${locked ? styles.lockedButton : ''}`}
        onClick={handleNavigate}
        disabled={loading}
        aria-disabled={locked}
      >
        {locked
          ? t('course_overview_discussion_btn_locked')
          : status === 'idle'
          ? t('course_overview_discussion_btn_start')
          : status === 'completed'
          ? t('course_overview_discussion_btn_summary')
          : t('course_overview_discussion_btn_continue')}
      </button>
      {locked && lockedAlert && (
        <div className={styles.warningBanner} role="alert" aria-live="polite">
          <span className={styles.warningBannerIcon} aria-hidden="true">⚠️</span>
          <span>{lockedReason || t('course_overview_discussion_locked_warn')}</span>
          <button
            type="button"
            className={styles.warningBannerClose}
            aria-label={t('course_overview_discussion_close_aria')}
            onClick={() => setLockedAlert(false)}
          >✕</button>
        </div>
      )}
    </div>
  );
}
export default function CourseOverviewPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();

  // Ambil module index dari query param
  const moduleParam = searchParams.get('module');
  const activeModule =
    moduleParam !== null && !isNaN(Number(moduleParam))
      ? parseInt(moduleParam, 10)
      : 0;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subtopicProgress] = useLocalStorage<Record<string, boolean>>(
    'pl_subtopic_generated',
    {}
  );
  const { progress, error: progressError } = useLearningProgress(courseId);

  // Load course from database instead of localStorage
  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      
      setLoading(true);
      setError('');
      
      try {
        console.log(`[Course Page] DEBUG: Loading course: ${courseId}`);
        console.log(`[Course Page] DEBUG: Fetching from: /api/courses/${courseId}`);
        
        const response = await apiFetch(`/api/courses/${courseId}`);
        console.log(`[Course Page] DEBUG: Response status:`, response.status);
        console.log(`[Course Page] DEBUG: Response ok:`, response.ok);

        if (response.status === 403) {
          setError(t('course_overview_error_no_access'));
          return;
        }
        if (response.status === 404) {
          setError(t('course_overview_error_not_found'));
          return;
        }
        if (!response.ok) {
          setError(t('course_overview_error_load_failed'));
          return;
        }

        const result = await response.json();
        console.log(`[Course Page] DEBUG: Response result:`, result);

        if (result.success) {
          console.log(`[Course Page] DEBUG: Processing successful response`);
          console.log(`[Course Page] DEBUG: Course data:`, result.course);
          console.log(`[Course Page] DEBUG: Subtopics count:`, result.course.subtopics?.length);
          
          // Check if subtopics exist
          if (!result.course.subtopics || !Array.isArray(result.course.subtopics)) {
            console.error(`[Course Page] ERROR: No subtopics or invalid subtopics array`);
            setError(t('course_overview_error_no_content'));
            return;
          }
          
          // Transform subtopics to outline format. We validate each
          // module's JSON shape here — previously a malformed row silently
          // degraded into an empty-children module, which surfaced as a
          // blank course page with no hint that the data was corrupted.
          console.log(`[Course Page] DEBUG: Transforming ${result.course.subtopics.length} subtopics`);

          const parseFailures: number[] = [];
          const outline: ModuleOutline[] = result.course.subtopics.map((subtopic: { id?: string; title?: string; content: string }, index: number) => {
            let content: { module?: string; subtopics?: unknown[] } | null = null;
            try {
              const parsed = JSON.parse(subtopic.content);
              if (parsed && typeof parsed === 'object' && Array.isArray(parsed.subtopics)) {
                content = parsed;
              } else {
                throw new Error('Parsed content missing subtopics array');
              }
            } catch (parseError) {
              console.error(`[Course Page] ERROR: Failed to parse subtopic ${index} content:`, parseError);
              parseFailures.push(index);
              content = { module: subtopic.title, subtopics: [] };
            }

            const moduleData: ModuleOutline = {
              id: String(subtopic.id ?? `module-${index}`),
              rawTitle: subtopic.title ?? undefined,
              module: content?.module || subtopic.title || `Module ${index + 1}`,
              subtopics: (content?.subtopics as ModuleOutline['subtopics']) || []
            };

            return moduleData;
          });

          // If every module failed to parse, treat the course as unusable
          // and bail out with a diagnostic error instead of rendering an
          // empty shell that confuses the user.
          if (parseFailures.length === result.course.subtopics.length) {
            console.error('[Course Page] All module outlines failed to parse', { parseFailures });
            setError(t('course_overview_error_corrupt'));
            return;
          }
          if (parseFailures.length > 0) {
            console.warn(`[Course Page] ${parseFailures.length} of ${result.course.subtopics.length} modules failed to parse — showing partial outline`, { parseFailures });
          }
          
          console.log(`[Course Page] DEBUG: Final outline:`, outline);
          
          const courseData: Course = {
            id: result.course.id,
            title: result.course.title,
            level: result.course.difficulty_level || 'Beginner',
            outline
          };
          
          console.log(`[Course Page] DEBUG: Final course data:`, courseData);
          
          setCourse(courseData);
          console.log(`[Course Page] SUCCESS: Course loaded with ${outline.length} modules`);
          
        } else {
          console.error('[Course Page] Failed to load course:', result.error);
          setError(result.error || t('course_overview_error_generic'));
        }
      } catch (error) {
        console.error('[Course Page] Error loading course:', error);
        setError(t('course_overview_error_loading'));
      } finally {
        setLoading(false);
      }
    }
    
    loadCourse();
  }, [courseId]);

  if (loading) return <SkeletonLoading />;
  if (error)
    return (
      <div className={styles.error}>
        {t('course_overview_error_prefix')}: {error}{' '}
        <button onClick={() => window.location.reload()}>{t('course_overview_retry')}</button>
      </div>
    );
  if (!course) return <div className={styles.loading}>{t('course_overview_loading')}</div>;
  if (!course.outline || course.outline.length === 0) {
    return (
      <div className={styles.error}>
        {t('course_overview_error_no_outline')} <button onClick={() => window.location.reload()}>{t('course_overview_retry')}</button>
      </div>
    );
  }

  // module yang sedang aktif
  const currentModule = course.outline[activeModule];
  const currentModuleProgress =
    progress?.modules.find((item) => item.moduleIndex === activeModule) ?? null;
  const progressUnavailable = Boolean(progressError && !progress);
  const progressUnavailableReason = t('course_overview_progress_unavailable');
  
  // Fungsi untuk memformat overview text, mendeteksi paragraf atau lists
  const formatOverview = (text: string) => {
    // Jika tidak ada text, kembalikan pesan default
    if (!text) return <p>{t('course_overview_summary_placeholder')}</p>;
    
    // Memisahkan teks menjadi paragraf berdasarkan baris baru
    const paragraphs = text.split(/\n+/);
    
    return (
      <>
        {paragraphs.map((paragraph, i) => {
          // Jika paragraf terlihat seperti list item (diawali dengan - atau *)
          if (paragraph.trim().match(/^[-*•]/) || paragraph.trim().match(/^\d+\./)) {
            const listItems = paragraph.split(/\n[-*•]\s*/g).filter(Boolean);
            return (
              <ul key={i}>
                {listItems.map((item, j) => (
                  <li key={j}>{item.replace(/^[-*•]\s*/, '')}</li>
                ))}
              </ul>
            );
          }
          // Jika paragraf biasa
          return <p key={i}>{paragraph}</p>;
        })}
      </>
    );
  };

  return (
    <>
      {/* header dengan judul & deskripsi */}
      <div className={styles.headerOverview}>
        <h1 className={styles.topicHeading}>
          {activeModule + 1}. {currentModule.module}
        </h1>
        <p className={styles.topicDescription}>
          {t('course_overview_description')}
        </p>
      </div>

      {/* daftar kartu subtopik */}
      <div className={styles.cardsContainer}>
        {currentModule.subtopics.map((sub, idx) => {
          const isDiscussion =
            typeof sub === 'object' &&
            (sub?.type === 'discussion' || sub?.isDiscussion === true);

          if (isDiscussion) {
            const moduleScopeTitle = currentModule.module;
            const discussionDisplay = `Seluruh materi modul ${
              cleanTitle(moduleScopeTitle) || moduleScopeTitle
            }`;
            return (
              <DiscussionCard
                key={`discussion-${idx}`}
                courseId={courseId}
                moduleIndex={activeModule}
                moduleTitle={moduleScopeTitle}
                moduleId={currentModule.id}
                subtopicTitle={moduleScopeTitle}
                displaySubtopicTitle={discussionDisplay}
                displayIndex={idx}
                scope="module"
                locked={
                  progressUnavailable ||
                  (currentModuleProgress?.discussion
                    ? !currentModuleProgress.discussion.unlocked
                    : false)
                }
                lockedReason={
                  progressUnavailable
                    ? progressUnavailableReason
                    : currentModuleProgress?.discussion.reason ?? null
                }
              />
            );
          }

          const rawTitle = typeof sub === 'string' ? sub : sub?.title ?? '';
          const title = cleanTitle(rawTitle);
          const overview =
            typeof sub === 'string'
              ? t('course_overview_summary_placeholder')
              : sub?.overview ?? t('course_overview_summary_placeholder');
          const subtopicKey = `${courseId}:${activeModule}:${idx}`;
          const hasGenerated = Boolean(subtopicProgress?.[subtopicKey]);
          const subtopicStatus =
            currentModuleProgress?.subtopics.find((item) => item.subtopicIndex === idx) ?? null;
          const locked = progressUnavailable || (subtopicStatus ? !subtopicStatus.unlocked : false);
          const lockedReason =
            progressUnavailable
              ? progressUnavailableReason
              : subtopicStatus?.reason ?? t('course_overview_locked_default');
          const buttonLabel = locked
            ? t('course_overview_button_locked')
            : subtopicStatus?.completed
              ? t('course_overview_button_view')
              : subtopicStatus?.generated || hasGenerated
                ? t('course_overview_button_continue')
                : t('course_overview_button_start');

          return (
            <div key={idx} className={styles.card}>
              <div className={styles.cardIndex}>
                {activeModule + 1}.{idx + 1}
              </div>
              <div className={styles.cardTitle}>{title}</div>
              <DetailDisclosure>{formatOverview(overview)}</DetailDisclosure>
              <button
                className={`${styles.getStartedBtn} ${locked ? styles.lockedButton : ''}`}
                aria-disabled={locked}
                onClick={() => {
                  if (locked) {
                    return;
                  }
                  router.push(
                    `/course/${courseId}/subtopic/${activeModule}/0?module=${activeModule}&subIdx=${idx}`
                  );
                }}
              >
                {buttonLabel}
              </button>
              {locked && <p className={styles.lockedHint}>{lockedReason}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
