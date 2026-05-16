'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { InteractiveBlockRenderer } from '@/components/Interactive/InteractiveBlockRenderer';
import type { InteractiveBlock } from '@/types/interactive-blocks';
import styles from './page.module.scss';

interface CourseRow {
  id: string;
  title: string;
  template_topic: string | null;
}

interface LeafRow {
  id: string;
  course_id: string;
  module_title: string;
  title: string;
  module_index: number;
  subtopic_index: number;
  interactive_blocks: unknown;
}

interface FetchResponse {
  success: boolean;
  courses: CourseRow[];
  leaves: LeafRow[];
  error?: string;
}

const KNOWN_TYPES = [
  'trace_table',
  'output_predictor',
  'parsons',
  'bug_hunt',
  'flowchart_builder',
  'block_builder',
] as const;

function parseBlocks(raw: unknown): InteractiveBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is InteractiveBlock => {
    if (!b || typeof b !== 'object') return false;
    const obj = b as { type?: unknown };
    return KNOWN_TYPES.includes(obj.type as typeof KNOWN_TYPES[number]);
  });
}

/**
 * MVR Item 9.4 — admin authoring UI untuk leaf_subtopics.interactive_blocks.
 * Tampilkan list leaf per course, edit JSON langsung di textarea, validasi
 * dengan Zod (via API PATCH), render preview live dengan pointer-events
 * disabled supaya admin bisa inspeksi tanpa accidentally submit ke artifacts.
 */
export default function InteractiveBlocksAuthoringPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [leaves, setLeaves] = useState<LeafRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);
  const [editorJson, setEditorJson] = useState('');
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeCourseTopic, setActiveCourseTopic] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/sumber/interactive-blocks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FetchResponse;
      setCourses(json.courses ?? []);
      setLeaves(json.leaves ?? []);
      if (!activeCourseTopic && json.courses && json.courses.length > 0) {
        setActiveCourseTopic(json.courses[0].template_topic);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [activeCourseTopic]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // When admin clicks a leaf, hydrate editor textarea from current value.
  useEffect(() => {
    if (!selectedLeafId) {
      setEditorJson('');
      return;
    }
    const leaf = leaves.find((l) => l.id === selectedLeafId);
    if (!leaf) return;
    setEditorJson(JSON.stringify(parseBlocks(leaf.interactive_blocks), null, 2));
    setParseError('');
    setSaveError('');
  }, [selectedLeafId, leaves]);

  const parsedPreviewBlocks = useMemo<InteractiveBlock[]>(() => {
    if (!editorJson.trim()) return [];
    try {
      const parsed = JSON.parse(editorJson);
      setParseError('');
      return parseBlocks(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'JSON tidak valid');
      return [];
    }
  }, [editorJson]);

  const handleSave = async () => {
    if (!selectedLeafId) return;
    setSaving(true);
    setSaveError('');
    try {
      let blocks: unknown;
      try {
        blocks = JSON.parse(editorJson || '[]');
      } catch (err) {
        throw new Error(`JSON tidak valid: ${err instanceof Error ? err.message : 'parse error'}`);
      }
      const res = await apiFetch('/api/admin/sumber/interactive-blocks', {
        method: 'PATCH',
        body: JSON.stringify({ leafId: selectedLeafId, blocks }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchAll();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const groupedByCourse = useMemo(() => {
    const map = new Map<string | null, LeafRow[]>();
    for (const c of courses) map.set(c.template_topic, []);
    for (const l of leaves) {
      const course = courses.find((c) => c.id === l.course_id);
      const topic = course?.template_topic ?? null;
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic)!.push(l);
    }
    return map;
  }, [courses, leaves]);

  const activeLeaves = activeCourseTopic
    ? groupedByCourse.get(activeCourseTopic) ?? []
    : [];
  const selectedLeaf = leaves.find((l) => l.id === selectedLeafId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Authoring Komponen Interaktif</h1>
          <p className={styles.subtitle}>
            MVR Item 9.4 — edit <code>leaf_subtopics.interactive_blocks</code>{' '}
            langsung sebagai JSON. Preview otomatis di panel kanan.
            Lihat <code>docs/examples/interactive-blocks/</code> untuk starter JSON.
          </p>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p className={styles.muted}>Memuat...</p>}

      <div className={styles.tabs}>
        {courses.map((c) => (
          <button
            key={c.id}
            className={`${styles.tab} ${activeCourseTopic === c.template_topic ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveCourseTopic(c.template_topic);
              setSelectedLeafId(null);
            }}
          >
            {c.template_topic ?? c.title}
          </button>
        ))}
      </div>

      <div className={styles.layout}>
        <aside className={styles.list}>
          <div className={styles.listHeader}>Leaf-subtopik</div>
          <ul>
            {activeLeaves.length === 0 ? (
              <li className={styles.empty}>Tidak ada leaf untuk course ini.</li>
            ) : (
              activeLeaves.map((leaf) => {
                const blocks = parseBlocks(leaf.interactive_blocks);
                const cls = selectedLeafId === leaf.id ? styles.listItemActive : styles.listItem;
                return (
                  <li key={leaf.id} className={cls} onClick={() => setSelectedLeafId(leaf.id)}>
                    <div className={styles.leafTitle}>{leaf.title}</div>
                    <div className={styles.leafMeta}>
                      {blocks.length > 0 ? `${blocks.length} block` : 'Belum ada block'}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        <section className={styles.editor}>
          {!selectedLeaf ? (
            <p className={styles.muted}>Pilih leaf di kiri untuk mulai mengedit.</p>
          ) : (
            <>
              <div className={styles.editorHeader}>
                <h2>{selectedLeaf.title}</h2>
                <div className={styles.editorMeta}>{selectedLeaf.module_title}</div>
              </div>

              <label className={styles.field}>
                <span>JSON `interactive_blocks` (array)</span>
                <textarea
                  rows={18}
                  value={editorJson}
                  onChange={(e) => setEditorJson(e.target.value)}
                  spellCheck={false}
                  placeholder='[{"type":"trace_table","config":{...}}]'
                />
              </label>
              {parseError && <div className={styles.error}>Parse error: {parseError}</div>}
              {saveError && <div className={styles.error}>{saveError}</div>}

              <div className={styles.actions}>
                <button
                  className={styles.btnSave}
                  disabled={saving || Boolean(parseError)}
                  onClick={handleSave}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>

              <div className={styles.previewHeader}>
                Preview Live{' '}
                <span className={styles.previewBadge}>
                  Klik diblokir — submit tidak akan terkirim
                </span>
              </div>
              {/* pointer-events: none — admin inspects tampilan; tombol Submit
                  di dalam komponen tidak boleh terkirim (akan create dummy
                  research_artifacts row). Admin tetap bisa baca + scroll. */}
              <div className={styles.previewWrap}>
                {parsedPreviewBlocks.length === 0 ? (
                  <p className={styles.muted}>Belum ada block untuk dipreview.</p>
                ) : (
                  parsedPreviewBlocks.map((block, idx) => (
                    <div key={idx} className={styles.previewBlock}>
                      <InteractiveBlockRenderer
                        block={block}
                        courseId={selectedLeaf.course_id}
                        subtopicId={null}
                        leafSubtopicId={selectedLeaf.id}
                      />
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
