import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { findNodeHandle, NativeSyntheticEvent, Platform, Pressable, ScrollView, View } from 'react-native';
import { useBottomSheetInternal } from '@gorhom/bottom-sheet';
import {
  EnrichedTextInput,
  type BlurEvent,
  type EnrichedTextInputInstance,
  type FocusEvent,
  type OnChangeHtmlEvent,
  type OnChangeStateEvent,
  type OnChangeTextEvent,
} from 'react-native-enriched-html';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { useAccent, useColors } from '../theme/ThemeContext';
import { notesPlainText, toNotesHtml } from '../data/notesHtml';
import {
  IconBold,
  IconCode,
  IconHeading,
  IconItalic,
  IconListBullet,
  IconListCheck,
  IconListNumber,
  IconQuote,
  IconStrikethrough,
  IconProps,
} from '../icons/Icons';

export interface NotesEditorHandle {
  focus: () => void;
  /** Focus and put the caret after everything already written. */
  focusEnd: () => void;
}

interface Props {
  /** The task's stored notes — HTML, or plain text from before this existed. */
  value: string;
  onChangeHtml: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Register with Gorhom so the sheet lifts this field clear of the keyboard. */
  sheet?: boolean;
}

/** Which formatting states the toolbar reflects, keyed as `onChangeState` reports them. */
type FormatKey =
  | 'bold'
  | 'italic'
  | 'strikeThrough'
  | 'h2'
  | 'unorderedList'
  | 'orderedList'
  | 'checkboxList'
  | 'blockQuote'
  | 'inlineCode';

const TOOLS: { key: FormatKey; label: string; Icon: React.ComponentType<IconProps> }[] = [
  { key: 'bold', label: 'Bold', Icon: IconBold },
  { key: 'italic', label: 'Italic', Icon: IconItalic },
  { key: 'strikeThrough', label: 'Strikethrough', Icon: IconStrikethrough },
  { key: 'h2', label: 'Heading', Icon: IconHeading },
  { key: 'unorderedList', label: 'Bulleted list', Icon: IconListBullet },
  { key: 'orderedList', label: 'Numbered list', Icon: IconListNumber },
  { key: 'checkboxList', label: 'Checklist', Icon: IconListCheck },
  { key: 'blockQuote', label: 'Quote', Icon: IconQuote },
  { key: 'inlineCode', label: 'Code', Icon: IconCode },
];

function applyFormat(editor: EnrichedTextInputInstance, key: FormatKey): void {
  switch (key) {
    case 'bold': return editor.toggleBold();
    case 'italic': return editor.toggleItalic();
    case 'strikeThrough': return editor.toggleStrikeThrough();
    case 'h2': return editor.toggleH2();
    case 'unorderedList': return editor.toggleUnorderedList();
    case 'orderedList': return editor.toggleOrderedList();
    case 'checkboxList': return editor.toggleCheckboxList(false);
    case 'blockQuote': return editor.toggleBlockQuote();
    case 'inlineCode': return editor.toggleInlineCode();
  }
}

/**
 * The notes field: a native rich-text editor, plus the toolbar that drives it.
 *
 * Like `NativeOwnedTextInput`, this is controlled to its caller and uncontrolled
 * to the platform — `EnrichedTextInput` owns its content and is only written to
 * imperatively, when the stored value diverges from what this field last
 * emitted. That is the same rule for the same reason, and here it is also the
 * library's design rather than a workaround.
 *
 * Content is read back through `onChangeHtml` on every keystroke rather than by
 * calling `getHTML()` when the draft flushes. Serialising that often costs more,
 * but a flush also happens as the sheet closes and the editor unmounts, and a
 * promise from a view that is going away is not something to stake the last few
 * keystrokes on. Holding the current HTML in JS makes that flush synchronous.
 */
const NotesEditor = forwardRef<NotesEditorHandle, Props>(function NotesEditor(
  { value, onChangeHtml, onFocus, onBlur, sheet = false },
  forwardedRef
) {
  const colors = useColors();
  const accent = useAccent();
  const styles = useStyles();
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<Partial<Record<FormatKey, boolean>>>({});
  // The HTML this field last reported up, so an echo of our own edit is not
  // mistaken for someone else's and pushed back through `setValue`.
  const emittedRef = useRef(toNotesHtml(value));
  const initialRef = useRef(emittedRef.current);
  const plainLengthRef = useRef(0);

  // Gorhom throws outside a sheet, which the wide-layout pane is; null there.
  const sheetInternal = useBottomSheetInternal(true);
  const registered = sheet && !!sheetInternal;

  useImperativeHandle(forwardedRef, () => ({
    focus: () => editorRef.current?.focus(),
    focusEnd: () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      // The caret lands where the field last left it; push it past the existing
      // notes once focus has actually landed.
      requestAnimationFrame(() => {
        editorRef.current?.setSelection(plainLengthRef.current, plainLengthRef.current);
      });
    },
  }), []);

  useEffect(() => {
    const html = toNotesHtml(value);
    if (html === emittedRef.current) return;
    emittedRef.current = html;
    plainLengthRef.current = notesPlainText(html).length;
    editorRef.current?.setValue(html);
  }, [value]);

  // What `BottomSheetTextInput` does for a plain input, for one that can't be
  // wrapped by it. Without this the sheet does not know which field has the
  // keyboard and so does not lift to clear it.
  useEffect(() => {
    if (!registered || !sheetInternal) return;
    const node = findNodeHandle(editorRef.current as never);
    if (node === null) return;
    const { textInputNodesRef, animatedKeyboardState } = sheetInternal;
    textInputNodesRef.current.add(node);
    return () => {
      textInputNodesRef.current.delete(node);
      if (animatedKeyboardState.get().target === node) {
        animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
      }
    };
  }, [registered, sheetInternal]);

  const handleFocus = useCallback((e: FocusEvent) => {
    setFocused(true);
    if (registered && sheetInternal) {
      const target = e.nativeEvent.target;
      sheetInternal.animatedKeyboardState.set((state) => ({ ...state, target }));
    }
    onFocus?.();
  }, [onFocus, registered, sheetInternal]);

  const handleBlur = useCallback((e: BlurEvent) => {
    setFocused(false);
    if (registered && sheetInternal) {
      const target = e.nativeEvent.target;
      if (sheetInternal.animatedKeyboardState.get().target === target) {
        sheetInternal.animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
      }
    }
    onBlur?.();
  }, [onBlur, registered, sheetInternal]);

  const handleChangeHtml = useCallback((e: NativeSyntheticEvent<OnChangeHtmlEvent>) => {
    emittedRef.current = e.nativeEvent.value;
    onChangeHtml(e.nativeEvent.value);
  }, [onChangeHtml]);

  const handleChangeText = useCallback((e: NativeSyntheticEvent<OnChangeTextEvent>) => {
    plainLengthRef.current = e.nativeEvent.value.length;
  }, []);

  const handleChangeState = useCallback((e: NativeSyntheticEvent<OnChangeStateEvent>) => {
    const state = e.nativeEvent;
    setActive({
      bold: state.bold.isActive,
      italic: state.italic.isActive,
      strikeThrough: state.strikeThrough.isActive,
      h2: state.h2.isActive,
      unorderedList: state.unorderedList.isActive,
      orderedList: state.orderedList.isActive,
      checkboxList: state.checkboxList.isActive,
      blockQuote: state.blockQuote.isActive,
      inlineCode: state.inlineCode.isActive,
    });
  }, []);

  return (
    <View>
      <EnrichedTextInput
        ref={editorRef}
        defaultValue={initialRef.current}
        placeholder="Add notes…"
        placeholderTextColor={colors.textFaint}
        cursorColor={accent}
        selectionColor={colors.accentTintBg}
        // The card is inside the detail's own scroll view, so the editor grows
        // to its content rather than scrolling within a fixed box.
        scrollEnabled={false}
        style={styles.editor}
        htmlStyle={{
          // Headings take a size and a weight, and nothing else — the body's
          // font and colour carry through them.
          h1: { fontSize: 20, bold: true },
          h2: { fontSize: 17, bold: true },
          h3: { fontSize: 15.5, bold: true },
          h4: { fontSize: 15, bold: true },
          h5: { fontSize: 15, bold: false },
          h6: { fontSize: 15, bold: false },
          a: { color: accent, textDecorationLine: 'underline' },
          code: { color: colors.textPrimary, backgroundColor: colors.chipBg },
          codeblock: { color: colors.textPrimary, backgroundColor: colors.chipBg, borderRadius: 8 },
          blockquote: { borderColor: colors.dividerStrong, borderWidth: 2, gapWidth: 10, color: colors.textSecondary },
          ul: { bulletColor: colors.textTertiary, bulletSize: 4, marginLeft: 4, gapWidth: 10 },
          ol: { markerColor: colors.textTertiary, marginLeft: 4, gapWidth: 10 },
          ulCheckbox: { boxColor: colors.textTertiary, boxSize: 15, marginLeft: 4, gapWidth: 10 },
        }}
        onChangeHtml={handleChangeHtml}
        onChangeText={handleChangeText}
        onChangeState={handleChangeState}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {focused && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.toolbar}
          contentContainerStyle={styles.toolbarRow}
        >
          {TOOLS.map(({ key, label, Icon }) => {
            const on = active[key] === true;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: on }}
                hitSlop={4}
                style={[styles.toolButton, on && { backgroundColor: colors.accentTintBg }]}
                // The web's contenteditable loses the caret to any element that
                // takes focus, and without the caret there is nothing to format.
                {...(Platform.OS === 'web'
                  ? { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() }
                  : null)}
                onPress={() => {
                  const editor = editorRef.current;
                  if (editor) applyFormat(editor, key);
                }}
              >
                <Icon size={18} color={on ? accent : colors.textSecondary} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

export default NotesEditor;

const useStyles = makeStyles((c) => ({
  editor: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: c.textPrimary,
    marginTop: 6,
    minHeight: 40,
  },
  toolbar: {
    marginTop: 10,
    marginHorizontal: -4,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    paddingTop: 8,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  toolButton: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
}));
