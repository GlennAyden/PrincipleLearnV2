// src/app/course/[courseId]/layout.tsx

'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import styles from './layout.module.scss';
import { Level } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import { useLearningProgress } from '@/hooks/useLearningProgress';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { apiFetch } from '@/lib/api-client';
import ProductTour, { type TourStep } from '@/components/ProductTour/ProductTour';

const COURSE_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="sidebar"]',
    title: 'Daftar modul & subtopic',
    body:
      'Di sini tersusun seluruh perjalanan belajarmu. Modul dan subtopic terbuka bertahap — mulai dari paling atas.',
    placement: 'right',
  },
  {
    targetSelector: '[data-tour="first-module"]',
    title: 'Modul pertamamu',
    body:
      'Setiap modul punya beberapa subtopic. Klik modul untuk membuka daftar subtopic-nya.',
    placement: 'right',
  },
  {
    targetSelector: '[data-tour="first-subtopic"]',
    title: 'Mulai belajar',
    body:
      'Setiap subtopic berisi materi + alat bantu (quiz, tanya AI, challenge, refleksi). Di dalam subtopic ada tombol "?" untuk panduan fitur kapan saja.',
    placement: 'right',
  },
  {
    targetSelector: '[data-tour="discussion-item"]',
    title: 'Diskusi modul',
    body:
      'Di akhir tiap modul ada Diskusi Penutup. Terbuka setelah semua subtopic modul itu selesai (quiz + refleksi).',
    placement: 'right',
  },
];

interface Subtopic {
  title: string;
  overview: string;
  type?: string;
  isDiscussion?: boolean;
}

interface ModuleOutline {
  id: string;
  rawTitle?: string;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDiscussionPage = pathname?.includes('/discussion/');
  const { logout } = useAuth();

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [navAlert, setNavAlert] = useState<string | null>(null);
  const navAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { progress } = useLearningProgress(courseId);

  // Product tour state. Only surfaces on the course root page the first time
  // the user opens a course — the `course_tour_completed` flag guards replays.
  const isCourseRoot = pathname === `/course/${courseId}`;
  const { state: onboardingState, markCompleted: markOnboardingCompleted } =
    useOnboardingState(!!courseId);
  const [tourOpen, setTourOpen] = useState(false);
  const tourTriggeredRef = useRef(false);

  const showNavAlert = (message: string) => {
    setNavAlert(message);
    if (navAlertTimerRef.current) clearTimeout(navAlertTimerRef.current);
    navAlertTimerRef.current = setTimeout(() => setNavAlert(null), 4500);
  };

  useEffect(() => {
    async function loadCourse() {
      if (!courseId) return;
      
      setLoading(true);
      
      try {
        const response = await apiFetch(`/api/courses/${courseId}`);
        const result = await response.json();
        
        if (result.success && result.course) {
          // Transform subtopics to outline format
          const outline: ModuleOutline[] = result.course.subtopics?.map((subtopic: { id?: string; title?: string; content: string }, index: number) => {
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

  // Close mobile menu when the route changes (pathname or query)
  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname, searchParams]);

  // Auto-start the product tour once all prerequisites are met:
  //  - user is on the course root page (sidebar + first module are visible)
  //  - the course outline has loaded (tour selectors have something to target)
  //  - the user hasn't completed the tour yet (server-authoritative flag)
  //  - we haven't already triggered the tour in this session
  // We wait a short beat so React commits the sidebar markup first — without
  // this the first `getBoundingClientRect()` sometimes misses the target.
  useEffect(() => {
    if (tourTriggeredRef.current) return;
    if (!isCourseRoot) return;
    if (loading || !course?.outline?.length) return;
    if (!onboardingState) return;
    if (onboardingState.courseTourCompleted) return;

    tourTriggeredRef.current = true;
    const id = window.setTimeout(() => setTourOpen(true), 700);
    return () => window.clearTimeout(id);
  }, [isCourseRoot, loading, course, onboardingState]);

  const handleTourClose = () => {
    setTourOpen(false);
    void markOnboardingCompleted('course_tour');
  };

  const handleTourFinish = () => {
    setTourOpen(false);
    void markOnboardingCompleted('course_tour');
  };

  // `useMemo` guards against needless recomputation of the tour steps array on
  // every render — they're static, but React would otherwise compare new refs
  // in ProductTour's effect deps. Not a perf problem, just a hygiene win.
  const tourSteps = useMemo(() => COURSE_TOUR_STEPS, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('[CourseLayout] Logout failed:', error);
    }
  };

  if (loading || !course?.outline) {
    return <div className={styles.loading}>Loading outline…</div>;
  }

  return (
    <div
      className={`${styles.container} ${
        isSidebarCollapsed ? styles.sidebarCollapsedState : ''
      }`}
    >
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <button type="button" onClick={() => router.back()} className={styles.backBtn} aria-label="Go back">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>Back</span>
            </button>
            <button 
              type="button"
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
            <button type="button" className={styles.logoutBtn} onClick={handleLogout} aria-label="Logout">
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

      <div
        className={`${styles.grid} ${
          isSidebarCollapsed ? styles.gridCollapsed : ''
        }`}
      >
        {/* SIDEBAR */}
        <aside
          data-tour="sidebar"
          className={`${styles.sidebar} ${
            showMobileMenu ? styles.sidebarVisible : ''
          } ${isSidebarCollapsed ? styles.sidebarCollapsed : ''}`}
        >
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarHeaderContent}>
              <div className={styles.sidebarHeaderIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <div className={styles.sidebarHeaderText}>
                <div className={styles.coursesLabel}>Courses</div>
                <div className={styles.levelLabel}>{course.level}</div>
              </div>
            </div>
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isSidebarCollapsed ? (
                  <path d="M9 6l6 6-6 6" />
                ) : (
                  <path d="M15 6l-6 6 6 6" />
                )}
              </svg>
            </button>
          </div>

          {navAlert && (
            <div className={styles.navAlert} role="alert" aria-live="polite">
              <span className={styles.navAlertIcon} aria-hidden="true">⚠️</span>
              <span>{navAlert}</span>
              <button
                type="button"
                className={styles.navAlertClose}
                aria-label="Tutup pesan"
                onClick={() => setNavAlert(null)}
              >✕</button>
            </div>
          )}

          {course.outline.map((mod, idx) => {
            const moduleStatus = progress?.modules.find((item) => item.moduleIndex === idx);
            const moduleLocked = moduleStatus ? !moduleStatus.unlocked : false;
            const moduleLockedReason =
              moduleStatus?.discussion.reason ??
              progress?.nextRequired?.reason ??
              'Selesaikan modul sebelumnya terlebih dahulu.';

            return (
              <div key={idx} className={styles.navModule}>
                <Link
                  href={`/course/${courseId}?module=${idx}`}
                  data-tour={idx === 0 ? 'first-module' : undefined}
                  className={`${styles.navModuleTitle} ${
                    activeModule === idx ? styles.activeModule : ''
                  } ${moduleLocked ? styles.lockedNavItem : ''}`}
                  title={mod.module}
                  aria-disabled={moduleLocked}
                  onClick={(event) => {
                    if (moduleLocked) {
                      event.preventDefault();
                      showNavAlert(moduleLockedReason);
                      return;
                    }

                    closeMobileMenu();
                  }}
                >
                  <span className={styles.moduleNumber}>{idx + 1}</span>
                  <span className={styles.moduleText}>{mod.module}</span>
                </Link>

                {activeModule === idx && !isSidebarCollapsed && (
                  <ul className={styles.subList}>
                    {mod.subtopics.map((sub, j) => {
                      const rawTitle = typeof sub === 'string' ? sub : sub.title;
                      // Remove redundant numbering patterns like "2. " or "2.1 " at the beginning
                      const cleanTitle = rawTitle.replace(/^\d+\.\s*\d+\.?\s*/g, '').replace(/^\d+\.\s*/g, '');
                      const isDiscussion =
                        typeof sub === 'object' &&
                        (sub?.type === 'discussion' ||
                          sub?.isDiscussion === true ||
                          (typeof rawTitle === 'string' &&
                            rawTitle.toLowerCase().includes('diskusi penutup')));
                      const itemStatus = isDiscussion
                        ? moduleStatus?.discussion
                        : moduleStatus?.subtopics.find((item) => item.subtopicIndex === j);
                      const itemLocked = itemStatus ? !itemStatus.unlocked : moduleLocked;
                      const itemLockedReason =
                        itemStatus?.reason ??
                        moduleLockedReason ??
                        'Selesaikan langkah sebelumnya terlebih dahulu.';

                      const href = isDiscussion
                        ? (() => {
                            const params = new URLSearchParams({
                              module: String(idx),
                              subIdx: String(j),
                              scope: 'module',
                            });
                            if (mod.id) {
                              params.set('moduleId', String(mod.id));
                            }
                            if (typeof mod.module === 'string' && mod.module.trim()) {
                              params.set('title', mod.module);
                            }
                            return `/course/${courseId}/discussion/${idx}?${params.toString()}`;
                          })()
                        : `/course/${courseId}/subtopic/${idx}/0?module=${idx}&subIdx=${j}`;

                      const tourTag =
                        idx === 0 && isDiscussion
                          ? 'discussion-item'
                          : idx === 0 && j === 0 && !isDiscussion
                          ? 'first-subtopic'
                          : undefined;

                      return (
                        <li key={j}>
                          <Link
                            href={href}
                            data-tour={tourTag}
                            className={`${styles.subListItem} ${
                              j === activeSubIdx ? styles.activeSub : ''
                            } ${itemLocked ? styles.lockedNavItem : ''}`}
                            title={cleanTitle}
                            aria-disabled={itemLocked}
                            onClick={(event) => {
                              if (itemLocked) {
                                event.preventDefault();
                                showNavAlert(itemLockedReason);
                                return;
                              }

                              closeMobileMenu();
                            }}
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
            );
          })}
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
        <main
          className={`${styles.content} ${
            isDiscussionPage ? styles.discussionContent : ''
          }`}
        >
          {children}
        </main>
      </div>

      <ProductTour
        steps={tourSteps}
        open={tourOpen}
        onClose={handleTourClose}
        onFinish={handleTourFinish}
      />
    </div>
  );
}
