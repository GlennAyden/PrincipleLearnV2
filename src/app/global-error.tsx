'use client';

import { useEffect } from 'react';

/**
 * Global error boundary — catches errors in the root layout itself.
 * Must provide its own <html>/<body> since the root layout may have failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "'Poppins', system-ui, sans-serif",
          backgroundColor: '#f8fafb',
          color: '#1f2937',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            padding: '2.5rem 2rem',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Terjadi Kesalahan Sistem
          </h2>
          <p style={{ fontSize: '1rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Aplikasi mengalami masalah yang tidak terduga. Silakan muat ulang halaman.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.625rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
