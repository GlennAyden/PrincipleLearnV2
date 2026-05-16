'use client';

import { useAdminMode } from '@/context/AdminModeContext';
import type { AdminMode } from '@/lib/admin-mode';
import styles from './AdminModeToggle.module.scss';

const OPTIONS: Array<{ value: AdminMode; label: string; icon: string }> = [
  { value: 'general',  label: 'Umum',      icon: '🌐' },
  { value: 'research', label: 'Penelitian', icon: '🔬' },
];

export function AdminModeToggle() {
  const { adminMode, setAdminMode } = useAdminMode();

  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Mode admin">
      {OPTIONS.map((opt) => {
        const isActive = adminMode === opt.value;
        return (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={isActive}
            className={styles.option}
            data-active={isActive}
            data-mode={opt.value}
            onClick={() => setAdminMode(opt.value)}
          >
            <span className={styles.icon} aria-hidden="true">{opt.icon}</span>
            <span className={styles.label}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
