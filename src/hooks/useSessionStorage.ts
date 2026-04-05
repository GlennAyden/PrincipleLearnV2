// src/hooks/useSessionStorage.ts
import { useState, useEffect } from 'react';

/**
 * Custom hook for sessionStorage — scoped to the browser tab/session.
 *
 * Use this instead of useLocalStorage for data that:
 *  - Contains student learning interactions (Q&A, challenge answers, reflections)
 *  - Does NOT need to persist across browser restarts
 *  - Should be automatically cleared when the tab closes
 *
 * This limits the window of exposure if an XSS vulnerability exists,
 * since sessionStorage is cleared on tab close and is not accessible
 * from other tabs (unlike localStorage).
 */
export function useSessionStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // On mount, read from sessionStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const item = window.sessionStorage.getItem(key);
        if (item !== null) {
          setStoredValue(JSON.parse(item));
        }
      }
    } catch (error) {
      console.warn(`useSessionStorage: getItem error for key "${key}":`, error);
    }
  }, [key]);

  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      const valueToStore =
        typeof value === 'function'
          ? (value as (prev: T) => T)(storedValue)
          : value;

      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`useSessionStorage: setItem error for key "${key}":`, error);
    }
  };

  const remove = () => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`useSessionStorage: removeItem error for key "${key}":`, error);
    }
  };

  return [storedValue, setValue, remove] as const;
}
