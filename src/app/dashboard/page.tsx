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
  const [courses, setCourses] = useLocalStorage<Course[]>('pl_courses', []);

  // pastikan hanya render setelah mount & ada user
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.replace('/login');
    }
  }, [mounted, user, router]);

  if (!mounted || !user) return null;

  const handleLogout = () => {
    removeUser();
    router.replace('/login');
  };

  const handleDelete = (id: string) => {
    // hapus course dari array dan simpan ulang ke localStorage
    setCourses(courses.filter(c => c.id !== id));
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
        {courses.length > 0 ? (
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
