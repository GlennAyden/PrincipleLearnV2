// src/app/course/[courseId]/page.tsx

'use client';

import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import styles from './page.module.scss';
import { Level } from '@/context/RequestCourseContext';

interface SubtopicSummary {
  title: string;
  overview: string;
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

type DiscussionPhase =
  | 'diagnosis'
  | 'exploration'
  | 'explanation'
  | 'practice'
  | 'synthesis'
  | 'consolidation'
  | 'completed';

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
}: DiscussionCardProps) {
  const router = useRouter();
  const isModuleScope = scope === 'module';
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{
    id: string;
    status: 'in_progress' | 'completed';
    phase: string;
    learningGoals: Array<{ id: string; description: string; covered: boolean }>;
  } | null>(null);
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
        const res = await fetch(`/api/discussion/history?${params.toString()}`, {
          credentials: 'include',
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
          setSession({
            id: data.session.id,
            status: data.session.status === 'completed' ? 'completed' : 'in_progress',
            phase: data.session.phase,
            learningGoals: Array.isArray(data.session.learningGoals)
              ? data.session.learningGoals
              : [],
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('[DiscussionCard] unable to load session status:', err);
          setSession(null);
          setError(err?.message ?? '');
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

  const status: 'idle' | 'in_progress' | 'completed' = session
    ? session.status
    : 'idle';
  const showCompletionBadge = status === 'completed';
  const badgeClass = showCompletionBadge ? styles.discussionBadgeDone : '';

  const learningGoals = session?.learningGoals ?? [];
  const completedGoals = learningGoals.filter((goal) => goal.covered).length;
  const cleanedModuleTitle = cleanTitle(moduleTitle);

  const handleNavigate = () => {
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
        <div className={styles.cardTitle}>Diskusi Penutup</div>
        {showCompletionBadge && (
          <span className={`${styles.discussionBadge} ${badgeClass}`}>Selesai</span>
        )}
      </div>
      <div className={styles.cardText}>
        <p>
          {isModuleScope ? (
            <>
              Rekap seluruh materi dalam modul{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong> lewat dialog Socratic empat
              fase. Mentor virtual akan membantu menilai capaian setiap subtopik dan memberikan
              umpan balik.
            </>
          ) : (
            <>
              Tutup subtopik <strong>{displaySubtopicTitle}</strong> dalam modul{' '}
              <strong>{cleanedModuleTitle || moduleTitle}</strong> melalui dialog Socratic empat
              fase. Mentor virtual akan mengecek capaian dan memberi umpan balik.
            </>
          )}
        </p>
        {session && (
          <p className={styles.discussionMeta}>
            Fase saat ini: <strong>{getPhaseLabel(session.phase)}</strong> •{' '}
            {completedGoals}/{learningGoals.length} goals tercapai
          </p>
        )}
        {error && <p className={styles.discussionError}>{error}</p>}
      </div>
      <button
        className={styles.getStartedBtn}
        onClick={handleNavigate}
        disabled={loading}
      >
        {status === 'idle'
          ? 'Mulai Diskusi'
          : status === 'completed'
          ? 'Lihat Ringkasan Diskusi'
          : 'Lanjutkan Diskusi'}
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

  // Load course from database instead of localStorage
  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      
      setLoading(true);
      setError('');
      
      try {
        console.log(`[Course Page] DEBUG: Loading course: ${courseId}`);
        console.log(`[Course Page] DEBUG: Fetching from: /api/courses/${courseId}`);
        
        const response = await fetch(`/api/courses/${courseId}`);
        console.log(`[Course Page] DEBUG: Response status:`, response.status);
        console.log(`[Course Page] DEBUG: Response ok:`, response.ok);
        
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
          
          // Transform subtopics to outline format
          console.log(`[Course Page] DEBUG: Transforming ${result.course.subtopics.length} subtopics`);
          const outline: ModuleOutline[] = result.course.subtopics.map((subtopic: any, index: number) => {
            console.log(`[Course Page] DEBUG: Processing subtopic ${index}:`, subtopic);
            
            let content;
            try {
              content = JSON.parse(subtopic.content);
              console.log(`[Course Page] DEBUG: Parsed content for subtopic ${index}:`, content);
            } catch (parseError) {
              console.error(`[Course Page] ERROR: Failed to parse subtopic ${index} content:`, parseError);
              content = { module: subtopic.title, subtopics: [] };
            }
            
            const moduleData: ModuleOutline = {
              id: String(subtopic.id ?? `module-${index}`),
              rawTitle: subtopic.title ?? undefined,
              module: content.module || subtopic.title || `Module ${index + 1}`,
              subtopics: content.subtopics || []
            };
            
            console.log(`[Course Page] DEBUG: Module data ${index}:`, moduleData);
            return moduleData;
          });
          
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
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  if (!course) return <div className={styles.loading}>Course not found</div>;
  if (!course.outline || course.outline.length === 0) {
    return (
      <div className={styles.error}>
        No course content available. <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // module yang sedang aktif
  const currentModule = course.outline[activeModule];
  
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
          const buttonLabel = hasGenerated ? 'Lanjutkan Materi' : 'Mulai Materi';

          return (
            <div key={idx} className={styles.card}>
              <div className={styles.cardIndex}>
                {activeModule + 1}.{idx + 1}
              </div>
              <div className={styles.cardTitle}>{title}</div>
              <div className={styles.cardText}>{formatOverview(overview)}</div>
              <button
                className={styles.getStartedBtn}
                onClick={() =>
                  router.push(
                    `/course/${courseId}/subtopic/${activeModule}/0?module=${activeModule}&subIdx=${idx}`
                  )
                }
              >
                {buttonLabel}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
