// Path: src/app/request-course/step1/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/context/LocaleContext';
import { apiFetch } from '@/lib/api-client';
import type { DictKey } from '@/lib/i18n/dict';
import styles from './page.module.scss';

interface ResearchTemplate {
  id: string;
  templateTopic: string;
  title: string;
  description: string;
  sourceReference: string | null;
  difficultyLevel: string | null;
  displayOrder: number;
  prereqTemplateTopic: string | null;
  isUnlocked: boolean;
  lockReason: string | null;
}

export default function Step1() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useLocale();

  const [mode, setMode] = useState<'general' | 'research'>(answers.mode ?? 'general');
  const [topic, setTopic] = useState(answers.topic);
  const [goal, setGoal]   = useState(answers.goal);
  const [templateTopic, setTemplateTopic] = useState(answers.templateTopic ?? '');
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [err, setErr]     = useState('');

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch the 4 Fase E templates the first time research mode is shown.
  // Cheap server call; we cache by leaving the array populated for the
  // session so toggling between modes does not refetch.
  useEffect(() => {
    if (mode !== 'research' || templates.length > 0 || templatesLoading) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError('');
    (async () => {
      try {
        const res = await apiFetch('/api/courses/research-templates');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { templates?: ResearchTemplate[] };
        if (cancelled) return;
        setTemplates(json.templates ?? []);
      } catch (fetchErr) {
        console.warn('[Step1] Failed to load research templates', fetchErr);
        if (!cancelled) setTemplatesError(t('request_course_step1_template_error'));
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, templates.length, templatesLoading, t]);

  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.templateTopic === templateTopic) ?? null,
    [templates, templateTopic],
  );

  const handleSelectTemplate = (tpl: ResearchTemplate) => {
    if (!tpl.isUnlocked) return;
    setTemplateTopic(tpl.templateTopic);
    setTopic(tpl.title);
    if (!goal.trim()) {
      // Pre-fill goal with the curriculum description so the user can edit if
      // they want, but the field is no longer required for research mode.
      setGoal(tpl.description || tpl.title);
    }
    setErr('');
  };

  const continueToStep2 = () => {
    if (mode === 'research') {
      if (!templateTopic.trim() || !selectedTemplate) {
        setErr(t('request_course_step1_template_select_required'));
        return;
      }
      setPartial({
        mode,
        templateTopic,
        topic: selectedTemplate.title,
        goal: goal.trim() || selectedTemplate.description || selectedTemplate.title,
      });
      router.push('/request-course/step2');
      return;
    }

    // Mode Umum — perilaku lama (topic + goal wajib)
    if (!topic.trim() || !goal.trim()) {
      setErr(t('request_course_step1_fill_both'));
      return;
    }
    setPartial({ mode: 'general', templateTopic: '', topic, goal });
    router.push('/request-course/step2');
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <Link href="/dashboard" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('request_course_dashboard_link')}
      </Link>

      <div className={styles.card}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.stepDot} data-active="true">1</div>
          <div className={styles.stepLine} />
          <div className={styles.stepDot}>2</div>
          <div className={styles.stepLine} />
          <div className={styles.stepDot}>3</div>
        </div>

        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 6C4 4.9 4.9 4 6 4H12C13.1 4 14 4.9 14 6V22C14 23.1 13.1 24 12 24H6C4.9 24 4 23.1 4 22V6Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 6C14 4.9 14.9 4 16 4H22C23.1 4 24 4.9 24 6V14C24 15.1 23.1 16 22 16H16C14.9 16 14 15.1 14 14V6Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 9H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 13H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className={styles.title}>{t('request_course_step1_title')}</h1>
          <p className={styles.subtitle}>{t('request_course_step1_subtitle')}</p>
        </div>

        {err && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            {err}
          </div>
        )}

        <div className={styles.form}>
          {/* Mode toggle — MVR Item 1/2 */}
          <div className={styles.field}>
            <label className={styles.label}>{t('request_course_step1_mode_label')}</label>
            <div className={styles.modeGroup} role="radiogroup">
              {(['general', 'research'] as const).map((opt) => {
                const labelKey: DictKey = opt === 'general'
                  ? 'request_course_step1_mode_general'
                  : 'request_course_step1_mode_research';
                const descKey: DictKey = opt === 'general'
                  ? 'request_course_step1_mode_general_desc'
                  : 'request_course_step1_mode_research_desc';
                return (
                  <button
                    type="button"
                    key={opt}
                    role="radio"
                    aria-checked={mode === opt}
                    className={styles.modeOption}
                    data-active={mode === opt}
                    onClick={() => {
                      setMode(opt);
                      setErr('');
                      if (opt === 'general') {
                        setTemplateTopic('');
                      }
                    }}
                  >
                    <span className={styles.modeOptionTitle}>{t(labelKey)}</span>
                    <span className={styles.modeOptionDesc}>{t(descKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === 'research' ? (
            <div className={styles.field}>
              <label className={styles.label}>{t('request_course_step1_template_label')}</label>
              {templatesLoading && (
                <p className={styles.muted}>{t('request_course_step1_template_loading')}</p>
              )}
              {templatesError && (
                <p className={styles.error}>{templatesError}</p>
              )}
              {!templatesLoading && !templatesError && (
                <div className={styles.templateGrid}>
                  {templates.map((tpl) => {
                    const isSelected = templateTopic === tpl.templateTopic;
                    return (
                      <button
                        type="button"
                        key={tpl.templateTopic}
                        className={styles.templateCard}
                        data-selected={isSelected}
                        data-locked={!tpl.isUnlocked}
                        disabled={!tpl.isUnlocked}
                        onClick={() => handleSelectTemplate(tpl)}
                      >
                        <span className={styles.templateOrder}>{tpl.displayOrder}</span>
                        <span className={styles.templateTitle}>{tpl.title}</span>
                        {tpl.sourceReference && (
                          <span className={styles.templateSource}>
                            {t('request_course_step1_template_source_prefix')} {tpl.sourceReference}
                          </span>
                        )}
                        {!tpl.isUnlocked && tpl.lockReason && (
                          <span className={styles.templateLock}>
                            🔒 {t('request_course_step1_template_locked_prefix')}: {tpl.lockReason}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.label}>{t('request_course_step1_topic_label')}</label>
                <div className={styles.inputWrap}>
                  <div className={styles.inputIcon}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M3 3.75C3 2.925 3.675 2.25 4.5 2.25H9L10.5 3.75H13.5C14.325 3.75 15 4.425 15 5.25V13.5C15 14.325 14.325 15 13.5 15H4.5C3.675 15 3 14.325 3 13.5V3.75Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <input
                    className={styles.input}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="words"
                    placeholder={t('request_course_step1_topic_placeholder')}
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('request_course_step1_goal_label')}</label>
                <div className={styles.inputWrap}>
                  <div className={styles.textareaIcon}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="9" cy="9" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <textarea
                    className={styles.textarea}
                    placeholder={t('request_course_step1_goal_placeholder')}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'research' && selectedTemplate && (
            <div className={styles.field}>
              <label className={styles.label}>{t('request_course_step1_goal_research_label')}</label>
              <textarea
                className={styles.textarea}
                style={{ paddingLeft: '0.85rem' }}
                placeholder={t('request_course_step1_goal_research_placeholder')}
                value={goal}
                onChange={e => setGoal(e.target.value)}
              />
            </div>
          )}

          <button className={styles.submitBtn} onClick={continueToStep2}>
            {t('request_course_step1_continue')}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
