// src/app/admin/about/page.tsx
import Image from 'next/image';
import styles from './page.module.scss';

const DIAGRAMS: { file: string; alt: string; caption: string }[] = [
  {
    file: '/diagrams/diagram_01.png',
    alt: 'Diagram arsitektur sistem PrincipleLearn',
    caption: 'Diagram 1 — Arsitektur Sistem Keseluruhan',
  },
  {
    file: '/diagrams/diagram_02.png',
    alt: 'Diagram alur autentikasi dan keamanan',
    caption: 'Diagram 2 — Alur Autentikasi & Keamanan',
  },
  {
    file: '/diagrams/diagram_03.png',
    alt: 'Diagram pipeline penelitian RM2 dan RM3',
    caption: 'Diagram 3 — Pipeline Riset (RM2 & RM3)',
  },
  {
    file: '/diagrams/diagram_04.png',
    alt: 'Diagram alur mode pembelajaran',
    caption: 'Diagram 4 — Alur Mode Pembelajaran',
  },
];

const STACK: { name: string; description: string }[] = [
  { name: 'Next.js 15 (App Router)', description: 'Framework React fullstack dengan SSR & streaming' },
  { name: 'React 19', description: 'Library UI dengan Server Components & hooks terbaru' },
  { name: 'TypeScript (strict)', description: 'Type safety menyeluruh di seluruh codebase' },
  { name: 'Supabase (PostgreSQL)', description: 'Database relasional dengan RLS & auth built-in' },
  { name: 'OpenAI API (GPT)', description: 'Model bahasa untuk generasi konten, Q&A, dan skoring' },
  { name: 'Sass Modules', description: 'Scoped styling per-komponen tanpa konflik global' },
  { name: 'Vercel (sin1)', description: 'Platform deployment dengan edge functions & streaming SSE' },
  { name: 'Jest + Playwright', description: 'Unit testing dan E2E automation untuk regression guard' },
];

const DB_GROUPS: { label: string; tables: string[] }[] = [
  {
    label: 'Identitas & Onboarding',
    tables: ['users', 'learning_profiles', 'onboarding_state', 'prompt_revisions'],
  },
  {
    label: 'Konten Kursus',
    tables: [
      'courses',
      'subtopics',
      'leaf_subtopics',
      'subtopic_cache',
      'course_generation_activity',
      'example_usage_events',
    ],
  },
  {
    label: 'Aktivitas Belajar',
    tables: [
      'quiz',
      'quiz_submissions',
      'jurnal',
      'transcript',
      'transcript_integrity_quarantine',
      'user_progress',
      'learning_sessions',
      'feedback',
      'ask_question_history',
      'challenge_responses',
    ],
  },
  {
    label: 'Modul Diskusi',
    tables: [
      'discussion_sessions',
      'discussion_messages',
      'discussion_templates',
      'discussion_assessments',
      'discussion_admin_actions',
    ],
  },
  {
    label: 'Pipeline Riset (RM2 & RM3)',
    tables: [
      'prompt_classifications',
      'cognitive_indicators',
      'auto_cognitive_scores',
      'research_evidence_items',
      'research_auto_coding_runs',
      'triangulation_records',
      'inter_rater_reliability',
    ],
  },
  {
    label: 'Infrastruktur',
    tables: ['api_logs', 'rate_limits'],
  },
];

export default function AdminAboutPage() {
  return (
    <div className={styles.page}>
      {/* ── Section 1: Tentang ─────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>📋</span>
          <h1 className={styles.sectionTitle}>Tentang PrincipleLearn</h1>
        </div>
        <div className={styles.card}>
          <p className={styles.overview}>
            <strong>PrincipleLearn V3</strong> adalah Learning Management System berbasis AI yang
            dikembangkan sebagai media pembelajaran dalam penelitian tesis Magister. Sistem ini
            mengintegrasikan model bahasa generatif (OpenAI GPT) untuk mendukung pembelajaran
            berpikir kritis dan komputasional (CT/CTH) pada siswa Informatika kelas X. Terdapat dua
            mode operasional: <em>Mode Umum</em> untuk pembelajaran bebas dan{' '}
            <em>Mode Penelitian</em> untuk sesi data terstruktur dengan pipeline RM2 (klasifikasi
            prompt Bloom) dan RM3 (skoring kognitif otomatis).
          </p>
          <div className={styles.versionBadge}>
            <span className={styles.versionLabel}>Versi</span>
            <span className={styles.versionValue}>0.2.0</span>
          </div>
        </div>
      </section>

      {/* ── Section 2: Arsitektur ──────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🏗️</span>
          <h2 className={styles.sectionTitle}>Arsitektur Sistem</h2>
        </div>
        <div className={styles.diagramGrid}>
          {DIAGRAMS.map((d) => (
            <figure key={d.file} className={styles.diagramCard}>
              <div className={styles.diagramImageWrapper}>
                <Image
                  src={d.file}
                  alt={d.alt}
                  width={900}
                  height={600}
                  className={styles.diagramImage}
                  unoptimized
                />
              </div>
              <figcaption className={styles.diagramCaption}>{d.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Section 3: Stack Teknologi ─────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>⚙️</span>
          <h2 className={styles.sectionTitle}>Stack Teknologi</h2>
        </div>
        <div className={styles.stackGrid}>
          {STACK.map((item) => (
            <div key={item.name} className={styles.stackCard}>
              <div className={styles.stackName}>{item.name}</div>
              <div className={styles.stackDesc}>{item.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Tabel Database ──────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🗄️</span>
          <h2 className={styles.sectionTitle}>Tabel Database</h2>
          <span className={styles.tableCount}>35 tabel publik</span>
        </div>
        <div className={styles.dbGrid}>
          {DB_GROUPS.map((group) => (
            <div key={group.label} className={styles.dbGroup}>
              <div className={styles.dbGroupLabel}>{group.label}</div>
              <ul className={styles.dbList}>
                {group.tables.map((tbl) => (
                  <li key={tbl} className={styles.dbItem}>
                    <code className={styles.dbCode}>{tbl}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
