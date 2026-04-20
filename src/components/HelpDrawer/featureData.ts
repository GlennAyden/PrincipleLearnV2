// src/components/HelpDrawer/featureData.ts

export interface HelpFeature {
  /** Stable id used for the accordion state */
  id: string;
  /** Emoji / glyph shown as the card icon */
  icon: string;
  /** Short human-readable title */
  title: string;
  /** 1-2 sentence description */
  description: string;
  /**
   * Optional CSS selector the drawer can smooth-scroll to when the user taps
   * "Tunjukkan". Kept as a best-effort hint; if the selector doesn't match on
   * the current page the button is simply a no-op.
   */
  targetSelector?: string;
}

export const SUBTOPIC_HELP_FEATURES: HelpFeature[] = [
  {
    id: 'materi',
    icon: '📖',
    title: 'Materi utama',
    description:
      'Penjelasan konsep subtopic. Baca runtut dari atas — bagian ini digenerate menyesuaikan level dan gaya belajarmu.',
  },
  {
    id: 'examples',
    icon: '💡',
    title: 'Contoh',
    description:
      'Minta AI menyajikan contoh konkret atau analogi jika materinya terasa abstrak. Contoh baru bisa dihasilkan kapan saja.',
  },
  {
    id: 'ask-question',
    icon: '❓',
    title: 'Tanya AI',
    description:
      'Punya pertanyaan spesifik? Tulis di kotak tanya. Jawaban dialirkan real-time dan tersimpan di riwayat.',
  },
  {
    id: 'quiz',
    icon: '📝',
    title: 'Quiz',
    description:
      '5 soal cepat untuk mengecek pemahaman. Hasilmu dicatat sebagai syarat subtopic dianggap selesai.',
  },
  {
    id: 'challenge',
    icon: '🧠',
    title: 'Challenge berpikir kritis',
    description:
      'Pertanyaan terbuka yang mendorong kamu berpikir lebih dalam. AI memberi feedback terhadap jawabanmu.',
  },
  {
    id: 'reflection',
    icon: '✍️',
    title: 'Refleksi terstruktur',
    description:
      'Tuliskan apa yang kamu pahami, apa yang masih bingung, dan strategimu. Wajib diisi untuk menandai subtopic selesai.',
  },
  {
    id: 'key-takeaways',
    icon: '🎯',
    title: 'Key takeaways',
    description:
      'Ringkasan poin utama di akhir halaman. Kamu bisa review cepat sebelum lanjut ke subtopic berikutnya.',
  },
  {
    id: 'discussion-unlock',
    icon: '💬',
    title: 'Syarat buka diskusi',
    description:
      'Diskusi modul terbuka setelah kamu menyelesaikan SEMUA subtopic dalam modul itu (quiz + refleksi). Indikator terkunci di sidebar.',
  },
];
