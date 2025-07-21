// src/app/course/[courseId]/layout.tsx

'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import styles from './layout.module.scss';
import { Level } from '@/context/RequestCourseContext';

interface Subtopic {
  title: string;
  overview: string;
}

interface ModuleOutline {
  module: string;
  subtopics: (Subtopic | string)[];
}

interface Course {
  id: string;
  title: string;
  level: Level;
  outline?: ModuleOutline[];
}

export default function CourseLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();

  // Ambil module index dari query param "?module=..."
  const moduleParam = searchParams.get('module');
  const activeModule =
    moduleParam !== null && !isNaN(Number(moduleParam))
      ? parseInt(moduleParam, 10)
      : 0;

  // Untuk highlighting sub-item (jika ada)
  const subIdxParam = searchParams.get('subIdx');
  const activeSubIdx =
    subIdxParam !== null && !isNaN(Number(subIdxParam))
      ? parseInt(subIdxParam, 10)
      : -1;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);

  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      
      setLoading(true);
      
      try {
        const response = await fetch(`/api/courses/${courseId}`);
        const result = await response.json();
        
        if (result.success && result.course) {
          // Transform subtopics to outline format
          const outline: ModuleOutline[] = result.course.subtopics?.map((subtopic: any) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch (parseError) {
              content = { module: subtopic.title, subtopics: [] };
            }
            
            return {
              module: content.module || subtopic.title || 'Module',
              subtopics: content.subtopics || []
            };
          }) || [];
          
          const courseData: Course = {
            id: result.course.id,
            title: result.course.title,
            level: result.course.difficulty_level || 'Beginner',
            outline
          };
          
          setCourse(courseData);
        }
      } catch (error) {
        console.error('[Layout] Error loading course:', error);
      } finally {
        setLoading(false);
      }
    }
    
    loadCourse();
  }, [courseId]);

  // Close mobile menu when changing routes
  useEffect(() => {
    setShowMobileMenu(false);
  }, [router]);

  const handleLogout = () => {
    router.push('/login');
  };

  if (loading || !course?.outline) {
    return <div className={styles.loading}>Loading outline…</div>;
  }

  return (
    <div className={styles.container}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <button onClick={() => router.back()} className={styles.backBtn} aria-label="Go back">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>Back</span>
            </button>
            <button 
              className={styles.mobileMenuToggle} 
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Toggle menu"
              aria-expanded={showMobileMenu}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showMobileMenu ? (
                  <path d="M18 6L6 18M6 6l12 12"/>
                ) : (
                  <>
                    <path d="M3 12h18M3 6h18M3 18h18"/>
                  </>
                )}
              </svg>
            </button>
          </div>
          
          <Link href="/dashboard" className={styles.brandContainer}>
            <svg className={styles.brandIcon} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <h1 className={styles.brand}>PrincipleLearn</h1>
          </Link>
          
          <div className={styles.headerRight}>
            <div className={styles.userLevel}>
              <span className={styles.levelBadge}>{course.level}</span>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout} aria-label="Logout">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className={styles.logoutText}>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/* SIDEBAR */}
        <aside className={`${styles.sidebar} ${showMobileMenu ? styles.sidebarVisible : ''}`}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderIcon}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <div>
              <div className={styles.coursesLabel}>Courses</div>
              <div className={styles.levelLabel}>{course.level}</div>
            </div>
          </div>

          {course.outline.map((mod, idx) => (
            <div key={idx} className={styles.navModule}>
              <Link
                href={`/course/${courseId}?module=${idx}`}
                className={`${styles.navModuleTitle} ${
                  activeModule === idx ? styles.activeModule : ''
                }`}
              >
                <span className={styles.moduleNumber}>{idx + 1}</span>
                <span className={styles.moduleText}>{mod.module}</span>
              </Link>

              {activeModule === idx && (
                <ul className={styles.subList}>
                  {mod.subtopics.map((sub, j) => {
                    const rawTitle = typeof sub === 'string' ? sub : sub.title;
                    // Remove redundant numbering patterns like "2. " or "2.1 " at the beginning
                    const cleanTitle = rawTitle.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
                    
                    return (
                      <li key={j}>
                        <Link
                          href={`/course/${courseId}/subtopic/${idx}/${j}?module=${idx}&subIdx=${j}`}
                          className={`${styles.subListItem} ${
                            j === activeSubIdx ? styles.activeSub : ''
                          }`}
                        >
                          <span className={styles.subtopicNumber}>{j + 1}</span>
                          <span className={styles.subtopicText}>{cleanTitle}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </aside>

        {/* OVERLAY FOR MOBILE */}
        {showMobileMenu && (
          <div 
            className={styles.overlay} 
            onClick={() => setShowMobileMenu(false)}
            aria-hidden="true"
          />
        )}

        {/* MAIN CONTENT */}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
