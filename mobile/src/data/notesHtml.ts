/**
 * Notes are stored in `Task.notes` as HTML — the format `EnrichedTextInput`
 * reads and writes. The field stays an ordinary string, so nothing about the
 * sync protocol changes: no `SERVER_FEATURES` id, no stripping in `pushDirty`,
 * and every already-deployed server keeps the value verbatim.
 *
 * What the format change does cost is a discriminator. Notes written before
 * this are plain text, and there is nowhere to record which is which that an
 * older server would carry — so the two are told apart by shape instead. That
 * only has to be reliable in one direction: anything the editor emits is
 * recognisably HTML, and a plain-text note that happens to open with a block
 * tag was already going to render as markup.
 *
 * A legacy note is converted when the editor first writes it back, never on
 * read. Opening a task does not rewrite its notes, so nothing is migrated in
 * bulk and nothing changes under a client that has not been updated yet.
 */

/** Anything the editor emits starts with one of these; plain prose does not. */
const HTML_BLOCK = /^\s*<(p|h[1-6]|ul|ol|li|blockquote|pre|div|img)[\s/>]/i;

const ESCAPED: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const UNESCAPED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function isNotesHtml(value: string): boolean {
  return HTML_BLOCK.test(value);
}

/**
 * The editor's input format. HTML passes through untouched; a legacy plain-text
 * note becomes one paragraph per line, escaped so `a < b` stays `a < b` rather
 * than being read as a tag.
 */
export function toNotesHtml(value: string): string {
  if (!value) return '';
  if (isNotesHtml(value)) return value;
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${line.replace(/[&<>]/g, (ch) => ESCAPED[ch])}</p>`)
    .join('');
}

/**
 * The readable text inside a note, for the places that show or compare notes
 * without rendering them — the row indicator and the history diff. Block tags
 * become line breaks so words either side of one don't run together.
 */
export function notesPlainText(value: string): string {
  if (!isNotesHtml(value)) return value.trim();
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (whole, name: string) => UNESCAPED[name.toLowerCase()] ?? whole)
    .trim();
}

/**
 * Whether a note holds anything worth flagging on a row. An emptied editor
 * still leaves an empty paragraph behind, which is why the raw string's length
 * is not the question being asked.
 */
export function hasNotesContent(value: string): boolean {
  if (/<img[\s/>]/i.test(value)) return true;
  return notesPlainText(value).length > 0;
}
