// src/components/PromptBuilder/PromptBuilder.tsx
'use client';
import React, { useState, useCallback } from 'react';
import styles from './PromptBuilder.module.scss';
import AILoadingIndicator from '@/components/AILoadingIndicator/AILoadingIndicator';

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
const TUJUAN_CHIPS = [
  'Saya ingin memahami bagaimana...',
  'Tolong jelaskan tentang...',
  'Apa perbedaan antara...',
];

const KONTEKS_CHIPS = [
  'Yang sudah saya ketahui adalah...',
  'Saya sudah mencoba, tapi...',
  'Saya masih bingung tentang...',
];

const BATASAN_CHIPS = [
  'Jelaskan dengan bahasa sederhana',
  'Berikan contoh kode',
  'Gunakan analogi kehidupan nyata',
  'Maksimal 3 paragraf',
];

export default function PromptBuilder({
  onSubmit,
  loading = false,
}: PromptBuilderProps) {
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
          ⚡ Langsung
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === 'guided' ? styles.active : ''}`}
          onClick={() => setMode('guided')}
        >
          🧭 Guided Builder
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
              placeholder="Tanyakan apapun yang ingin Anda ketahui..."
              disabled={loading}
            />
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading || !simpleQuestion.trim()}
            >
              {loading ? '...' : 'Kirim'}
            </button>
          </div>
          {loading && (
            <AILoadingIndicator
              messages={['Memproses pertanyaan...', 'Menyusun jawaban...', 'Hampir selesai...']}
            />
          )}
        </form>
      ) : showReasoning ? (
        /* ── Post-Submit Reasoning Step ── */
        <div className={styles.reasoningStep}>
          <div className={styles.reasoningHeader}>
            <span className={styles.reasoningIcon}>💭</span>
            <div>
              <h4 className={styles.reasoningTitle}>Satu langkah lagi!</h4>
              <p className={styles.reasoningSubtitle}>
                Kenapa kamu menanyakan ini? (Membantu pengajar memahami proses berpikirmu)
              </p>
            </div>
          </div>
          <textarea
            className={styles.reasoningTextarea}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="Saya menanyakan ini karena..."
            rows={2}
            autoFocus
          />
          <div className={styles.reasoningActions}>
            <button
              type="button"
              className={styles.skipButton}
              onClick={handleSkipReasoning}
            >
              Lewati →
            </button>
            <button
              type="button"
              className={styles.guidedSubmitButton}
              onClick={handleReasoningSubmit}
              disabled={loading}
            >
              {loading ? 'Mengirim...' : '🚀 Kirim Pertanyaan'}
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
              Apa yang ingin kamu ketahui?
              <span className={styles.requiredBadge}>wajib</span>
            </label>
            <textarea
              className={styles.fieldTextarea}
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder="Tulis pertanyaanmu di sini..."
              disabled={loading}
              rows={2}
              autoFocus
            />
            <div className={styles.chipRow}>
              {TUJUAN_CHIPS.map((chip) => (
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
              Tambah detail agar jawaban AI lebih tepat
            </button>
          )}

          {/* Extra fields: Konteks + Batasan */}
          {showExtra && (
            <div className={styles.extraFields}>
              {/* Konteks */}
              <div className={styles.fieldBlock}>
                <label className={styles.fieldLabel}>
                  <span className={styles.fieldIcon}>📝</span>
                  Konteksmu
                  <span className={styles.optionalBadge}>opsional</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={konteks}
                  onChange={(e) => setKonteks(e.target.value)}
                  placeholder="Apa yang sudah kamu ketahui atau coba sebelumnya..."
                  disabled={loading}
                  rows={2}
                />
                <div className={styles.chipRow}>
                  {KONTEKS_CHIPS.map((chip) => (
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
                  Format jawaban yang diinginkan
                  <span className={styles.optionalBadge}>opsional</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={batasan}
                  onChange={(e) => setBatasan(e.target.value)}
                  placeholder="Mau dijawab pakai bahasa tertentu, dengan contoh, atau analogi?"
                  disabled={loading}
                  rows={2}
                />
                <div className={styles.chipRow}>
                  {BATASAN_CHIPS.map((chip) => (
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
                ▲ Sembunyikan detail
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
            {loading ? 'Mengirim...' : 'Kirim Pertanyaan'}
          </button>
          {loading && (
            <AILoadingIndicator
              messages={['Memproses pertanyaan...', 'Menyusun jawaban...', 'Hampir selesai...']}
            />
          )}
        </div>
      )}
    </div>
  );
}
