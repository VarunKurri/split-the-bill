import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'split-the-bill:theme';

/**
 * The theme is owned by the `<html>` element's `data-theme`, not by React.
 *
 * The inline script in `index.html` sets it before first paint, so this hook
 * reads what is already there rather than deciding it again — otherwise the
 * first render would disagree with the DOM for a frame.
 *
 * Until someone picks a side, the OS preference wins and keeps winning: a
 * laptop that flips to dark at sunset flips the app with it. Choosing a theme
 * stores it and ends that.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function followSystem(event: MediaQueryListEvent) {
      if (localStorage.getItem(STORAGE_KEY)) return;
      apply(event.matches ? 'dark' : 'light');
      setTheme(event.matches ? 'dark' : 'light');
    }

    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode. The theme still applies for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
