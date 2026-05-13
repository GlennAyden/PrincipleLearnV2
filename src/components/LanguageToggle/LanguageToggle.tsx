'use client';

import { useLocale } from '@/context/LocaleContext';
import styles from './LanguageToggle.module.scss';

type Props = {
  className?: string;
};

export default function LanguageToggle({ className }: Props) {
  const { locale, setLocale, t } = useLocale();
  const next = locale === 'id' ? 'en' : 'id';
  const ariaLabel = locale === 'id' ? t('toggle_aria_to_en') : t('toggle_aria_to_id');

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ''}`.trim()}
      aria-label={ariaLabel}
      aria-pressed={locale === 'en'}
      onClick={() => setLocale(next)}
      data-testid="language-toggle"
    >
      <span className={locale === 'id' ? styles.active : styles.inactive}>ID</span>
      <span className={styles.divider} aria-hidden="true">/</span>
      <span className={locale === 'en' ? styles.active : styles.inactive}>EN</span>
    </button>
  );
}
