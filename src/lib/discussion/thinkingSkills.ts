export type ThinkingSkillDomain = 'critical' | 'computational';

export interface ThinkingSkillIndicator {
  id: string;
  domain: ThinkingSkillDomain;
  name: string;
  description: string;
}

export interface ThinkingSkillMeta {
  domain: ThinkingSkillDomain;
  indicator: string;
  indicatorDescription?: string;
}

const CRITICAL_THINKING_INDICATORS: ThinkingSkillIndicator[] = [
  {
    id: 'ct_interpretation',
    domain: 'critical',
    name: 'Interpretation',
    description:
      'Kemampuan memahami dan menjelaskan makna dari data, situasi, atau pengalaman belajar.',
  },
  {
    id: 'ct_analysis',
    domain: 'critical',
    name: 'Analysis',
    description:
      'Mahasiswa memecah permasalahan atau meminta klarifikasi atas jawaban AI untuk memahami konsep lebih dalam.',
  },
  {
    id: 'ct_evaluation',
    domain: 'critical',
    name: 'Evaluation',
    description:
      'Mahasiswa menilai efektivitas atau ketepatan solusi yang diberikan oleh AI.',
  },
  {
    id: 'ct_inference',
    domain: 'critical',
    name: 'Inference',
    description:
      'Mahasiswa membuat prediksi atau kesimpulan logis dari hasil pembelajaran atau contoh kasus yang diberikan AI.',
  },
  {
    id: 'ct_explanation',
    domain: 'critical',
    name: 'Explanation',
    description:
      'Mahasiswa menjelaskan kembali konsep dengan kata-kata sendiri atau memberikan contoh baru.',
  },
  {
    id: 'ct_self_regulation',
    domain: 'critical',
    name: 'Self-Regulation',
    description:
      'Mahasiswa merefleksikan pemahaman, kesulitan, atau keterbatasan pengetahuannya sendiri.',
  },
];

const COMPUTATIONAL_THINKING_INDICATORS: ThinkingSkillIndicator[] = [
  {
    id: 'cpt_decomposition',
    domain: 'computational',
    name: 'Decomposition',
    description:
      'Kemampuan membagi masalah kompleks menjadi langkah-langkah kecil yang lebih mudah dipahami.',
  },
  {
    id: 'cpt_pattern_recognition',
    domain: 'computational',
    name: 'Pattern Recognition',
    description:
      'Kemampuan mengenali kesamaan atau pola antar masalah untuk menemukan solusi umum.',
  },
  {
    id: 'cpt_abstraction',
    domain: 'computational',
    name: 'Abstraction',
    description:
      'Kemampuan memfokuskan perhatian pada inti konsep dengan mengabaikan detail yang tidak relevan.',
  },
  {
    id: 'cpt_algorithm_design',
    domain: 'computational',
    name: 'Algorithm Design',
    description:
      'Kemampuan menyusun urutan langkah penyelesaian masalah secara logis dan sistematis.',
  },
  {
    id: 'cpt_evaluation_debugging',
    domain: 'computational',
    name: 'Evaluation & Debugging',
    description:
      'Kemampuan menemukan dan memperbaiki kesalahan dalam algoritma atau prosedur.',
  },
  {
    id: 'cpt_generalization',
    domain: 'computational',
    name: 'Generalization',
    description:
      'Kemampuan menerapkan solusi dari satu konteks ke konteks lain yang serupa, mengenali pola yang dapat digeneralisasikan.',
  },
];

export const THINKING_SKILL_INDICATORS = {
  critical: CRITICAL_THINKING_INDICATORS,
  computational: COMPUTATIONAL_THINKING_INDICATORS,
};

export function buildThinkingSkillGuidanceLines(): string[] {
  const lines: string[] = [
    'Indikator Critical Thinking (gunakan nama indikator pada field `indicator`):',
    ...CRITICAL_THINKING_INDICATORS.map(
      (item) => `- ${item.name}: ${item.description}`
    ),
    '',
    'Indikator Computational Thinking (gunakan nama indikator pada field `indicator`):',
    ...COMPUTATIONAL_THINKING_INDICATORS.map(
      (item) => `- ${item.name}: ${item.description}`
    ),
  ];

  return lines;
}

// Backward compatibility: map old indicator names to new canonical names
const INDICATOR_NAME_MAP: Record<string, string> = {
  'Algorithmic Thinking': 'Algorithm Design',
  'Debugging / Error Correction': 'Evaluation & Debugging',
  'Debugging': 'Evaluation & Debugging',
};

export function normalizeThinkingSkillMeta(meta: unknown): ThinkingSkillMeta | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  const m = meta as Record<string, unknown>;

  const domainValue =
    m.domain === 'critical' || m.domain === 'computational'
      ? m.domain
      : null;

  if (!domainValue) {
    return null;
  }

  const rawIndicator =
    typeof m.indicator === 'string' && m.indicator.trim().length > 0
      ? m.indicator.trim()
      : null;

  if (!rawIndicator) {
    return null;
  }

  // Apply backward-compat mapping
  const indicator = INDICATOR_NAME_MAP[rawIndicator] || rawIndicator;

  const indicatorDescription =
    typeof m.indicator_description === 'string'
      ? m.indicator_description
      : typeof m.indicatorDescription === 'string'
      ? m.indicatorDescription
      : undefined;

  return {
    domain: domainValue,
    indicator,
    indicatorDescription,
  };
}
