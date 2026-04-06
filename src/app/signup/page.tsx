// src/app/signup/page.tsx
"use client";

import { useState, FormEvent, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.scss";
import { useAuth } from "@/hooks/useAuth";

// Password strength helper
function getPasswordStrength(password: string) {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels: Record<number, string> = {
    0: '',
    1: 'Weak',
    2: 'Fair',
    3: 'Good',
    4: 'Strong',
  };
  return { score, label: labels[score] || '', checks };
}

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    
    setError("");
    
    if (!email.trim() || !password.trim()) {
      setError("Please fill both email and password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name: name.trim() || undefined }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error?.includes('already exists')) {
          setError("An account with this email already exists. Please try signing in instead.");
        } else {
          setError(data.error || 'Registration failed');
        }
        return;
      }
      
      // Auto-login after successful registration (with rememberMe to set refresh token)
      const loginResult = await login(email, password, true);

      if (loginResult.success) {
        // Redirect to onboarding first (consistent with login flow)
        router.push("/onboarding");
      } else {
        setError("Registration successful, but auto-login failed. Please sign in manually.");
      }
    } catch (err: unknown) {
      setError("Network error. Please check your connection and try again.");
      console.error("Registration error:", err);
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
              <rect width="28" height="28" rx="8" fill="url(#signupLogoGrad)" />
              <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="signupLogoGrad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className={styles.logoText}>PrincipleLearn</span>
        </div>

        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Start your personalized learning journey today</p>
        
        {error && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V8.5M8 10.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className={styles.form}>
          {/* Name field */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-name">Full Name <span className={styles.optionalTag}>(optional)</span></label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M3 16C3 13.24 5.69 11 9 11C12.31 11 15 13.24 15 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                id="signup-name"
                type="text"
                className={styles.input}
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                disabled={isLoading}
                autoComplete="name"
              />
            </div>
          </div>

          {/* Email field */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-email">Email</label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 5L9 10L15 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <input
                id="signup-email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-password">Password</label>
            <div className={styles.inputWrap}>
              <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="4" y="8" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M6 8V5C6 3.34 7.34 2 9 2C10.66 2 12 3.34 12 5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                disabled={isLoading}
                autoComplete="new-password"
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

            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className={styles.strengthWrap}>
                <div className={styles.strengthBar}>
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`${styles.strengthSegment} ${passwordStrength.score >= level ? styles[`strength${passwordStrength.score}`] : ''}`}
                    />
                  ))}
                </div>
                <span className={`${styles.strengthLabel} ${styles[`strengthText${passwordStrength.score}`] || ''}`}>
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Creating account...
              </>
            ) : (
              <>
                Create account
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
          <p>Already have an account?</p>
          <Link href="/login" className={styles.switchLink}>
            Sign in instead
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7H11M11 7L8 4M11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
