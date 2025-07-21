// File: src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import styles from './page.module.scss';

type Level = 'Beginner' | 'Intermediate' | 'Advance';

interface Course {
  id:    string;
  title: string;
  level: Level;
}

export default function DashboardPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, , removeUser] = useLocalStorage<{ email: string } | null>('pl_user', null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // pastikan hanya render setelah mount & ada user
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.replace('/login');
    }
  }, [mounted, user, router]);

  // Load courses from database
  useEffect(() => {
    const loadCourses = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }
      
      try {
        console.log('[Dashboard] Loading courses from database');
        
        const response = await fetch(`/api/courses?userId=${encodeURIComponent(user.email)}`);
        const result = await response.json();
        
        if (result.success) {
          setCourses(result.courses);
          console.log(`[Dashboard] Loaded ${result.courses.length} courses`);
        } else {
          console.error('[Dashboard] Failed to load courses:', result.error);
        }
      } catch (error) {
        console.error('[Dashboard] Error loading courses:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (mounted && user) {
      loadCourses();
    }
  }, [mounted, user]);

  if (!mounted || !user) return null;

  const handleLogout = () => {
    removeUser();
    router.replace('/login');
  };

  const handleDelete = async (id: string) => {
    try {
      console.log(`[Dashboard] Deleting course: ${id}`);
      
      // Delete from database first
      const response = await fetch(`/api/courses/${id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (!result.success) {
        console.error('[Dashboard] Failed to delete course from database:', result.error);
        alert('Failed to delete course: ' + result.error);
        return;
      }
      
      console.log('[Dashboard] Course deleted from database successfully');
      
      // Then remove from localStorage
      setCourses(courses.filter(c => c.id !== id));
      
      console.log('[Dashboard] Course removed from localStorage');
      
    } catch (error) {
      console.error('[Dashboard] Error deleting course:', error);
      alert('Error deleting course: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  return (
    <div className={styles.container}>
      {/* Header dengan nama aplikasi + tombol Log out */}
      <header className={styles.header}>
        <div className={styles.appName}>PrincipleLearn</div>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          Log out
        </button>
      </header>

      {/* Bar aksi: Judul + Create New */}
      <div className={styles.actionsBar}>
        <h2 className={styles.pageTitle}>My Courses</h2>
        <button
          className={styles.createBtn}
          onClick={() => router.push('/request-course/step1')}
        >
          Create New
        </button>
      </div>

      {/* Daftar course */}
      <ul className={styles.list}>
        {loading ? (
          <p className={styles.empty}>Loading courses...</p>
        ) : courses.length > 0 ? (
          courses.map(course => (
            <li key={course.id} className={styles.listItem}>
              {/* Card untuk navigasi ke detail course */}
              <div
                className={styles.card}
                onClick={() => router.push(`/course/${course.id}`)}
              >
                <div className={styles.accent} />
                <div className={styles.cardContent}>
                  <p className={styles.level}>{course.level}</p>
                  <p className={styles.title}>{course.title}</p>
                </div>
              </div>

              {/* Tombol Delete */}
              <button
                className={styles.deleteBtn}
                onClick={e => {
                  e.stopPropagation();       // cegah klik card
                  handleDelete(course.id);   // hapus course
                }}
              >
                <span className={styles.icon}>🗑</span>
                <span className={styles.deleteLabel}>Delete</span>
              </button>
            </li>
          ))
        ) : (
          <p className={styles.empty}>
            You have no courses yet. Click “Create New” to start.
          </p>
        )}
      </ul>
    </div>
  );
}
