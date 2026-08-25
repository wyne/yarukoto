import { StyleSheet } from 'react-native';
import { Palette, palettes } from './colors';
import { useScheme } from './ThemeContext';

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

/**
 * A stylesheet that knows both schemes.
 *
 * `StyleSheet.create` runs when its module is first imported, which is why a
 * colour written into one can never change afterwards — the app had 267 such
 * colours across 49 files, and that, rather than the palette, was what stood
 * between it and dark mode.
 *
 * So build the sheet twice at import and choose between them at render:
 *
 *   const useStyles = makeStyles((c) => ({ screen: { backgroundColor: c.screenBg } }));
 *   // …then inside the component
 *   const styles = useStyles();
 *
 * Both sheets exist before the first render, so switching costs a lookup — no
 * `StyleSheet.create` in the render path, no `useMemo`, no remount, and no
 * frame of the wrong colour on the way in. The cheap alternative, mutating one
 * shared palette and remounting the tree, would have thrown away exactly the
 * no-flash property the accent system was built to keep.
 *
 * Only for colour. A style that varies on anything else — a measured width, an
 * inset — still belongs in the render body.
 */
export function makeStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  build: (colors: Palette) => T & NamedStyles<unknown>
): () => T {
  const sheets = {
    light: StyleSheet.create(build(palettes.light)),
    dark: StyleSheet.create(build(palettes.dark)),
  };
  return function useThemedStyles(): T {
    return sheets[useScheme()] as T;
  };
}
