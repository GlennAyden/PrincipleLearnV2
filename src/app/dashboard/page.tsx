// File: src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import styles from './page.module.scss';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

interface Course {
  id:    string;
  title: string;
  level: Level;
}

const levelConfig: Record<Level, { color: string; icon: string }> = {
  Beginner:     { color: 'green',  icon: '🌱' },
  Intermediate: { color: 'blue',   icon: '📚' },
  Advanced:     { color: 'purple', icon: '🚀' },
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const loadCourses = async () => {
      if (!user?.id || authLoading) {
        setLoading(false);
        return;
      }
      try {
        setLoadError(null);
        const response = await apiFetch('/api/courses');
        const result = await response.json();
        if (result.success) {
          setCourses(result.courses);
        } else {
          setLoadError(result.error || 'Gagal memuat kursus');
        }
      } catch (error) {
        console.error('[Dashboard] Error loading courses:', error);
        setLoadError(error instanceof Error ? error.message : 'Gagal memuat kursus. Periksa koneksi Anda.');
      } finally {
        setLoading(false);
      }
    };
    if (user && !authLoading) loadCourses();
  }, [user, authLoading]);

  if (authLoading) return (
    <div className={styles.loadingPage}>
      <div className={styles.loadingSpinner} />
      <p>Memuat...</p>
    </div>
  );
  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      alert('Gagal keluar: ' + (error instanceof Error ? error.message : 'Kesalahan tidak diketahui'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await apiFetch(`/api/courses/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) {
        alert('Gagal menghapus kursus: ' + result.error);
        return;
      }
      setCourses(courses.filter(c => c.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      alert('Error menghapus kursus: ' + (error instanceof Error ? error.message : 'Error tidak diketahui'));
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Selamat Pagi';
    if (hour < 17) return 'Selamat Siang';
    return 'Selamat Malam';
  };

  const userName = user?.name || user?.email?.split('@')[0] || 'Learner';

  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.logoGroup}>
            <div className={styles.logoIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="url(#dashLogoGrad)" />
                <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="dashLogoGrad" x1="0" y1="0" x2="28" y2="28">
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#1d4ed8" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.logoText}>PrincipleLearn</span>
          </Link>

          <div className={styles.headerRight}>
            <div className={styles.userBadge}>
              <div className={styles.avatar}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6.75 15.75H3.75C3.35 15.75 3 15.4 3 15V3C3 2.6 3.35 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 12.75L15 9.75L12 6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 9.75H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Greeting */}
        <div className={styles.greetingSection}>
          <div>
            <h1 className={styles.greeting}>
              {greeting()}, <span className={styles.greetingName}>{userName}</span> 👋
            </h1>
            <p className={styles.greetingSub}>
              {courses.length > 0
                ? `${courses.length} kursus sedang berjalan`
                : 'Siap memulai perjalanan belajarmu?'
              }
            </p>
          </div>
          <button
            className={styles.createBtn}
            onClick={() => router.push('/request-course/step1')}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 3V15M3 9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Buat Kursus
          </button>
        </div>

        {/* Course Grid */}
        <section className={styles.courseSection}>
          <h2 className={styles.sectionTitle}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <rect x="11" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="12" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <rect x="11" y="12" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            Kursus Saya
          </h2>

          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <p>Memuat kursus...</p>
            </div>
          ) : loadError ? (
            <div className={styles.errorState}>
              <div className={styles.errorIcon}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
                  <path d="M24 16V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="24" cy="33" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <h3>Gagal memuat kursus</h3>
              <p>{loadError}</p>
              <button
                className={styles.retryBtn}
                onClick={() => window.location.reload()}
              >
                Coba Lagi
              </button>
            </div>
          ) : courses.length > 0 ? (
            <div className={styles.courseGrid}>
              {courses.map((course, index) => {
                const config = levelConfig[course.level] || levelConfig.Beginner;
                return (
                  <div
                    key={course.id}
                    className={styles.courseCard}
                    style={{ animationDelay: `${index * 0.08}s` }}
                  >
                    {/* Card top accent */}
                    <div className={styles.cardAccent} data-color={config.color} />

                    <div className={styles.cardBody}>
                      <div className={styles.cardHeader}>
                        <span className={styles.levelBadge} data-color={config.color}>
                          {config.icon} {course.level}
                        </span>
                        <button
                          className={styles.deleteIcon}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(deleteConfirm === course.id ? null : course.id);
                          }}
                          aria-label="Hapus kursus"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="4" r="1" fill="currentColor" />
                            <circle cx="8" cy="8" r="1" fill="currentColor" />
                            <circle cx="8" cy="12" r="1" fill="currentColor" />
                          </svg>
                        </button>
                      </div>

                      <h3
                        className={styles.courseTitle}
                        onClick={() => router.push(`/course/${course.id}`)}
                      >
                        {course.title}
                      </h3>

                      <div className={styles.cardFooter}>
                        <button
                          className={styles.continueBtn}
                          onClick={() => router.push(`/course/${course.id}`)}
                        >
                          Lanjut Belajar
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7H11M11 7L8 4M11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Delete confirmation */}
                    {deleteConfirm === course.id && (
                      <div className={styles.deleteOverlay}>
                        <p>Hapus kursus ini?</p>
                        <div className={styles.deleteActions}>
                          <button
                            className={styles.confirmDelete}
                            onClick={(e) => { e.stopPropagation(); handleDelete(course.id); }}
                          >
                            Hapus
                          </button>
                          <button
                            className={styles.cancelDelete}
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <rect x="8" y="12" width="48" height="40" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M8 24H56" stroke="currentColor" strokeWidth="2" />
                  <circle cx="16" cy="18" r="2" fill="currentColor" />
                  <circle cx="22" cy="18" r="2" fill="currentColor" />
                  <circle cx="28" cy="18" r="2" fill="currentColor" />
                  <path d="M24 36H40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M28 42H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Belum ada kursus</h3>
              <p>Buat kursus pertamamu dengan AI dan mulai belajar</p>
              <button
                className={styles.emptyCreateBtn}
                onClick={() => router.push('/request-course/step1')}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 3V15M3 9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Buat Kursus Pertamamu
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
