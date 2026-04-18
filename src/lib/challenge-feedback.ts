export interface ChallengeFeedbackSource {
  question: string;
  answer: string;
  context?: string | null;
}

function compactSnippet(value: string | null | undefined, maxLength: number) {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function buildFallbackChallengeFeedback({
  question,
  answer,
  context,
}: ChallengeFeedbackSource) {
  const questionSnippet = compactSnippet(question, 140);
  const answerSnippet = compactSnippet(answer, 120);
  const contextSnippet = compactSnippet(context, 120);
  const questionPart = questionSnippet
    ? `pertanyaan "${questionSnippet}"`
    : 'pertanyaan tantangan ini';
  const answerPart = answerSnippet
    ? ` Gunakan jawaban Anda ("${answerSnippet}") sebagai titik awal, lalu tambahkan alasan atau contoh konkret.`
    : ' Tambahkan alasan atau contoh konkret agar jawaban lebih kuat.';
  const contextPart = contextSnippet
    ? ` Kaitkan juga dengan konteks utama: "${contextSnippet}".`
    : '';

  return `Umpan balik: Jawaban Anda sudah menanggapi ${questionPart}.${answerPart}${contextPart} Perkuat dengan konsep kunci dan langkah yang lebih spesifik.`;
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? trimmed).trim();
}

function extractFeedbackText(parsed: unknown) {
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const feedback = (parsed as Record<string, unknown>).feedback;
  if (typeof feedback !== 'string') return null;

  const trimmed = feedback.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeJsonPayload(value: string) {
  return /^(?:\{|"|\[\s*(?:[\]{"\[]))/.test(value);
}

export function normalizeChallengeFeedback(
  rawFeedback: unknown,
  source: ChallengeFeedbackSource,
) {
  const fallback = buildFallbackChallengeFeedback(source);
  if (typeof rawFeedback !== 'string') return fallback;

  const trimmed = rawFeedback.trim();
  if (!trimmed) return fallback;

  const candidate = stripCodeFence(trimmed);
  if (!candidate) return fallback;

  if (looksLikeJsonPayload(candidate)) {
    try {
      return extractFeedbackText(JSON.parse(candidate)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  return candidate;
}
