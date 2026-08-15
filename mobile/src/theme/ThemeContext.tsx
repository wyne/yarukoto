import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadAccent, saveAccent } from '../data/storage';
import { AccentColor, DEFAULT_ACCENT } from './colors';

interface ThemeContextValue {
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read straight from the cache primed by initStorage(), so the first frame is
  // already the chosen accent rather than flashing the default and correcting.
  const [accent, setAccentState] = useState<AccentColor>(loadAccent);

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next);
    saveAccent(next);
  }, []);

  const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAccent(): string {
  return useContext(ThemeContext).accent;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
