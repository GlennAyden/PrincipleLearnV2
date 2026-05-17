'use client';

// src/app/admin/sumber/interactive-blocks/showcase/page.tsx
// B8 — Galeri semua 6 komponen interactive block dengan sample data realistis.
// Hanya untuk admin; bahasa Indonesia.

import { useState } from 'react';
import { InteractiveBlockRenderer } from '@/components/Interactive/InteractiveBlockRenderer';
import type { InteractiveBlock } from '@/types/interactive-blocks';
import styles from './page.module.scss';

// ─── Sample data realistis konteks pemrograman algoritma SMA ──────────────────

const SAMPLE_TRACE_TABLE: InteractiveBlock = {
  type: 'trace_table',
  config: {
    prompt:
      'Telusuri eksekusi loop berikut. Isi nilai variabel `i` dan `total` di setiap iterasi.',
    pseudocode:
      'total <- 0\nFOR i FROM 1 TO 5 DO\n    total <- total + i * i\nENDFOR\nOUTPUT total',
    columns: [
      { key: 'i',     label: 'i' },
      { key: 'total', label: 'total' },
    ],
    rowLabelPrefix: 'Iterasi',
    expectedRows: [
      { values: { i: '1', total: '1'  } },
      { values: { i: '2', total: '5'  } },
      { values: { i: '3', total: '14' } },
      { values: { i: '4', total: '30' } },
      { values: { i: '5', total: '55' } },
    ],
  },
};

const SAMPLE_OUTPUT_PREDICTOR: InteractiveBlock = {
  type: 'output_predictor',
  config: {
    prompt:
      'Prediksi output pseudokode berikut jika `nilai = 78`. Tulis hasilnya tanpa tanda kutip.',
    pseudocode:
      'INPUT nilai\nIF nilai >= 90 THEN\n    OUTPUT "A"\nELSE IF nilai >= 80 THEN\n    OUTPUT "B"\nELSE IF nilai >= 70 THEN\n    OUTPUT "C"\nELSE\n    OUTPUT "D"\nENDIF',
    inputs: { nilai: '78' },
    expectedOutput: 'C',
    acceptableVariants: [],
    hintAfterFail:
      'nilai = 78 memenuhi kondisi nilai >= 70 tetapi tidak >= 80, sehingga masuk ke cabang ELSE IF kedua dan mencetak "C".',
  },
};

const SAMPLE_PARSONS: InteractiveBlock = {
  type: 'parsons',
  config: {
    prompt:
      'Susun baris-baris pseudokode berikut menjadi algoritma pencarian linear (linear search) yang mencari nilai `target` dalam array.',
    orderedLines: [
      'BEGIN',
      'INPUT array, target',
      'ditemukan <- FALSE',
      'FOR i FROM 0 TO panjang(array) - 1 DO',
      '    IF array[i] = target THEN',
      '        ditemukan <- TRUE',
      '        posisi <- i',
      '    ENDIF',
      'ENDFOR',
      'IF ditemukan THEN',
      '    OUTPUT "Ditemukan di indeks " + posisi',
      'ELSE',
      '    OUTPUT "Tidak ditemukan"',
      'ENDIF',
      'END',
    ],
    distractors: [
      'RETURN target',
      'posisi <- posisi + 1',
    ],
  },
};

const SAMPLE_BUG_HUNT: InteractiveBlock = {
  type: 'bug_hunt',
  config: {
    prompt:
      'Pseudokode berikut seharusnya menghitung total harga setelah diskon 10%. Temukan baris yang mengandung bug dan perbaiki.',
    buggyLines: [
      'BEGIN',
      'INPUT harga',
      'diskon <- harga * 10',       // bug: should be * 0.10
      'total <- harga - diskon',
      'OUTPUT total',
      'END',
    ],
    bugLineIndex: 3,
    expectedFix: 'diskon <- harga * 0.10',
    fixAlternatives: ['diskon <- harga * 0.1', 'diskon <- harga / 10'],
    hint: 'Diskon 10% berarti mengalikan dengan 0.10 (atau 0.1), bukan dengan angka bulat 10.',
  },
};

const SAMPLE_FLOWCHART: InteractiveBlock = {
  type: 'flowchart_builder',
  config: {
    prompt:
      'Bangun flowchart untuk algoritma menentukan apakah bilangan yang diinput adalah positif, negatif, atau nol.',
    expectedNodes: [
      { id: 'start',    type: 'terminator', label: 'Mulai' },
      { id: 'input',    type: 'io',         label: 'INPUT n' },
      { id: 'cek_pos',  type: 'decision',   label: 'n > 0?' },
      { id: 'cek_nol',  type: 'decision',   label: 'n = 0?' },
      { id: 'positif',  type: 'io',         label: 'OUTPUT "Positif"' },
      { id: 'nol',      type: 'io',         label: 'OUTPUT "Nol"' },
      { id: 'negatif',  type: 'io',         label: 'OUTPUT "Negatif"' },
      { id: 'end',      type: 'terminator', label: 'Selesai' },
    ],
    expectedEdges: [
      { from: 'start',   to: 'input' },
      { from: 'input',   to: 'cek_pos' },
      { from: 'cek_pos', to: 'positif', label: 'Ya' },
      { from: 'cek_pos', to: 'cek_nol', label: 'Tidak' },
      { from: 'cek_nol', to: 'nol',     label: 'Ya' },
      { from: 'cek_nol', to: 'negatif', label: 'Tidak' },
      { from: 'positif', to: 'end' },
      { from: 'nol',     to: 'end' },
      { from: 'negatif', to: 'end' },
    ],
    paletteAllowed: ['terminator', 'process', 'decision', 'io'],
  },
};

const SAMPLE_BLOCK_BUILDER: InteractiveBlock = {
  type: 'block_builder',
  config: {
    prompt:
      'Susun blok-blok pseudokode berikut menjadi algoritma yang menghitung nilai faktorial dari n menggunakan perulangan.',
    palette: [
      'BEGIN',
      'INPUT n',
      'hasil <- 1',
      'FOR i FROM 1 TO n DO',
      '    hasil <- hasil * i',
      'ENDFOR',
      'OUTPUT hasil',
      'END',
      'hasil <- 0',           // distractor
      'FOR i FROM 0 TO n DO', // distractor
    ],
    expectedTokens: [
      'BEGIN',
      'INPUT n',
      'hasil <- 1',
      'FOR i FROM 1 TO n DO',
      '    hasil <- hasil * i',
      'ENDFOR',
      'OUTPUT hasil',
      'END',
    ],
  },
};

// ─── Gallery entry metadata ───────────────────────────────────────────────────

interface GalleryEntry {
  id: string;
  name: string;
  category: 'Ringan' | 'Kompleks';
  description: string;
  block: InteractiveBlock;
}

const GALLERY: GalleryEntry[] = [
  {
    id: 'trace_table',
    name: 'TraceTable',
    category: 'Ringan',
    description:
      'Siswa mengisi tabel eksekusi pseudokode baris per baris, menelusuri nilai variabel di setiap langkah. Mengukur ct_evaluation_debugging dan ct_pattern_recognition.',
    block: SAMPLE_TRACE_TABLE,
  },
  {
    id: 'output_predictor',
    name: 'OutputPredictor',
    category: 'Ringan',
    description:
      'Siswa memprediksi output program sebelum dijalankan. Mendorong cth_inference dan ct_abstraction melalui simulasi mental eksekusi kode.',
    block: SAMPLE_OUTPUT_PREDICTOR,
  },
  {
    id: 'parsons',
    name: 'ParsonsProblem',
    category: 'Ringan',
    description:
      'Baris pseudokode disajikan dalam urutan acak; siswa menyusun ulang via drag-drop. Mengukur ct_decomposition dan pemahaman alur algoritma.',
    block: SAMPLE_PARSONS,
  },
  {
    id: 'bug_hunt',
    name: 'BugHunt',
    category: 'Kompleks',
    description:
      'Siswa membaca kode bermasalah, mengidentifikasi baris yang salah, lalu mengetik perbaikan. Mengukur ct_evaluation_debugging dan cth_analysis.',
    block: SAMPLE_BUG_HUNT,
  },
  {
    id: 'flowchart_builder',
    name: 'FlowchartBuilder',
    category: 'Kompleks',
    description:
      'Siswa membangun flowchart dengan menyeret node dan menarik panah antar node menggunakan SVG interaktif. Mengukur ct_algorithm_design dan ct_abstraction.',
    block: SAMPLE_FLOWCHART,
  },
  {
    id: 'block_builder',
    name: 'PseudocodeBlockBuilder',
    category: 'Kompleks',
    description:
      'Siswa menyusun blok pseudokode dari palet ke area solusi via drag-drop (dnd-kit). Mengukur ct_decomposition dan ct_algorithm_design.',
    block: SAMPLE_BLOCK_BUILDER,
  },
];

const CATEGORY_COLOR: Record<'Ringan' | 'Kompleks', string> = {
  Ringan: '#16a34a',
  Kompleks: '#7c3aed',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShowcasePage() {
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Galeri Komponen Interaktif</h1>
            <p className={styles.subtitle}>
              6 komponen interactive block untuk Mode Penelitian — preview live dengan data contoh
              konteks algoritma SMA.
            </p>
          </div>
          <a href="/admin/sumber/interactive-blocks" className={styles.backLink}>
            Kembali ke Authoring
          </a>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.toggleLabel}>
            <span>Mode Interaktif</span>
            <button
              className={`${styles.toggleBtn} ${interactiveMode ? styles.toggleBtnOn : ''}`}
              onClick={() => setInteractiveMode((v) => !v)}
              aria-pressed={interactiveMode}
            >
              <span className={styles.toggleThumb} />
            </button>
            <span className={styles.toggleHint}>
              {interactiveMode
                ? 'Komponen dapat diinteraksi'
                : 'Preview saja — klik diblokir'}
            </span>
          </label>
        </div>
      </header>

      <div className={styles.grid}>
        {GALLERY.map((entry) => {
          const isOpen = expandedId === entry.id;
          return (
            <article key={entry.id} className={`${styles.card} ${isOpen ? styles.cardExpanded : ''}`}>
              {/* Card header */}
              <div className={styles.cardHeader} onClick={() => toggleExpanded(entry.id)}>
                <div className={styles.cardMeta}>
                  <span
                    className={styles.categoryBadge}
                    style={{ background: CATEGORY_COLOR[entry.category] }}
                  >
                    {entry.category}
                  </span>
                  <h2 className={styles.cardTitle}>{entry.name}</h2>
                </div>
                <span className={styles.expandIcon}>{isOpen ? '−' : '+'}</span>
              </div>

              <p className={styles.cardDesc}>{entry.description}</p>

              {/* Preview area */}
              {isOpen && (
                <div
                  className={styles.previewWrap}
                  style={{ pointerEvents: interactiveMode ? 'auto' : 'none' }}
                >
                  {!interactiveMode && (
                    <div className={styles.previewOverlay}>
                      <span>Preview — aktifkan Mode Interaktif untuk mencoba</span>
                    </div>
                  )}
                  <InteractiveBlockRenderer
                    block={entry.block}
                    courseId="showcase-demo"
                    subtopicId={null}
                    leafSubtopicId={null}
                  />
                </div>
              )}

              {!isOpen && (
                <button className={styles.expandBtn} onClick={() => toggleExpanded(entry.id)}>
                  Tampilkan Preview
                </button>
              )}
            </article>
          );
        })}
      </div>

      {/* Print footer */}
      <footer className={styles.printFooter}>
        <p>Lampiran Tesis — PrincipleLearn V3 Interactive Blocks Gallery</p>
        <p>6 komponen: TraceTable, OutputPredictor, ParsonsProblem, BugHunt, FlowchartBuilder, PseudocodeBlockBuilder</p>
      </footer>
    </div>
  );
}
