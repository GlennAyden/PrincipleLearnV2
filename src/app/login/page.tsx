// Path: src/app/login/page.tsx
'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    setError('');
    
    if (!email.trim() || !password.trim()) {
      setError('Please fill both email and password.');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const result = await login(email, password, rememberMe);
      
      if (!result.success) {
        setError(result.error || 'Login failed');
        return;
      }

      // Check if learning profile exists
      const meRes = await fetch('/api/auth/me');
      const meData = meRes.ok ? await meRes.json() : null;
      const userId = meData?.user?.id;

      if (userId) {
        try {
          const profileRes = await fetch(`/api/learning-profile?userId=${userId}`);
          const profileData = await profileRes.json();
          if (!profileData.exists) {
            router.replace('/onboarding');
            return;
          }
        } catch {
          // If profile check fails, continue to dashboard
        }

        // Use userId (not email) for courses query
        const coursesResponse = await fetch(`/api/courses?userId=${encodeURIComponent(userId)}`);
        const coursesResult = await coursesResponse.json();
        
        if (coursesResult.success && coursesResult.courses.length > 0) {
          router.replace('/dashboard');
        } else {
          router.replace('/request-course/step1');
        }
      } else {
        // Fallback: go to dashboard if we can't get userId
        router.replace('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading skeleton while checking auth state
  if (authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.bgOrb1} />
        <div className={styles.bgOrb2} />
        <div className={styles.card}>
          <div className={styles.skeletonGroup}>
            <div className={styles.skeletonLogo} />
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonSubtitle} />
            <div className={styles.skeletonInput} />
            <div className={styles.skeletonInput} />
            <div className={styles.skeletonButton} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Background decorations */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      {/* Back to home */}
      <Link href="/" className={styles.backHome}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M15 10H5M5 10L9 6M5 10L9 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Home
      </Link>

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>
            <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="url(#loginLogoGrad)" />
              <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="loginLogoGrad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className={styles.logoText}>PrincipleLearn</span>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to continue your learning journey</p>
        
        {error && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V8.5M8 10.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 5L9 10L15 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <input
                id="login-email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">Password</label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="4" y="8" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M6 8V5C6 3.34 7.34 2 9 2C10.66 2 12 3.34 12 5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="Enter your password"
                required
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2 9C2 9 5 4 9 4C13 4 16 9 16 9C16 9 13 14 9 14C5 14 2 9 2 9Z" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2 9C2 9 5 4 9 4C13 4 16 9 16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M3 15L15 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password row */}
          <div className={styles.rememberRow}>
            <label className={styles.rememberLabel}>
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.rememberCheckbox}
                disabled={isLoading}
              />
              <span className={styles.rememberText}>Remember me</span>
            </label>
            <Link href="/forgot-password" className={styles.forgotLink}>
              Forgot password?
            </Link>
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <div className={styles.footer}>
          <p>Don&apos;t have an account?</p>
          <Link href="/signup" className={styles.switchLink}>
            Create an account
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7H11M11 7L8 4M11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
