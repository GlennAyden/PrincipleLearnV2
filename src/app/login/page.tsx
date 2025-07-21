// Path: src/app/login/page.tsx
'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // Reset error state
    setError('');
    
    // Validate form
    if (!email.trim() || !password.trim()) {
      setError('Please fill both email and password.');
      return;
    }
    
    // Show loading state
    setIsLoading(true);
    
    try {
      // Use the login function from useAuth hook
      const result = await login(email, password);
      
      if (!result.success) {
        setError(result.error || 'Login failed');
        return;
      }
      
      // Check if user has any courses
      const coursesResponse = await fetch(`/api/courses?userId=${encodeURIComponent(email)}`);
      const coursesResult = await coursesResponse.json();
      
      if (coursesResult.success && coursesResult.courses.length > 0) {
        router.replace('/dashboard');
      } else {
        router.replace('/request-course/step1');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <h1 className={styles.title}>Sign in to PrincipleLearn</h1>
        
        {error && <div className={styles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="Email"
              required
              disabled={isLoading}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              placeholder="Password"
              required
              disabled={isLoading}
            />
          </div>
          <button 
            type="submit" 
            className={styles.signInBtn}
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className={styles.footer}>
          <Link href="/signup">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}
