'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useInteractionTracking } from '@/hooks/useInteractionTracking';
import type { OutputPredictorConfig } from '@/types/interactive-blocks';
import styles from './OutputPredictor.module.scss';

interface OutputPredictorProps {
  config: OutputPredictorConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

/**
 * MVR Item 9.2 — OutputPredictor.
 *
 * Student types what they predict the pseudocode will output for the given
 * inputs. On submit we reveal the correct answer; score is 1.0 if first
 * attempt matches, 0.5 if matches after seeing hint, else 0.
 */
export function OutputPredictor({ config, courseId, subtopicId, leafSubtopicId, onSubmitted }: OutputPredictorProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();
  const [prediction, setPrediction] = useState('');
  const [stage, setStage] = useState<'predict' | 'revealed'>('predict');
  const [hintShown, setHintShown] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const variants = [config.expectedOutput, ...(config.acceptableVariants ?? [])].map((s) => s.trim());

  const checkCorrect = (input: string): boolean => {
    const trimmed = input.trim();
    return variants.some((v) => v === trimmed);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const isCorrect = checkCorrect(prediction);

    if (!isCorrect && !hintShown && config.hintAfterFail) {
      // First attempt was wrong AND we have a hint — show it without
      // burning the submission. Student can re-submit for half credit.
      setHintShown(true);
      track('hint_shown', { prediction });
      setSubmitting(false);
      return;
    }

    const finalScore = isCorrect ? (hintShown ? 0.5 : 1) : 0;
    track('submitted', { prediction, hint_shown: hintShown, is_correct: isCorrect, score: finalScore });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'output_predictor',
          artifactTitle: 'OutputPredictor submission',
          artifactContent: JSON.stringify({
            prediction,
            expected: config.expectedOutput,
            is_correct: isCorrect,
            hint_shown: hintShown,
            score: finalScore,
          }),
          interactionEvents: getEvents(),
          completionStatus: 'submitted',
          componentScore: finalScore,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setStage('revealed');
      setScore(finalScore);
      onSubmitted?.(json.artifactId ?? null, finalScore);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal submit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      {config.pseudocode && (
        <pre className={styles.code}>{config.pseudocode}</pre>
      )}

      {config.inputs && Object.keys(config.inputs).length > 0 && (
        <div className={styles.inputs}>
          <div className={styles.inputsLabel}>Input</div>
          <ul>
            {Object.entries(config.inputs).map(([k, v]) => (
              <li key={k}><code>{k}</code> = <code>{v}</code></li>
            ))}
          </ul>
        </div>
      )}

      <label className={styles.field}>
        <span>Prediksi outputmu</span>
        <textarea
          value={prediction}
          onChange={(e) => { setPrediction(e.target.value); track('prediction_typed', { length: e.target.value.length }); }}
          disabled={stage === 'revealed'}
          placeholder="Ketik output yang menurutmu akan dihasilkan pseudocode di atas"
          rows={3}
        />
      </label>

      {hintShown && stage === 'predict' && config.hintAfterFail && (
        <div className={styles.hint}>💡 {config.hintAfterFail}</div>
      )}

      {stage === 'revealed' && (
        <div className={styles.reveal}>
          <div className={styles.revealLabel}>Output sebenarnya:</div>
          <pre>{config.expectedOutput}</pre>
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.eventBadge}>{eventCount} aksi tercatat</span>
        {score !== null && (
          <span className={styles.scoreBadge}>Skor: {score === 1 ? '100%' : score === 0.5 ? '50% (dengan hint)' : '0%'}</span>
        )}
        {submitError && <span className={styles.error}>{submitError}</span>}
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || stage === 'revealed' || !prediction.trim()}
        >
          {submitting ? 'Mengirim...' : stage === 'revealed' ? 'Selesai' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
