// src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

/**
 * Helper function to get user-specific storage key
 * This ensures courses are unique per user
 */
export function getUserSpecificKey(baseKey: string): string {
  // Only apply user-specific naming for course data
  if (baseKey === 'pl_courses') {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        const userJson = window.localStorage.getItem('pl_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          if (user && user.email) {
            // Create a user-specific key based on email
            return `${baseKey}_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
          }
        }
      }
    } catch (error) {
      console.warn('Error getting user-specific key:', error);
    }
  }
  // Return original key for non-course data or if user isn't available
  return baseKey;
}

/**
 * Custom hook for interacting with localStorage,
 * with shallow merge support for object values (non-array).
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Use user-specific key for courses
  const storageKey = getUserSpecificKey(key);
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // On mount, read from localStorage
  useEffect(() => {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        const item = window.localStorage.getItem(storageKey);
        if (item !== null) {
          setStoredValue(JSON.parse(item));
        }
      }
    } catch (error) {
      console.warn(`useLocalStorage: getItem error for key "${storageKey}":`, error);
    }
  }, [storageKey]);

  // Setter that merges when both current and new value are plain objects
  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      // Determine the new value
      const valueToStore =
        typeof value === 'function'
          ? (value as (prev: T) => T)(storedValue)
          : value;

      let mergedValue = valueToStore;
      // Shallow merge if both old and new are objects (and not arrays)
      if (
        storedValue &&
        typeof storedValue === 'object' &&
        !Array.isArray(storedValue) &&
        valueToStore &&
        typeof valueToStore === 'object' &&
        !Array.isArray(valueToStore)
      ) {
        mergedValue = { ...(storedValue as any), ...(valueToStore as any) } as T;
      }

      // Update state and localStorage
      setStoredValue(mergedValue);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, JSON.stringify(mergedValue));
      }
    } catch (error) {
      console.warn(`useLocalStorage: setItem error for key "${storageKey}":`, error);
    }
  };

  // Remove key entirely
  const remove = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKey);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`useLocalStorage: removeItem error for key "${storageKey}":`, error);
    }
  };

  return [storedValue, setValue, remove] as const;
}
