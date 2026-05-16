'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import styles from './PseudocodeEditor.module.scss';

/**
 * MVR Item 6 — PseudocodeEditor (Mode Penelitian saja).
 *
 * Render text editor with line numbers + toolbar that inserts canonical
 * pseudocode templates (BEGIN/END, INPUT/OUTPUT, IF/ENDIF, WHILE/ENDWHILE,
 * FOR/ENDFOR). Autosaves draft to localStorage every 2s. Submit posts to
 * /api/research-artifacts/submit which persists to research_artifacts with
 * artifact_type='pseudocode' and mode='research'.
 *
 * Skipped intentionally for MVR scope:
 *   - syntax highlighting (a 200-line PEG parser would not change CT scoring)
 *   - collaborative editing (single-user research scope)
 */

const TEMPLATES = [
  { label: 'BEGIN/END',     snippet: 'BEGIN\n  \nEND' },
  { label: 'INPUT/OUTPUT',  snippet: 'INPUT x\nOUTPUT x' },
  { label: 'IF/ENDIF',      snippet: 'IF kondisi THEN\n  \nENDIF' },
  { label: 'IF/ELSE/ENDIF', snippet: 'IF kondisi THEN\n  \nELSE\n  \nENDIF' },
  { label: 'WHILE',         snippet: 'WHILE kondisi DO\n  \nENDWHILE' },
  { label: 'FOR',           snippet: 'FOR i FROM 1 TO n DO\n  \nENDFOR' },
] as const;

interface PseudocodeEditorProps {
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  relatedPromptIds?: string[];
  /** Stable id (e.g. leaf-subtopic id) so draft autosave is scoped per leaf. */
  storageKey: string;
  /** Called after successful submit with the artifact id. */
  onSubmitted?: (artifactId: string | null) => void;
}

export function PseudocodeEditor({
  courseId,
  subtopicId,
  leafSubtopicId,
  relatedPromptIds = [],
  storageKey,
  onSubmitted,
}: PseudocodeEditorProps) {
  const draftKey = `pseudocode-editor:${storageKey}`;
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitOk, setSubmitOk] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) setContent(saved);
    } catch {
      // ignore quota/private-mode errors
    }
  }, [draftKey]);

  // Autosave debounced — 600ms after last keystroke.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, content);
      } catch {
        // ignore
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [content, draftKey]);

  const insertTemplate = useCallback((snippet: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((prev) => (prev ? `${prev}\n${snippet}` : snippet));
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setContent((prev) => prev.slice(0, start) + snippet + prev.slice(end));
    // Move caret after the inserted snippet on next tick.
    queueMicrotask(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }, []);

  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const blockCount = useMemo(() => {
    const opens = (content.match(/\b(BEGIN|IF|WHILE|FOR)\b/g) ?? []).length;
    return opens;
  }, [content]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      setSubmitError('Tulis pseudocode terlebih dahulu sebelum submit.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    setSubmitOk(false);
    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'pseudocode',
          artifactContent: content,
          relatedPromptIds,
          completionStatus: 'submitted',
          interactionEvents: [
            { type: 'submitted', at: new Date().toISOString(), line_count: lineCount, block_count: blockCount },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitOk(true);
      onSubmitted?.(json.artifactId ?? null);
      // Clear the autosave once successfully persisted.
      try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal submit artefak.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        {TEMPLATES.map((tpl) => (
          <button
            type="button"
            key={tpl.label}
            className={styles.tplBtn}
            onClick={() => insertTemplate(tpl.snippet)}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      <div className={styles.editorBody}>
        <div className={styles.gutter} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          spellCheck={false}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tulis pseudocode di sini... gunakan toolbar di atas untuk template cepat."
          rows={Math.max(lineCount + 2, 10)}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.counter}>
          <span>{lineCount} baris</span>
          <span>{blockCount} blok kendali</span>
        </div>
        <div className={styles.actions}>
          {submitOk && <span className={styles.ok}>✓ Tersimpan</span>}
          {submitError && <span className={styles.error}>{submitError}</span>}
          <button
            type="button"
            className={styles.submitBtn}
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Mengirim...' : 'Submit untuk Review'}
          </button>
        </div>
      </div>
    </div>
  );
}
