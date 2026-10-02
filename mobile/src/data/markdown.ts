export interface TextSelection {
  start: number;
  end: number;
}

export interface TextEdit {
  text: string;
  selection: TextSelection;
}

function normalizedSelection(text: string, selection: TextSelection): TextSelection {
  const start = Math.max(0, Math.min(text.length, Math.min(selection.start, selection.end)));
  const end = Math.max(start, Math.min(text.length, Math.max(selection.start, selection.end)));
  return { start, end };
}

function toggleInline(text: string, selection: TextSelection, marker: string): TextEdit {
  const { start, end } = normalizedSelection(text, selection);
  const before = text.slice(start - marker.length, start);
  const after = text.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    return {
      text: text.slice(0, start - marker.length) + text.slice(start, end) + text.slice(end + marker.length),
      selection: { start: start - marker.length, end: end - marker.length },
    };
  }

  const selected = text.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const unwrapped = selected.slice(marker.length, -marker.length);
    return {
      text: text.slice(0, start) + unwrapped + text.slice(end),
      selection: { start, end: start + unwrapped.length },
    };
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selection: { start: start + marker.length, end: end + marker.length },
  };
}

export function toggleBold(text: string, selection: TextSelection): TextEdit {
  return toggleInline(text, selection, '**');
}

export function toggleItalic(text: string, selection: TextSelection): TextEdit {
  return toggleInline(text, selection, '_');
}

export function toggleStrikethrough(text: string, selection: TextSelection): TextEdit {
  return toggleInline(text, selection, '~~');
}

export function toggleInlineCode(text: string, selection: TextSelection): TextEdit {
  return toggleInline(text, selection, '`');
}

export function insertLink(text: string, selection: TextSelection): TextEdit {
  const { start, end } = normalizedSelection(text, selection);
  const selected = text.slice(start, end);
  if (!selected) {
    const inserted = '[link text](https://)';
    return {
      text: text.slice(0, start) + inserted + text.slice(end),
      selection: { start: start + 1, end: start + 10 },
    };
  }

  const inserted = `[${selected}](https://)`;
  const urlStart = start + selected.length + 3;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selection: { start: urlStart, end: urlStart + 8 },
  };
}

interface SelectedLines {
  start: number;
  end: number;
  lines: string[];
  singleCaret: boolean;
  caretOffset: number;
}

function selectedLines(text: string, selection: TextSelection): SelectedLines {
  const normalized = normalizedSelection(text, selection);
  const start = text.lastIndexOf('\n', normalized.start - 1) + 1;
  const effectiveEnd = normalized.end > normalized.start && text[normalized.end - 1] === '\n'
    ? normalized.end - 1
    : normalized.end;
  const nextBreak = text.indexOf('\n', effectiveEnd);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return {
    start,
    end,
    lines: text.slice(start, end).split('\n'),
    singleCaret: normalized.start === normalized.end,
    caretOffset: normalized.start - start,
  };
}

function replaceLines(
  text: string,
  selection: TextSelection,
  addPrefix: (line: string, index: number) => string,
  removePrefix: (line: string) => string,
  isPrefixed: (line: string) => boolean,
  caretPrefixLength: number
): TextEdit {
  const selected = selectedLines(text, selection);
  const meaningful = selected.lines.filter((line) => line.length > 0);
  const removing = meaningful.length > 0 && meaningful.every(isPrefixed);
  const lines = selected.lines.map((line, index) => {
    if (!line && selected.lines.length > 1) return line;
    return removing ? removePrefix(line) : addPrefix(line, index);
  });
  const replacement = lines.join('\n');
  const nextText = text.slice(0, selected.start) + replacement + text.slice(selected.end);

  if (selected.singleCaret) {
    const delta = removing ? -caretPrefixLength : caretPrefixLength;
    const caret = selected.start + Math.max(0, selected.caretOffset + delta);
    return { text: nextText, selection: { start: caret, end: caret } };
  }
  return {
    text: nextText,
    selection: { start: selected.start, end: selected.start + replacement.length },
  };
}

export function toggleBulletList(text: string, selection: TextSelection): TextEdit {
  return replaceLines(text, selection, (line) => `- ${line}`, (line) => line.slice(2), (line) => line.startsWith('- '), 2);
}

export function toggleQuote(text: string, selection: TextSelection): TextEdit {
  return replaceLines(text, selection, (line) => `> ${line}`, (line) => line.slice(2), (line) => line.startsWith('> '), 2);
}

export function toggleHeading(text: string, selection: TextSelection): TextEdit {
  return replaceLines(text, selection, (line) => `## ${line}`, (line) => line.slice(3), (line) => line.startsWith('## '), 3);
}

export function toggleNumberedList(text: string, selection: TextSelection): TextEdit {
  const numbered = /^\d+\.\s/;
  const current = selectedLines(text, selection);
  const firstMatch = current.lines[0]?.match(numbered);
  const prefixLength = firstMatch?.[0].length ?? 3;
  return replaceLines(
    text,
    selection,
    (line, index) => `${index + 1}. ${line}`,
    (line) => line.replace(numbered, ''),
    (line) => numbered.test(line),
    prefixLength
  );
}

export function toggleCodeBlock(text: string, selection: TextSelection): TextEdit {
  const { start, end } = normalizedSelection(text, selection);
  const opening = '```\n';
  const closing = '\n```';
  if (text.slice(start - opening.length, start) === opening && text.slice(end, end + closing.length) === closing) {
    return {
      text: text.slice(0, start - opening.length) + text.slice(start, end) + text.slice(end + closing.length),
      selection: { start: start - opening.length, end: end - opening.length },
    };
  }

  const selected = text.slice(start, end);
  return {
    text: text.slice(0, start) + opening + selected + closing + text.slice(end),
    selection: { start: start + opening.length, end: end + opening.length },
  };
}

/** A compact, readable summary for activity rows and other plain-text surfaces. */
export function markdownToPlainText(markdown: string, fallback = 'None'): string {
  const plain = markdown
    .replace(/^```[^\n]*\n?/gm, '')
    .replace(/^```$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(^|[^*_])([*_])([^\n]+?)\2/g, '$1$3')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain || fallback;
}
