'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Admin] Page error:', error);
  }, [error]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Terjadi Kesalahan</h2>
        <p style={styles.message}>
          Maaf, terjadi masalah saat memuat halaman admin ini. Silakan coba lagi
          atau navigasi ke halaman lain.
        </p>
        {error.digest && (
          <p style={styles.digest}>Kode error: {error.digest}</p>
        )}
        <div style={styles.actions}>
          <button onClick={reset} style={styles.retryButton}>
            Coba Lagi
          </button>
          <button
            onClick={() => router.push('/admin/dashboard')}
            style={styles.homeButton}
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '50vh',
    padding: '2rem',
  },
  card: {
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
    padding: '2.5rem 2rem',
    borderRadius: '12px',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '0.75rem',
  },
  message: {
    fontSize: '1rem',
    color: '#6b7280',
    lineHeight: 1.6,
    marginBottom: '1.5rem',
  },
  digest: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    marginBottom: '1.5rem',
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
  },
  retryButton: {
    padding: '0.625rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  homeButton: {
    padding: '0.625rem 1.5rem',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '0.95rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
