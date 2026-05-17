'use client';
// src/app/request-course/preview/page.tsx
//
// A2 — Outline preview & edit step.
// Loaded after step3 calls /api/generate-outline.  User can:
//   - Edit subtopic titles and summaries inline
//   - Delete subtopics
//   - Add a blank subtopic per module
//   - Approve → calls /api/generate-course with the edited outline
//   - Regenerate → calls /api/generate-outline again with variation header

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/context/LocaleContext';
import { apiFetch } from '@/lib/api-client';
import type { OutlineModule, OutlineSubtopic } from '@/app/api/generate-outline/route';
import styles from './page.module.scss';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface EditableSubtopic extends OutlineSubtopic {
  _id: string; // transient client-side key for list stability
}

interface EditableModule {
  module: string;
  subtopics: EditableSubtopic[];
}

// --------------------------------------------------------------------------
// Session storage key — written by step3, read here
// --------------------------------------------------------------------------

const OUTLINE_SS_KEY = 'requestCourseOutline';

function saveOutlineToSession(outline: OutlineModule[]) {
  try {
    sessionStorage.setItem(OUTLINE_SS_KEY, JSON.stringify(outline));
  } catch {
    // ignore
  }
}

function loadOutlineFromSession(): OutlineModule[] | null {
  try {
    const raw = sessionStorage.getItem(OUTLINE_SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OutlineModule[];
  } catch {
    return null;
  }
}

function clearOutlineSession() {
  try {
    sessionStorage.removeItem(OUTLINE_SS_KEY);
  } catch {
    // ignore
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

let _uid = 0;
function uid(): string {
  return `sub_${++_uid}_${Date.now()}`;
}

function toEditable(modules: OutlineModule[]): EditableModule[] {
  return modules.map((mod) => ({
    module: mod.module,
    subtopics: mod.subtopics.map((s) => ({ ...s, _id: uid() })),
  }));
}

function fromEditable(modules: EditableModule[]): OutlineModule[] {
  return modules.map((mod) => ({
    module: mod.module,
    subtopics: mod.subtopics.map(({ _id: _discard, ...rest }) => rest),
  }));
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function PreviewOutlinePage() {
  const router = useRouter();
  const { answers } = useRequestCourse();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useLocale();

  const [modules, setModules] = useState<EditableModule[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'approving' | 'regenerating'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  // Track which subtopic field is being edited: `${modIdx}:${subIdx}:title|summary`
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // On mount: load outline from sessionStorage or fetch if missing
  // ------------------------------------------------------------------

  const fetchOutline = useCallback(async (variation = false) => {
    if (!answers.topic || !answers.goal) {
      router.replace('/request-course/step1');
      return;
    }
    setStatus(variation ? 'regenerating' : 'loading');
    setErrorMsg('');
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (variation) headers['x-outline-variation'] = '1';

      const res = await apiFetch('/api/generate-outline', {
        method: 'POST',
        headers,
        body: JSON.stringify(answers),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      const outline: OutlineModule[] = data.outline ?? [];
      saveOutlineToSession(outline);
      setModules(toEditable(outline));
      setStatus('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('request_course_preview_error_title'));
      setStatus('error');
    }
  }, [answers, router, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const stored = loadOutlineFromSession();
    if (stored && stored.length > 0) {
      setModules(toEditable(stored));
      setStatus('ready');
    } else {
      fetchOutline(false);
    }
  }, [authLoading, isAuthenticated]);

  // ------------------------------------------------------------------
  // Editing helpers
  // ------------------------------------------------------------------

  const updateSubtopicTitle = (modIdx: number, subIdx: number, value: string) => {
    setModules((prev) => prev.map((m, mi) =>
      mi !== modIdx ? m : {
        ...m,
        subtopics: m.subtopics.map((s, si) =>
          si !== subIdx ? s : { ...s, title: value }
        ),
      }
    ));
  };

  const updateSubtopicSummary = (modIdx: number, subIdx: number, value: string) => {
    setModules((prev) => prev.map((m, mi) =>
      mi !== modIdx ? m : {
        ...m,
        subtopics: m.subtopics.map((s, si) =>
          si !== subIdx ? s : { ...s, summary: value }
        ),
      }
    ));
  };

  const deleteSubtopic = (modIdx: number, subIdx: number) => {
    setModules((prev) => prev.map((m, mi) =>
      mi !== modIdx ? m : {
        ...m,
        subtopics: m.subtopics.filter((_, si) => si !== subIdx),
      }
    ));
  };

  const addSubtopic = (modIdx: number) => {
    const newSub: EditableSubtopic = { title: '', summary: '', _id: uid() };
    setModules((prev) => prev.map((m, mi) =>
      mi !== modIdx ? m : { ...m, subtopics: [...m.subtopics, newSub] }
    ));
    // Auto-focus the new title field
    setEditingKey(`${modIdx}:${modules[modIdx].subtopics.length}:title`);
  };

  // ------------------------------------------------------------------
  // Approve — call /api/generate-course with the edited outline
  // ------------------------------------------------------------------

  const handleApprove = async () => {
    setStatus('approving');
    clearOutlineSession();

    const providedOutline = fromEditable(modules);

    try {
      const res = await apiFetch('/api/generate-course', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({ ...answers, providedOutline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);

      router.push(data.courseId ? `/course/${data.courseId}` : '/dashboard');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('request_course_preview_error_title'));
      setStatus('ready');
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (authLoading || status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.bgOrb1} />
        <div className={styles.bgOrb2} />
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
          <p>{t('request_course_preview_loading')}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.bgOrb1} />
        <div className={styles.bgOrb2} />
        <div className={styles.errorState}>
          <p className={styles.errorMsg}>{errorMsg || t('request_course_preview_error_title')}</p>
          <button className={styles.retryBtn} onClick={() => fetchOutline(false)}>
            {t('request_course_preview_error_retry')}
          </button>
          <Link href="/request-course/step3" className={styles.backLink}>
            {t('request_course_preview_back')}
          </Link>
        </div>
      </div>
    );
  }

  const isApproving = status === 'approving';
  const isRegenerating = status === 'regenerating';
  const isBusy = isApproving || isRegenerating;

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      {/* Top nav */}
      <div className={styles.topNav}>
        <Link href="/request-course/step3" className={styles.backLink}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('request_course_preview_back')}
        </Link>
        <button
          className={styles.regenerateBtn}
          onClick={() => fetchOutline(true)}
          disabled={isBusy}
        >
          {isRegenerating ? (
            <>
              <span className={styles.btnSpinner} />
              {t('request_course_preview_regenerating')}
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M1.5 7.5C1.5 4.186 4.186 1.5 7.5 1.5s6 2.686 6 6-2.686 6-6 6c-2.24 0-4.19-1.23-5.22-3.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M1.5 3.5V7.5H5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('request_course_preview_regenerate')}
            </>
          )}
        </button>
      </div>

      {/* Main card */}
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="3" y="4" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 10H18M8 14H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="10" r="1" fill="currentColor"/>
              <circle cx="8" cy="14" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1 className={styles.title}>{t('request_course_preview_title')}</h1>
            <p className={styles.subtitle}>{t('request_course_preview_subtitle')}</p>
          </div>
        </div>

        {/* Error banner (inline, not full-page) */}
        {errorMsg && status === 'ready' && (
          <div className={styles.errorBanner}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7.5 4.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="7.5" cy="10.5" r="0.75" fill="currentColor"/>
            </svg>
            {errorMsg}
          </div>
        )}

        {/* Module list */}
        <div className={styles.moduleList}>
          {modules.map((mod, modIdx) => (
            <div key={modIdx} className={styles.moduleCard}>
              <div className={styles.moduleHeader}>
                <span className={styles.moduleBadge}>
                  {t('request_course_preview_module_label')} {modIdx + 1}
                </span>
                <span className={styles.moduleTitle}>{mod.module}</span>
                <span className={styles.subtopicCount}>
                  {mod.subtopics.length} {t('request_course_preview_subtopics_count')}
                </span>
              </div>

              <div className={styles.subtopicList}>
                {mod.subtopics.map((sub, subIdx) => {
                  const titleKey = `${modIdx}:${subIdx}:title`;
                  const summaryKey = `${modIdx}:${subIdx}:summary`;
                  return (
                    <div key={sub._id} className={styles.subtopicRow}>
                      <div className={styles.subtopicIndex}>{modIdx + 1}.{subIdx + 1}</div>
                      <div className={styles.subtopicFields}>
                        {editingKey === titleKey ? (
                          <input
                            autoFocus
                            className={styles.inlineInput}
                            value={sub.title}
                            onChange={(e) => updateSubtopicTitle(modIdx, subIdx, e.currentTarget.value)}
                            onBlur={() => setEditingKey(null)}
                            placeholder={t('request_course_preview_placeholder_title')}
                          />
                        ) : (
                          <button
                            className={styles.editableTitle}
                            onClick={() => setEditingKey(titleKey)}
                            title={t('request_course_preview_edit_title')}
                          >
                            {sub.title || <span className={styles.empty}>{t('request_course_preview_placeholder_title')}</span>}
                            <svg className={styles.pencil} width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                        {editingKey === summaryKey ? (
                          <textarea
                            autoFocus
                            className={styles.inlineTextarea}
                            value={sub.summary ?? ''}
                            onChange={(e) => updateSubtopicSummary(modIdx, subIdx, e.currentTarget.value)}
                            onBlur={() => setEditingKey(null)}
                            placeholder={t('request_course_preview_placeholder_summary')}
                            rows={2}
                          />
                        ) : (
                          <button
                            className={styles.editableSummary}
                            onClick={() => setEditingKey(summaryKey)}
                            title={t('request_course_preview_edit_summary')}
                          >
                            {sub.summary || <span className={styles.empty}>{t('request_course_preview_placeholder_summary')}</span>}
                            <svg className={styles.pencil} width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => deleteSubtopic(modIdx, subIdx)}
                        title={t('request_course_preview_delete_subtopic')}
                        aria-label={t('request_course_preview_delete_subtopic')}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}

                {/* Add subtopic */}
                <button
                  className={styles.addSubtopicBtn}
                  onClick={() => addSubtopic(modIdx)}
                  disabled={isBusy}
                >
                  {t('request_course_preview_add_subtopic')}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Approve */}
        <button
          className={styles.approveBtn}
          onClick={handleApprove}
          disabled={isBusy || modules.length === 0}
        >
          {isApproving ? (
            <>
              <span className={styles.btnSpinner} />
              {t('request_course_generating_stage_ai_label')}...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L11 7H16L12 10L13.5 15L9 12L4.5 15L6 10L2 7H7L9 2Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round"/>
              </svg>
              {t('request_course_preview_approve')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
