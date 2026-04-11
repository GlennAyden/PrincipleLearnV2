// src/services/prompt-classifier.ts
// Heuristic classifier for prompt development stages (RM2)
// Stages: SCP → SRP → MQP → Reflective

export type PromptStage = 'SCP' | 'SRP' | 'MQP' | 'Reflective';

interface PromptComponents {
  tujuan?: string;
  konteks?: string;
  batasan?: string;
  reasoning?: string;
}

export interface ClassificationResult {
  stage: PromptStage;
  confidence: number;
  microMarkers: string[];
}

// Reflective language patterns (Indonesian + English)
const REFLECTIVE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /mengapa\s+(lebih|harus|perlu|sebaiknya)/i, label: 'evaluasi-alasan' },
  { pattern: /bandingkan|perbandingan|perbedaan\s+antara/i, label: 'komparasi' },
  { pattern: /kelebihan.*kekurangan|pro.*kontra/i, label: 'analisis-trade-off' },
  { pattern: /evaluasi|menilai|assess/i, label: 'evaluasi' },
  { pattern: /apakah.*(sudah\s+benar|tepat|efisien)/i, label: 'validasi-solusi' },
  { pattern: /apa\s+(dampak|implikasi|konsekuensi)/i, label: 'analisis-dampak' },
  { pattern: /alternatif|pendekatan\s+lain|cara\s+lain/i, label: 'eksplorasi-alternatif' },
  { pattern: /justifikasi|alasan\s+utama/i, label: 'justifikasi' },
  { pattern: /bagaimana\s+jika|what\s+if/i, label: 'skenario-hipotesis' },
  { pattern: /compare|contrast|trade-?off/i, label: 'comparison' },
  { pattern: /evaluate|pros.*cons|which.*better/i, label: 'evaluation' },
  { pattern: /is\s+(this|my|it)\s+(correct|right|efficient)/i, label: 'solution-validation' },
  { pattern: /should\s+I|sebaiknya\s+(saya|aku)/i, label: 'keputusan' },
  { pattern: /pendekatan.*mana.*lebih/i, label: 'seleksi-pendekatan' },
];

// Multi-question indicators
const MULTI_QUESTION_INDICATORS: { pattern: RegExp; label: string }[] = [
  { pattern: /pertama.*kedua|first.*second|1\).*2\)/i, label: 'pertanyaan-berurutan' },
  { pattern: /selain\s+itu|furthermore|additionally|dan\s+juga/i, label: 'pertanyaan-berlapis' },
  { pattern: /lalu.*bagaimana|then.*how/i, label: 'follow-up-iteratif' },
];

/**
 * Classify a student prompt into development stages based on heuristic analysis.
 *
 * SCP  (Simple Clarification Prompt): Single direct question, minimal context
 * SRP  (Structured Reformulation Prompt): Question with context/background
 * MQP  (Multi-Question Prompt): Multiple layered questions with full components
 * Reflective: Evaluative, comparative, or justificatory reasoning
 */
export function classifyPromptStage(
  question: string,
  components: PromptComponents | null | undefined,
): ClassificationResult {
  const markers: string[] = [];

  const hasTujuan = !!(components?.tujuan?.trim());
  const hasKonteks = !!(components?.konteks?.trim());
  const hasBatasan = !!(components?.batasan?.trim());
  const hasReasoning = !!(components?.reasoning?.trim());

  // Count filled components
  const componentCount = [hasTujuan, hasKonteks, hasBatasan].filter(Boolean).length;
  if (hasTujuan) markers.push('comp:tujuan');
  if (hasKonteks) markers.push('comp:konteks');
  if (hasBatasan) markers.push('comp:batasan');
  if (hasReasoning) markers.push('comp:reasoning');

  // Check reflective patterns
  let reflectiveHits = 0;
  for (const { pattern, label } of REFLECTIVE_PATTERNS) {
    if (pattern.test(question)) {
      reflectiveHits++;
      markers.push(`reflective:${label}`);
    }
  }

  // Check multi-question patterns
  let multiHits = 0;
  const questionMarkCount = (question.match(/\?/g) || []).length;
  if (questionMarkCount >= 2) {
    multiHits++;
    markers.push('multi:multiple-tanda-tanya');
  }
  for (const { pattern, label } of MULTI_QUESTION_INDICATORS) {
    if (pattern.test(question)) {
      multiHits++;
      markers.push(`multi:${label}`);
    }
  }

  // --- Classification decision tree ---

  // Reflective: evaluative language + at least some structure
  if (reflectiveHits >= 2 || (reflectiveHits >= 1 && componentCount >= 2)) {
    const confidence = Math.min(0.55 + reflectiveHits * 0.12 + componentCount * 0.08, 1);
    return { stage: 'Reflective', confidence, microMarkers: markers };
  }

  // MQP: multiple questions/layers with rich components
  if ((multiHits >= 1 && componentCount >= 2) || componentCount === 3) {
    const confidence = Math.min(0.55 + multiHits * 0.12 + componentCount * 0.1, 1);
    return { stage: 'MQP', confidence, microMarkers: markers };
  }

  // SRP: has context or two components filled
  if (hasKonteks || componentCount >= 2) {
    const confidence = 0.6 + componentCount * 0.1;
    return { stage: 'SRP', confidence, microMarkers: markers };
  }

  // SCP: default — simple, direct question
  const confidence = hasTujuan ? 0.8 : 0.7;
  return { stage: 'SCP', confidence, microMarkers: markers };
}
