// src/app/course/[courseId]/page.tsx

'use client';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import { apiFetch } from '@/lib/api-client';
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

const PHASE_LABELS: Record<string, string> = {
  diagnosis: 'Diagnosis',
  exploration: 'Penjelasan',
  explanation: 'Penjelasan',
  practice: 'Latihan',
  synthesis: 'Konsolidasi',
  consolidation: 'Konsolidasi',
  completed: 'Selesai',
};

function getPhaseLabel(phase?: string) {
  if (!phase) return 'Belum Mulai';
  return PHASE_LABELS[phase.toLowerCase()] ?? phase;
}

function cleanTitle(value?: string) {
  if (!value) return '';
  return value.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
}

function DetailDisclosure({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`${styles.detailBlock} ${isOpen ? styles.detailBlockOpen : ''}`}>
      <button
        type="button"
        className={styles.detailToggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? 'Sembunyikan detail' : 'Lihat detail'}
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
  const isModuleScope = scope === 'module';
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<DiscussionSession | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          throw new Error('Gagal memuat status diskusi');
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
    ? 'Selesai'
    : status === 'failed'
    ? 'Gagal'
    : status === 'in_progress'
    ? 'Berlangsung'
    : locked
    ? 'Terkunci'
    : 'Siap';
  const cleanedModuleTitle = cleanTitle(moduleTitle);

  const handleNavigate = () => {
    if (locked) {
      window.alert(lockedReason || 'Selesaikan prasyarat modul terlebih dahulu.');
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
        <div className={styles.cardTitle}>Diskusi Wajib</div>
        {showCompletionBadge && (
          <span className={`${styles.discussionBadge} ${badgeClass}`}>{statusLabel}</span>
        )}
      </div>
      <DetailDisclosure>
        <p>
          {isModuleScope ? (
            <>
              Langkah wajib untuk menutup seluruh materi dalam modul{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong> lewat dialog Socratic empat
              fase. Mentor virtual akan membantu menilai capaian setiap subtopik dan memberikan
              umpan balik.
            </>
          ) : (
            <>
              Langkah wajib untuk menutup subtopik <strong>{displaySubtopicTitle}</strong> dalam modul{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong> melalui dialog Socratic empat
              fase. Mentor virtual akan mengecek capaian dan memberi umpan balik.
            </>
          )}
        </p>
        {session && (
          <p className={styles.discussionMeta}>
            Fase saat ini: <strong>{getPhaseLabel(session.phase)}</strong> •{' '}
            {completedGoals}/{learningGoals.length} tujuan tercapai
          </p>
        )}
        {error && <p className={styles.discussionError}>{error}</p>}
        {locked && (
          <p className={styles.lockedHint}>
            {lockedReason || 'Diskusi akan terbuka setelah semua prasyarat selesai.'}
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
          ? 'Terkunci'
          : status === 'idle'
          ? 'Mulai Diskusi Wajib'
          : status === 'completed'
          ? 'Lihat Ringkasan Diskusi Wajib'
          : 'Lanjutkan Diskusi Wajib'}
      </button>
    </div>
  );
}
export default function CourseOverviewPage() {
  const router = useRouter();
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
          setError('Anda tidak memiliki akses ke kursus ini');
          return;
        }
        if (response.status === 404) {
          setError('Kursus tidak ditemukan');
          return;
        }
        if (!response.ok) {
          setError('Gagal memuat kursus');
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
            setError('Course has no content available');
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
            setError('Data kursus rusak. Silakan hubungi admin atau coba membuat kursus baru.');
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
          setError(result.error || 'Failed to load course');
        }
      } catch (error) {
        console.error('[Course Page] Error loading course:', error);
        setError('Error loading course');
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
        Error: {error}{' '}
        <button onClick={() => window.location.reload()}>Coba Lagi</button>
      </div>
    );
  if (!course) return <div className={styles.loading}>Kursus tidak ditemukan</div>;
  if (!course.outline || course.outline.length === 0) {
    return (
      <div className={styles.error}>
        No course content available. <button onClick={() => window.location.reload()}>Coba Lagi</button>
      </div>
    );
  }

  // module yang sedang aktif
  const currentModule = course.outline[activeModule];
  const currentModuleProgress =
    progress?.modules.find((item) => item.moduleIndex === activeModule) ?? null;
  const progressUnavailable = Boolean(progressError && !progress);
  const progressUnavailableReason =
    'Gagal memuat progres belajar. Silakan coba lagi sebelum membuka materi atau diskusi.';
  
  // Fungsi untuk memformat overview text, mendeteksi paragraf atau lists
  const formatOverview = (text: string) => {
    // Jika tidak ada text, kembalikan pesan default
    if (!text) return <p>Ringkasan singkat subtopik akan segera tersedia.</p>;
    
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
          Pelajari konsep-konsep utama dalam modul ini dan kuasai aplikasinya.
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
              ? 'Ringkasan singkat subtopik akan segera tersedia.'
              : sub?.overview ?? 'Ringkasan singkat subtopik akan segera tersedia.';
          const subtopicKey = `${courseId}:${activeModule}:${idx}`;
          const hasGenerated = Boolean(subtopicProgress?.[subtopicKey]);
          const subtopicStatus =
            currentModuleProgress?.subtopics.find((item) => item.subtopicIndex === idx) ?? null;
          const locked = progressUnavailable || (subtopicStatus ? !subtopicStatus.unlocked : false);
          const lockedReason =
            progressUnavailable
              ? progressUnavailableReason
              : subtopicStatus?.reason ?? 'Selesaikan langkah sebelumnya terlebih dahulu.';
          const buttonLabel = locked
            ? 'Terkunci'
            : subtopicStatus?.completed
              ? 'Lihat Materi'
              : subtopicStatus?.generated || hasGenerated
                ? 'Lanjutkan Materi'
                : 'Mulai Materi';

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
                    window.alert(lockedReason);
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
