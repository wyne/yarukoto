import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadAccent, loadScheme, saveAccent, saveScheme } from '../data/storage';
import {
  ACCENT_DARK,
  AccentColor,
  DEFAULT_ACCENT,
  Palette,
  Scheme,
  SchemePref,
  palettes,
} from './colors';

export type { Scheme, SchemePref };

/**
 * Held down while the app is still being converted to `useColors()`.
 *
 * A half-converted app that obeyed the device would be half dark, so the whole
 * mechanism resolves light until every screen can follow. Native is pinned by
 * `userInterfaceStyle: "light"` in app.json regardless, but the web build has
 * no such pin and would otherwise go dark the moment a converted file landed.
 *
 * Lifting this is what turns dark mode on.
 */
const DARK_MODE_READY = false;

interface ThemeContextValue {
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  /** The stored choice, which is what the settings control edits. */
  schemePref: SchemePref;
  setSchemePref: (pref: SchemePref) => void;
  /** The choice resolved against the device. What everything else reads. */
  scheme: Scheme;
  colors: Palette;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
  schemePref: 'system',
  setSchemePref: () => {},
  scheme: 'light',
  colors: palettes.light,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read straight from the cache primed by initStorage(), so the first frame is
  // already the chosen accent rather than flashing the default and correcting.
  const [accent, setAccentState] = useState<AccentColor>(loadAccent);
  const [schemePref, setSchemePrefState] = useState<SchemePref>(loadScheme);
  const device = useColorScheme();

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next);
    saveAccent(next);
  }, []);

  const setSchemePref = useCallback((next: SchemePref) => {
    setSchemePrefState(next);
    saveScheme(next);
  }, []);

  const scheme: Scheme = !DARK_MODE_READY
    ? 'light'
    : schemePref === 'system'
      ? device === 'dark'
        ? 'dark'
        : 'light'
      : schemePref;

  const value = useMemo(
    () => ({
      accent,
      setAccent,
      schemePref,
      setSchemePref,
      scheme,
      colors: palettes[scheme],
    }),
    [accent, setAccent, schemePref, setSchemePref, scheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The accent, already resolved for the current scheme.
 *
 * Callers get the colour to draw with rather than the one that was stored, so
 * nowhere outside this file has to know the two differ.
 */
export function useAccent(): string {
  const { accent, scheme } = useContext(ThemeContext);
  return scheme === 'dark' ? ACCENT_DARK[accent] ?? accent : accent;
}

export function useScheme(): Scheme {
  return useContext(ThemeContext).scheme;
}

/** The palette, for colours decided at render time rather than in a stylesheet. */
export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
