import React, { createContext, useContext, useMemo, useState } from 'react';
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
  const [accent, setAccent] = useState<AccentColor>(DEFAULT_ACCENT);
  const value = useMemo(() => ({ accent, setAccent }), [accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAccent(): string {
  return useContext(ThemeContext).accent;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
