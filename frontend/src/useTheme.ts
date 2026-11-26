/**
 * useTheme — manages light/dark theme preference.
 *
 * Issue #274: Dark theme and user-preference theme switch
 *
 * Priority order for initial theme selection:
 *  1. Value previously saved to localStorage ('light' | 'dark')
 *  2. OS/browser prefers-color-scheme media query
 *  3. Default: 'light'
 *
 * Setting a theme applies `data-theme="<value>"` to `<html>` so that the
 * CSS custom-property overrides in index.css (`[data-theme="dark"]`) take
 * effect immediately.  The choice is also persisted to localStorage so it
 * survives page reloads and new sessions.
 */

import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'cosmosvote:theme';

/** Read the initial theme from localStorage or system preference. */
function resolveInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage may be unavailable (private browsing, security policy)
  }
  // Fall back to system preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Apply `data-theme` attribute to the document root element. */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Persist the selected theme to localStorage. */
function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore write failures (private browsing, quota exceeded, etc.)
  }
}

export interface UseThemeReturn {
  /** Current active theme. */
  theme: Theme;
  /** Toggle between 'light' and 'dark'. */
  toggleTheme: () => void;
  /** Set a specific theme. */
  setTheme: (theme: Theme | ((prev: Theme) => Theme)) => void;
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  // Apply theme to DOM on first render and whenever it changes
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  // Listen for changes made in other tabs / windows
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue as Theme);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setTheme = useCallback((value: Theme | ((prev: Theme) => Theme)) => {
    setThemeState(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme, setTheme };
}
