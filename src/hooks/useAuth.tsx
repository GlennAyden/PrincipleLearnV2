'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  role: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  networkError: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
  const router = useRouter();

  // Check if user is authenticated on mount (and on retry)
  useEffect(() => {
    const checkAuth = async () => {
      setNetworkError(false);
      try {
        const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setUser({
            id: data.user.id,
            email: data.user.email,
            role: data.user.role,
            name: data.user.name || null,
          });
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setNetworkError(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [authAttempt]);

  // Allow consumer to retry auth check after network failure
  const retryAuth = () => {
    setIsLoading(true);
    setAuthAttempt((prev) => prev + 1);
  };

  // Login function
  const login = async (email: string, password: string, rememberMe = false) => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Gagal masuk' };
      }

      // CSRF token is set as a cookie by the server (httpOnly: false)
      // — no need to store in localStorage

      setUser({
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        name: data.user.name || null,
      });
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Terjadi kesalahan tidak terduga' };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const res = await apiFetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Gagal keluar');
      }

      // Reset state
      setUser(null);

      // Redirect to login page
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Refresh token function
  const refreshToken = async () => {
    try {
      const res = await apiFetch('/api/auth/refresh', {
        method: 'POST',
      });

      if (!res.ok) {
        return false;
      }

      // CSRF token cookie is refreshed by the server response automatically
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        networkError,
        login,
        logout,
        refreshToken,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
