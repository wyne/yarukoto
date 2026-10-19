// A small line diff for the Activity feed. Notes are markdown edited a line at a
// time, so lines are the unit a reader recognises; the feed shows only the lines
// that changed, the way `git diff` does without its context lines.

export interface NotesDiffLine {
  kind: 'removed' | 'added';
  text: string;
}

export interface NotesDiff {
  lines: NotesDiffLine[];
  /** Changed lines beyond the ones returned. */
  hidden: number;
}

/** Characters of unchanged text kept in front of an edit inside a line. */
const LEAD_CONTEXT = 18;
/** Past this many cells the middle is shown as replaced wholesale, not aligned. */
const MAX_LCS_CELLS = 250_000;

type Op = { kind: 'same' | 'removed' | 'added'; text: string };

function splitLines(notes: string): string[] {
  return notes.length === 0 ? [] : notes.replace(/\r\n?/g, '\n').split('\n');
}

function diffLines(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops: Op[] = a.slice(0, start).map((text) => ({ kind: 'same', text }));

  if (midA.length * midB.length > MAX_LCS_CELLS) {
    ops.push(...midA.map((text): Op => ({ kind: 'removed', text })));
    ops.push(...midB.map((text): Op => ({ kind: 'added', text })));
  } else {
    // lcs[i][j] is the longest common subsequence of midA[i..] and midB[j..].
    const lcs = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        ops.push({ kind: 'same', text: midA[i++] });
        j++;
      } else if (j < midB.length && (i === midA.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
        ops.push({ kind: 'added', text: midB[j++] });
      } else {
        ops.push({ kind: 'removed', text: midA[i++] });
      }
    }
  }

  ops.push(...a.slice(endA).map((text): Op => ({ kind: 'same', text })));
  return ops;
}

/**
 * Drops most of the unchanged text in front of an edit, so a change at the end
 * of a long line is still on screen once the row truncates the tail.
 */
function focusEdit(line: string, editStart: number): string {
  if (editStart <= LEAD_CONTEXT) return line;
  let cut = editStart - LEAD_CONTEXT;
  const space = line.indexOf(' ', cut);
  if (space !== -1 && space < editStart) cut = space + 1;
  return `…${line.slice(cut)}`;
}

/** A list item's own `-` reads as part of the diff sign, so it shows as a bullet. */
function displayLine(line: string): string {
  return line.replace(/^(\s*)[-*+] /, '$1• ');
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** The changed lines between two versions of a note, or none if only blank lines moved. */
export function diffNotes(before: string, after: string, maxLines = 3): NotesDiff {
  const ops = diffLines(splitLines(before), splitLines(after));
  const lines: NotesDiffLine[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === 'same') {
      k++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (k < ops.length && ops[k].kind !== 'same') {
      (ops[k].kind === 'removed' ? removed : added).push(ops[k].text);
      k++;
    }
    // A line replaced by one line is an edit within it: show both from where they part.
    if (removed.length === 1 && added.length === 1) {
      const start = commonPrefix(removed[0], added[0]);
      removed[0] = focusEdit(removed[0], start);
      added[0] = focusEdit(added[0], start);
    }
    for (const text of removed) if (text.trim()) lines.push({ kind: 'removed', text: displayLine(text) });
    for (const text of added) if (text.trim()) lines.push({ kind: 'added', text: displayLine(text) });
  }
  return { lines: lines.slice(0, maxLines), hidden: Math.max(0, lines.length - maxLines) };
}
