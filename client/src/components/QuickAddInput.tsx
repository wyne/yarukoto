import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextInput, TextStyle, View } from 'react-native';
import NativeOwnedTextInput from './NativeOwnedTextInput';
import { parseQuickAdd, QuickAddRange, quickAddSpans, QuickAddTokenKind } from '../data/quickAdd';
import { Priority } from '../data/types';
import { Palette, priorityColor } from '../theme/colors';
import { useAccent, useColors } from '../theme/ThemeContext';

type Props = React.ComponentProps<typeof NativeOwnedTextInput> & {
  style?: StyleProp<TextStyle>;
  /** Runs of `value` kept as plain title text, so they aren't tinted as tokens. */
  literal?: readonly QuickAddRange[];
};

const NO_LITERAL: readonly QuickAddRange[] = [];

interface Segment {
  text: string;
  kind?: QuickAddTokenKind;
}

/**
 * The text field both task-entry surfaces type into, with every token the
 * quick-add parser recognizes tinted where it was typed. The tints come from
 * `quickAddSpans`, the same pass that builds the task, so a highlighted word is
 * exactly a word that won't end up in the title.
 *
 * Native fields (iOS, the Mac, Android) take the runs as styled `<Text>`
 * children, which React Native turns into attributed text. React Native Web
 * ignores a field's children, so there the field's own text is made transparent
 * over a copy drawn behind it — the same text, wrapped and scrolled the same
 * way, with the tokens tinted.
 */
const QuickAddInput = forwardRef<TextInput, Props>(function QuickAddInput({ value, style, literal = NO_LITERAL, ...props }, ref) {
  const colors = useColors();
  const accent = useAccent();
  const segments = useMemo(() => segmentsOf(value, literal), [value, literal]);
  // The one priority token takes the colour of the priority it sets.
  const priority = useMemo(() => parseQuickAdd(value, new Date(), literal).priority, [value, literal]);
  const paint = (kind: QuickAddTokenKind) => tokenColors(kind, priority, colors, accent);

  if (Platform.OS !== 'web') {
    return (
      <NativeOwnedTextInput ref={ref} value={value} style={style} {...props}>
        {/* One <Text> around the runs: iOS hands a field's children straight to
            native, where a bare string is an error. */}
        <Text>
          {segments.map((s, i) =>
            s.kind ? (
              <Text key={i} style={paint(s.kind)}>
                {s.text}
              </Text>
            ) : (
              s.text
            )
          )}
        </Text>
      </NativeOwnedTextInput>
    );
  }

  return <WebHighlightedInput ref={ref} value={value} style={style} segments={segments} paint={paint} {...props} />;
});

export default QuickAddInput;

const WebHighlightedInput = forwardRef<
  TextInput,
  Props & { segments: Segment[]; paint: (kind: QuickAddTokenKind) => { color: string; backgroundColor: string } }
>(function WebHighlightedInput({ value, style, segments, paint, multiline, ...props }, ref) {
  const inputRef = useRef<TextInput>(null);
  const mirrorRef = useRef<View>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  const flat = StyleSheet.flatten(style) ?? {};
  const textColor = flat.color;

  // A field scrolls its text under the caret — sideways on one line, down on
  // several — and the copy behind has to scroll with it. Not every browser
  // reports a caret-driven scroll as a scroll event, so the keys and clicks
  // that move the caret re-check it too.
  useEffect(() => {
    const field = inputRef.current as unknown as HTMLElement | null;
    const mirror = mirrorRef.current as unknown as HTMLElement | null;
    if (!field || !mirror) return;
    const sync = () => {
      mirror.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
    };
    const later = () => requestAnimationFrame(sync);
    const events = ['scroll', 'input', 'keydown', 'keyup', 'click', 'select', 'focus', 'blur'];
    events.forEach((e) => field.addEventListener(e, later));
    sync();
    return () => events.forEach((e) => field.removeEventListener(e, later));
  }, []);

  useEffect(() => {
    const field = inputRef.current as unknown as HTMLElement | null;
    const mirror = mirrorRef.current as unknown as HTMLElement | null;
    if (field && mirror) mirror.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
  }, [value]);

  return (
    <View style={[styles.webWrap, flat.flex !== undefined && { flex: flat.flex }]}>
      <View pointerEvents="none" aria-hidden style={[styles.webClip, !multiline && styles.webClipSingle]}>
        <Text
          ref={mirrorRef as never}
          style={[
            mirrorType(flat),
            styles.webMirror,
            // A single-line field centres its line; several lines start at the top.
            multiline ? styles.webMirrorMultiline : styles.webMirrorSingle,
          ]}
        >
          {segments.map((s, i) =>
            s.kind ? (
              <Text key={i} style={[styles.webToken, webHalo(paint(s.kind))]}>
                {s.text}
              </Text>
            ) : (
              s.text
            )
          )}
          {/* A trailing newline or space would otherwise collapse out of the copy. */}
          {'​'}
        </Text>
      </View>
      <NativeOwnedTextInput
        ref={inputRef}
        value={value}
        multiline={multiline}
        style={[style, styles.webField, { caretColor: textColor } as TextStyle]}
        {...props}
      />
    </View>
  );
});

const MIRRORED_KEYS = [
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'padding',
  'paddingHorizontal',
  'paddingVertical',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
] as const;

/**
 * The copy has to set its text exactly as the field does, so it takes the
 * field's type and padding — but none of its sizing, which belongs to the box
 * they share.
 */
function mirrorType(flat: TextStyle): TextStyle {
  const out: Record<string, unknown> = {};
  for (const key of MIRRORED_KEYS) if (flat[key] !== undefined) out[key] = flat[key];
  return out as TextStyle;
}

const WHEN = new Set<QuickAddTokenKind>(['date', 'time', 'repeat']);

/** The input cut into plain runs and token runs, in order. */
function segmentsOf(text: string, literal: readonly QuickAddRange[]): Segment[] {
  if (!text) return [];
  const segments: Segment[] = [];
  let at = 0;
  for (const span of quickAddSpans(text, new Date(), literal)) {
    const gap = text.slice(at, span.start);
    const prev = segments[segments.length - 1];
    // "fri 6pm" reads as one when, so it gets one tint rather than two.
    if (prev?.kind && WHEN.has(prev.kind) && WHEN.has(span.kind) && !gap.trim()) {
      prev.text += text.slice(at, span.end);
    } else {
      if (gap) segments.push({ text: gap });
      segments.push({ text: text.slice(span.start, span.end), kind: span.kind });
    }
    at = span.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}

/**
 * One tint per kind of token, matching the chips under the field: dates and
 * repeats in the accent, the priority in its own colour, tags and lists quiet.
 */
function tokenColors(
  kind: QuickAddTokenKind,
  priority: Priority,
  colors: Palette,
  accent: string
): { color: string; backgroundColor: string } {
  switch (kind) {
    case 'date':
    case 'time':
    case 'repeat':
      return { color: accent, backgroundColor: colors.accentTintBg };
    case 'priority':
      if (priority !== 'none') return { color: priorityColor(priority, colors), backgroundColor: colors.priorityHighBg };
      return { color: colors.textSecondary, backgroundColor: colors.chipBg };
    default:
      return { color: colors.textSecondary, backgroundColor: colors.chipBg };
  }
}

/**
 * The web can round a run and pad it a little with a shadow in its own colour, which
 * changes nothing about where the text falls — so it still lines up with the
 * caret in the field above it.
 */
function webHalo({ color, backgroundColor }: { color: string; backgroundColor: string }): TextStyle {
  return { color, backgroundColor, boxShadow: `0 0 0 1.5px ${backgroundColor}` } as TextStyle;
}

const styles = StyleSheet.create({
  webWrap: {
    position: 'relative',
    minWidth: 0,
  },
  webClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  webClipSingle: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  webMirror: {
    margin: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  webMirrorSingle: {
    // The field scrolls sideways past its own width rather than wrapping.
    whiteSpace: 'pre',
  } as TextStyle,
  webMirrorMultiline: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    width: '100%',
  } as TextStyle,
  webToken: {
    borderRadius: 4,
  },
  webField: {
    color: 'transparent',
    backgroundColor: 'transparent',
  },
});
