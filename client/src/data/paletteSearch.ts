/**
 * How the command menu (⌘K) orders what matches a query.
 *
 * Every word typed has to match somewhere, so "due tom" narrows rather than
 * widens. A match at the start of the title beats one at the start of a word,
 * which beats one inside a word, which beats a keyword — so "in" puts Inbox
 * above "Remove Due Date" and "Find" above anything that merely mentions it.
 * Ties keep the order items came in, which is the order the caller chose.
 */

export interface PaletteEntry {
  title: string;
  /** Extra words that should find this entry without being shown. */
  keywords?: string;
}

const TITLE_START = 0;
const WORD_START = 1;
const INSIDE = 2;
const KEYWORD = 3;
const MISS = Infinity;

function scoreToken(token: string, title: string, keywords: string): number {
  if (title.startsWith(token)) return TITLE_START;
  if (title.split(/[^a-z0-9]+/).some((word) => word.startsWith(token))) return WORD_START;
  if (title.includes(token)) return INSIDE;
  if (keywords.split(/\s+/).some((word) => word.startsWith(token))) return KEYWORD;
  return MISS;
}

export function rankPaletteItems<T extends PaletteEntry>(items: readonly T[], query: string): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...items];
  return items
    .map((item, index) => {
      const title = item.title.toLowerCase();
      const keywords = (item.keywords ?? '').toLowerCase();
      let score = 0;
      for (const token of tokens) {
        const s = scoreToken(token, title, keywords);
        if (s === MISS) return null;
        score += s;
      }
      return { item, index, score };
    })
    .filter((r): r is { item: T; index: number; score: number } => r !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((r) => r.item);
}
