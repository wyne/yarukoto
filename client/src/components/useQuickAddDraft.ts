import { useCallback, useRef, useState } from 'react';
import { QuickAddDefaults, useTasks } from '../data/TaskContext';
import { Priority } from '../data/types';
import {
  parseQuickAdd,
  QuickAddRange,
  QuickAddSpan,
  quickAddSpans,
  removeQuickAddSpans,
  shiftLiteralRanges,
} from '../data/quickAdd';

const WHEN_KINDS = new Set<QuickAddSpan['kind']>(['date', 'time', 'repeat']);

type SpanMatch = (span: QuickAddSpan, word: string) => boolean;

/**
 * A task being typed into a quick-add field, plus what its tool buttons set.
 *
 * Shared by the phone composer and the desktop add bar, so the two can't
 * disagree about how a tool and a typed word settle who sets a field. Typed
 * tokens win over the tools — so a tool that sets something a typed word
 * already set deals with the word: clearing keeps it as title text, and picking
 * a different value takes it out.
 */
export function useQuickAddDraft() {
  const { state, addTaskFromQuickAdd } = useTasks();
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<Priority>('none');
  const [tags, setTags] = useState<string[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  // Typed words the person cleared with a tool: still in the title, no longer tokens.
  const [literal, setLiteral] = useState<QuickAddRange[]>([]);
  const textRef = useRef('');

  /** A blank draft carrying only what the view scopes to. */
  const reset = useCallback((d?: QuickAddDefaults) => {
    setText('');
    textRef.current = '';
    setLiteral([]);
    setDueDate(d?.dueDate);
    setDueTime(d?.dueTime);
    setPriority(d?.priority ?? 'none');
    setTags(d?.tags ?? []);
    setListId(d?.listId ?? null);
  }, []);

  /** Every edit to the field, so the kept words move with the text around them. */
  const changeText = (next: string) => {
    const prev = textRef.current;
    textRef.current = next;
    setText(next);
    setLiteral((ranges) => shiftLiteralRanges(prev, next, ranges));
  };

  const typedSpans = (match: SpanMatch) =>
    quickAddSpans(text, new Date(), literal).filter((s) => match(s, text.slice(s.start, s.end)));

  /** Clearing: the word stays, as title text, or the only way to unset "today" would be to delete it. */
  const keepAsText = (match: SpanMatch) => {
    const hits = typedSpans(match);
    if (hits.length > 0) setLiteral((ranges) => [...ranges, ...hits.map(({ start, end }) => ({ start, end }))]);
  };

  /**
   * A different value: the word goes, since the pick is what was meant, and a
   * custom date or a list name with a space in it has no word to rewrite it as.
   */
  const replaceTyped = (match: SpanMatch) => {
    const hits = typedSpans(match);
    if (hits.length === 0) return;
    const next = removeQuickAddSpans(text, hits, literal);
    textRef.current = next.text;
    setText(next.text);
    setLiteral(next.literal);
  };

  const parsed = text.trim() ? parseQuickAdd(text, new Date(), literal) : null;
  const typedListId = parsed?.listName
    ? state.lists.find((l) => !l.deletedAt && l.name.toLowerCase() === parsed.listName!.toLowerCase())?.id
    : undefined;

  /** What will be created: typed tokens over the tools, as `addTaskFromQuickAdd` resolves it. */
  const effective = {
    dueDate: parsed?.dueDate ?? dueDate,
    dueTime: parsed?.dueTime ?? dueTime,
    priority: parsed && parsed.priority !== 'none' ? parsed.priority : priority,
    tags: Array.from(new Set([...tags, ...(parsed?.tags ?? [])])),
    listId: typedListId ?? listId,
  };

  const changeDue = (nextDate: string | undefined, nextTime: string | undefined) => {
    // A repeat is a date too, so clearing the date keeps "every monday" as words.
    if (!nextDate) keepAsText((s) => WHEN_KINDS.has(s.kind));
    // The time goes with a replaced date: a typed one only counts beside a
    // typed date, and the pick carries it over anyway.
    else if (parsed?.dueDate && nextDate !== parsed.dueDate)
      replaceTyped((s) => s.kind === 'date' || s.kind === 'time');
    else if (!nextTime) keepAsText((s) => s.kind === 'time');
    else if (parsed?.dueTime && nextTime !== parsed.dueTime) replaceTyped((s) => s.kind === 'time');
    setDueDate(nextDate);
    setDueTime(nextTime);
  };

  const choosePriority = (next: Priority) => {
    if (next === 'none') keepAsText((s) => s.kind === 'priority');
    else if (next !== effective.priority) replaceTyped((s) => s.kind === 'priority');
    setPriority(next);
  };

  const chooseList = (next: string | null) => {
    if (next === null) keepAsText((s) => s.kind === 'list');
    else if (next !== effective.listId) replaceTyped((s) => s.kind === 'list');
    setListId(next);
  };

  const keepTagAsText = (tag: string) =>
    keepAsText((s, word) => s.kind === 'tag' && word.slice(1).toLowerCase() === tag);

  const toggleTag = (tag: string) => {
    if (parsed?.tags.includes(tag)) {
      keepTagAsText(tag);
      setTags((prev) => prev.filter((t) => t !== tag));
      return;
    }
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  /** The whole set at once, from a picker that edits all of them. */
  const applyTags = (next: string[]) => {
    for (const tag of parsed?.tags ?? []) if (!next.includes(tag)) keepTagAsText(tag);
    setTags(next);
  };

  const canSubmit = !!parsed?.title.trim();

  /** Adds the task, returning its id; undefined when there's no title yet. */
  const commit = () => {
    if (!canSubmit) return undefined;
    return addTaskFromQuickAdd(text, { listId, tags, dueDate, dueTime, priority }, literal);
  };

  return {
    text,
    literal,
    parsed,
    effective,
    canSubmit,
    reset,
    changeText,
    changeDue,
    choosePriority,
    chooseList,
    toggleTag,
    applyTags,
    commit,
  };
}
