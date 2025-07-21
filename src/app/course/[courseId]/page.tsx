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
  module: string;
  subtopics: (SubtopicSummary | string)[];
}
interface Course {
  id: string;
  title: string;
  level: Level;
  outline?: ModuleOutline[];
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

  // Load course from database instead of localStorage
  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      
      setLoading(true);
      setError('');
      
      try {
        console.log(`[Course Page] Loading course: ${courseId}`);
        
        const response = await fetch(`/api/courses/${courseId}`);
        const result = await response.json();
        
        if (result.success) {
          // Transform subtopics to outline format
          const outline: ModuleOutline[] = result.course.subtopics.map((subtopic: any, index: number) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch {
              content = { module: subtopic.title, subtopics: [] };
            }
            
            return {
              module: content.module || subtopic.title || `Module ${index + 1}`,
              subtopics: content.subtopics || []
            };
          });
          
          const courseData: Course = {
            id: result.course.id,
            title: result.course.title,
            level: result.course.difficulty_level || 'Beginner',
            outline
          };
          
          setCourse(courseData);
          console.log(`[Course Page] Course loaded with ${outline.length} modules`);
          
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
          const rawTitle = typeof sub === 'string' ? sub : sub.title;
          // Remove redundant numbering patterns like "2. " or "2.1 " at the beginning
          const title = rawTitle.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
          const overview =
            typeof sub === 'string'
              ? 'Ringkasan singkat subtopik akan segera tersedia.'
              : sub.overview;

          return (
            <div key={idx} className={styles.card}>
              <div className={styles.cardIndex}>
                {activeModule + 1}.{idx + 1}
              </div>
              <div className={styles.cardTitle}>{title}</div>
              <div className={styles.cardText}>
                {formatOverview(overview)}
              </div>
              <button
                className={styles.getStartedBtn}
                onClick={() =>
                  router.push(
                    `/course/${courseId}/subtopic/${activeModule}/${idx}?module=${activeModule}&subIdx=${idx}`
                  )
                }
              >
                Get Started
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
