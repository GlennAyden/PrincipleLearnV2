// src/components/PromptBuilder/PromptBuilder.tsx
'use client';
import React, { useState, useCallback, useMemo } from 'react';
import styles from './PromptBuilder.module.scss';
import AILoadingIndicator from '@/components/AILoadingIndicator/AILoadingIndicator';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';

export interface PromptComponents {
  tujuan: string;
  konteks: string;
  batasan: string;
  reasoning: string;
}

export interface PromptBuilderProps {
  /** Callback when user submits the final prompt */
  onSubmit: (fullPrompt: string, components: PromptComponents) => void;
  /** Whether submission is in progress */
  loading?: boolean;
  /** Context from the course content (for display) */
  courseContext?: string;
}

/* ── Sentence-starter chips for each field ── */
function buildTujuanChips(t: (key: DictKey) => string) {
  return [
    t('prompt_chip_tujuan_1'),
    t('prompt_chip_tujuan_2'),
    t('prompt_chip_tujuan_3'),
  ];
}

function buildKonteksChips(t: (key: DictKey) => string) {
  return [
    t('prompt_chip_konteks_1'),
    t('prompt_chip_konteks_2'),
    t('prompt_chip_konteks_3'),
  ];
}

function buildBatasanChips(t: (key: DictKey) => string) {
  return [
    t('prompt_chip_batasan_1'),
    t('prompt_chip_batasan_2'),
    t('prompt_chip_batasan_3'),
    t('prompt_chip_batasan_4'),
  ];
}

export default function PromptBuilder({
  onSubmit,
  loading = false,
}: PromptBuilderProps) {
  const { t } = useLocale();
  const tujuanChips = useMemo(() => buildTujuanChips(t), [t]);
  const konteksChips = useMemo(() => buildKonteksChips(t), [t]);
  const batasanChips = useMemo(() => buildBatasanChips(t), [t]);
  const loadingMessages = useMemo(
    () => [
      t('prompt_loading_processing'),
      t('prompt_loading_drafting'),
      t('prompt_loading_almost'),
    ],
    [t],
  );

  const [mode, setMode] = useState<'simple' | 'guided'>('guided');
  const [simpleQuestion, setSimpleQuestion] = useState('');

  // Guided mode state
  const [tujuan, setTujuan] = useState('');
  const [konteks, setKonteks] = useState('');
  const [batasan, setBatasan] = useState('');
  const [showExtra, setShowExtra] = useState(false);

  // Post-submit reasoning
  const [showReasoning, setShowReasoning] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingComponents, setPendingComponents] = useState<PromptComponents | null>(null);

  const buildFullPrompt = useCallback(() => {
    const parts: string[] = [];
    if (tujuan.trim()) parts.push(tujuan.trim());
    if (konteks.trim()) parts.push(`Konteks: ${konteks.trim()}`);
    if (batasan.trim()) parts.push(`Batasan: ${batasan.trim()}`);
    return parts.join('\n\n');
  }, [tujuan, konteks, batasan]);

  /* ── Chip click handlers ── */
  const handleChipClick = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    text: string,
    currentValue: string
  ) => {
    // If the field is empty or only has a previous starter, replace
    // Otherwise append
    if (!currentValue.trim()) {
      setter(text);
    } else {
      setter(currentValue.trimEnd() + ' ' + text);
    }
  };

  /* ── Submit handlers ── */
  const handleSimpleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simpleQuestion.trim() || loading) return;
    onSubmit(simpleQuestion.trim(), {
      tujuan: simpleQuestion.trim(),
      konteks: '',
      batasan: '',
      reasoning: '',
    });
    setSimpleQuestion('');
  };

  const handleGuidedSubmit = () => {
    const fullPrompt = buildFullPrompt();
    if (!fullPrompt.trim() || loading) return;

    const components: PromptComponents = {
      tujuan: tujuan.trim(),
      konteks: konteks.trim(),
      batasan: batasan.trim(),
      reasoning: '',
    };

    // Store pending data and show reasoning step
    setPendingPrompt(fullPrompt);
    setPendingComponents(components);
    setShowReasoning(true);
  };

  const handleReasoningSubmit = () => {
    if (!pendingComponents || !pendingPrompt) return;
    const finalComponents = { ...pendingComponents, reasoning: reasoning.trim() };
    onSubmit(pendingPrompt, finalComponents);

    // Reset all fields
    setTujuan('');
    setKonteks('');
    setBatasan('');
    setReasoning('');
    setShowExtra(false);
    setShowReasoning(false);
    setPendingPrompt('');
    setPendingComponents(null);
  };

  const handleSkipReasoning = () => {
    if (!pendingComponents || !pendingPrompt) return;
    onSubmit(pendingPrompt, pendingComponents);

    // Reset all fields
    setTujuan('');
    setKonteks('');
    setBatasan('');
    setReasoning('');
    setShowExtra(false);
    setShowReasoning(false);
    setPendingPrompt('');
    setPendingComponents(null);
  };

  const canSubmitGuided = tujuan.trim().length > 0;

  return (
    <div className={styles.promptBuilder}>
      {/* Mode Toggle */}
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'simple' ? styles.active : ''}`}
          onClick={() => setMode('simple')}
        >
          {t('prompt_mode_simple')}
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'guided' ? styles.active : ''}`}
          onClick={() => setMode('guided')}
        >
          {t('prompt_mode_guided')}
        </button>
      </div>

      {mode === 'simple' ? (
        /* ── Simple Mode ── */
        <form className={styles.simpleForm} onSubmit={handleSimpleSubmit}>
          <div className={styles.simpleInputContainer}>
            <input
              type="text"
              className={styles.simpleInput}
              value={simpleQuestion}
              onChange={(e) => setSimpleQuestion(e.target.value)}
              placeholder={t('prompt_simple_placeholder')}
              disabled={loading}
            />
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading || !simpleQuestion.trim()}
            >
              {loading ? t('prompt_simple_sending') : t('prompt_simple_submit')}
            </button>
          </div>
          {loading && (
            <AILoadingIndicator messages={loadingMessages} />
          )}
        </form>
      ) : showReasoning ? (
        /* ── Post-Submit Reasoning Step ── */
        <div className={styles.reasoningStep}>
          <div className={styles.reasoningHeader}>
            <span className={styles.reasoningIcon}>💭</span>
            <div>
              <h4 className={styles.reasoningTitle}>{t('prompt_reasoning_title')}</h4>
              <p className={styles.reasoningSubtitle}>
                {t('prompt_reasoning_subtitle')}
              </p>
            </div>
          </div>
          <textarea
            className={styles.reasoningTextarea}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder={t('prompt_reasoning_placeholder')}
            rows={2}
            autoFocus
          />
          <div className={styles.reasoningActions}>
            <button
              type="button"
              className={styles.skipButton}
              onClick={handleSkipReasoning}
            >
              {t('prompt_reasoning_skip')}
            </button>
            <button
              type="button"
              className={styles.guidedSubmitButton}
              onClick={handleReasoningSubmit}
              disabled={loading}
            >
              {loading ? t('prompt_reasoning_sending') : t('prompt_reasoning_submit')}
            </button>
          </div>
        </div>
      ) : (
        /* ── Guided Mode ── */
        <div className={styles.guidedForm}>
          {/* Main field: Tujuan */}
          <div className={styles.fieldBlock}>
            <label className={styles.fieldLabel}>
              <span className={styles.fieldIcon}>🎯</span>
              {t('prompt_label_tujuan')}
              <span className={styles.requiredBadge}>{t('prompt_label_tujuan_required')}</span>
            </label>
            <textarea
              className={styles.fieldTextarea}
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder={t('prompt_tujuan_placeholder')}
              disabled={loading}
              rows={2}
              autoFocus
            />
            <div className={styles.chipRow}>
              {tujuanChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleChipClick(setTujuan, chip, tujuan)}
                  disabled={loading}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Expand toggle */}
          {!showExtra && (
            <button
              type="button"
              className={styles.expandToggle}
              onClick={() => setShowExtra(true)}
            >
              <span className={styles.expandIcon}>+</span>
              {t('prompt_expand_more')}
            </button>
          )}

          {/* Extra fields: Konteks + Batasan */}
          {showExtra && (
            <div className={styles.extraFields}>
              {/* Konteks */}
              <div className={styles.fieldBlock}>
                <label className={styles.fieldLabel}>
                  <span className={styles.fieldIcon}>📝</span>
                  {t('prompt_label_konteks')}
                  <span className={styles.optionalBadge}>{t('prompt_label_konteks_optional')}</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={konteks}
                  onChange={(e) => setKonteks(e.target.value)}
                  placeholder={t('prompt_konteks_placeholder')}
                  disabled={loading}
                  rows={2}
                />
                <div className={styles.chipRow}>
                  {konteksChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={styles.chip}
                      onClick={() => handleChipClick(setKonteks, chip, konteks)}
                      disabled={loading}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Batasan */}
              <div className={styles.fieldBlock}>
                <label className={styles.fieldLabel}>
                  <span className={styles.fieldIcon}>📏</span>
                  {t('prompt_label_batasan')}
                  <span className={styles.optionalBadge}>{t('prompt_label_batasan_optional')}</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={batasan}
                  onChange={(e) => setBatasan(e.target.value)}
                  placeholder={t('prompt_batasan_placeholder')}
                  disabled={loading}
                  rows={2}
                />
                <div className={styles.chipRow}>
                  {batasanChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={`${styles.chip} ${batasan.includes(chip) ? styles.chipActive : ''}`}
                      onClick={() => {
                        if (batasan.includes(chip)) {
                          setBatasan(batasan.replace(chip, '').replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim());
                        } else {
                          setBatasan(batasan.trim() ? `${batasan.trim()}, ${chip}` : chip);
                        }
                      }}
                      disabled={loading}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className={styles.collapseToggle}
                onClick={() => setShowExtra(false)}
              >
                {t('prompt_collapse_details')}
              </button>
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            className={styles.guidedSubmitButton}
            onClick={handleGuidedSubmit}
            disabled={!canSubmitGuided || loading}
          >
            {loading ? t('prompt_guided_sending') : t('prompt_guided_submit')}
          </button>
          {loading && (
            <AILoadingIndicator messages={loadingMessages} />
          )}
        </div>
      )}
    </div>
  );
}
