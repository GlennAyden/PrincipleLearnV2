// src/components/HelpDrawer/featureData.ts
import type { DictKey } from '@/lib/i18n/dict';

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
  /**
   * When true, this feature is only shown in research mode.
   * Omit (or false) for features visible in all modes.
   */
  researchOnly?: boolean;
}

/**
 * Build the full ordered feature list.
 * Ordering: Materi → Contoh → AI Sokratik → RAG citation → Interactive Blocks
 *           → Quiz → Challenge → Refleksi → Key Takeaways → Discussion
 */
export function buildSubtopicHelpFeatures(
  t: (key: DictKey) => string,
): HelpFeature[] {
  return [
    {
      id: 'materi',
      icon: '📖',
      title: t('help_feature_materi_title'),
      description: t('help_feature_materi_desc'),
    },
    {
      id: 'examples',
      icon: '💡',
      title: t('help_feature_examples_title'),
      description: t('help_feature_examples_desc'),
    },
    {
      id: 'ask-question',
      icon: '❓',
      title: t('help_feature_ask_title'),
      description: t('help_feature_ask_desc'),
    },
    {
      id: 'rag-citation',
      icon: '📚',
      title: t('help_feature_rag_title'),
      description: t('help_feature_rag_desc'),
      researchOnly: true,
    },
    {
      id: 'interactive-blocks',
      icon: '🧩',
      title: t('help_feature_interactive_title'),
      description: t('help_feature_interactive_desc'),
      researchOnly: true,
    },
    {
      id: 'quiz',
      icon: '📝',
      title: t('help_feature_quiz_title'),
      description: t('help_feature_quiz_desc'),
    },
    {
      id: 'challenge',
      icon: '🧠',
      title: t('help_feature_challenge_title'),
      description: t('help_feature_challenge_desc'),
    },
    {
      id: 'reflection',
      icon: '✍️',
      title: t('help_feature_reflection_title'),
      description: t('help_feature_reflection_desc'),
    },
    {
      id: 'key-takeaways',
      icon: '🎯',
      title: t('help_feature_takeaways_title'),
      description: t('help_feature_takeaways_desc'),
    },
    {
      id: 'discussion-unlock',
      icon: '💬',
      title: t('help_feature_discussion_title'),
      description: t('help_feature_discussion_desc'),
    },
  ];
}

/**
 * Filter and order features for the given mode.
 * - 'research': all features, ordered as defined above
 * - 'general': research-only features are excluded
 */
export function filterFeaturesForMode(
  features: HelpFeature[],
  mode: 'general' | 'research',
): HelpFeature[] {
  if (mode === 'research') return features;
  return features.filter((f) => !f.researchOnly);
}
