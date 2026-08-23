import { useMemo } from 'react';
import { FolderDef, ListDef, Task } from './types';
import { activeFolders, orderedLists } from './selectors';

/**
 * The trailing-token autocomplete behind both task-entry surfaces: the pinned
 * bar on web and the composer sheet on native. Shared rather than copied, so the
 * two can't drift into disagreeing about what `~` offers.
 */

export interface Suggestion {
  /** The full token to splice back into the text, e.g. `~Admin`. */
  value: string;
  label: string;
  hint?: string;
}

const PRIORITY_WORDS = ['high', 'medium', 'low', 'none'];

/** Only a token at the very end is being typed; anything earlier is settled. */
const TRAILING = /(^|\s)([~#!])(\S*)$/;

export function useQuickAddSuggestions(
  text: string,
  state: { tasks: Task[]; lists: ListDef[]; folders: FolderDef[] }
): Suggestion[] {
  const tags = useMemo(
    () => Array.from(new Set(state.tasks.flatMap((t) => t.tags))).sort((a, b) => a.localeCompare(b)),
    [state.tasks]
  );
  const folderName = useMemo(
    () => new Map(activeFolders(state.folders).map((f) => [f.id, f.name])),
    [state.folders]
  );
  // `orderedLists`, not `activeLists`: this is one flat sequence, and a list's
  // order is scoped to its folder, so a flat sort would interleave the folders.
  const lists = useMemo(
    () => orderedLists(state.lists, state.folders).map((l) => ({
      label: l.name,
      hint: l.folderId ? folderName.get(l.folderId) : undefined,
    })),
    [state.lists, state.folders, folderName]
  );

  const trailing = text.match(TRAILING);

  return useMemo<Suggestion[]>(() => {
    if (!trailing) return [];
    const prefix = trailing[2];
    const q = trailing[3].toLowerCase();

    if (prefix === '~') {
      return lists
        .filter((s) => s.label.toLowerCase().includes(q) || (s.hint ?? '').toLowerCase().includes(q))
        .slice(0, 6)
        .map((s) => ({ value: `~${s.label}`, label: s.label, hint: s.hint }));
    }
    if (prefix === '#') {
      return tags
        .filter((t) => t.toLowerCase().includes(q))
        .slice(0, 6)
        .map((t) => ({ value: `#${t}`, label: t, hint: 'tag' }));
    }
    return PRIORITY_WORDS.filter((p) => p.includes(q)).map((p) => ({
      value: `!${p}`,
      label: p,
      hint: p === 'none' ? 'clear' : 'priority',
    }));
  }, [trailing?.[2], trailing?.[3], lists, tags]);
}

/**
 * Replaces the half-typed trailing token with a chosen suggestion.
 *
 * The separator has to be located by length rather than by `lastIndexOf`: when
 * the token starts the input the captured separator is `''`, and
 * `''.lastIndexOf` returns the string length — which appended the suggestion
 * instead of replacing, turning `~ad` into `~ad~Admin`.
 */
export function applySuggestion(text: string, value: string): string {
  const m = text.match(TRAILING);
  if (!m) return text;
  const token = m[2] + m[3];
  const start = text.length - token.length;
  return text.slice(0, start) + value + ' ';
}
