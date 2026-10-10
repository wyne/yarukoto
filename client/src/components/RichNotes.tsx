import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, TextInputProps, View } from 'react-native';
import Markdown, { ASTNode, MarkdownIt, MarkdownStyles, RenderRules } from 'react-native-markdown-renderer';
import { useAccent } from '../theme/ThemeContext';
import { makeStyles } from '../theme/styles';
import { useCommand } from '../navigation/MenuCommands';
import { fonts } from '../theme/typography';
import {
  TextEdit,
  TextSelection,
  insertLink,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleQuote,
  toggleStrikethrough,
} from '../data/markdown';
import Pressable from './HoverPressable';
import NativeOwnedTextInput from './NativeOwnedTextInput';

const markdownParser = MarkdownIt({ html: false, linkify: true, typographer: true });

function renderCode(node: ASTNode, styles: MarkdownStyles) {
  return (
    <ScrollView
      key={node.key}
      horizontal
      style={styles.codeScroll as never}
      contentContainerStyle={styles.codeScrollContent as never}
      showsHorizontalScrollIndicator={false}
    >
      <Text style={styles.codeBlock as never}>{node.content.replace(/\n$/, '')}</Text>
    </ScrollView>
  );
}

const markdownRules: RenderRules = {
  image: (node, _children, _parents, styles) => (
    <Text key={node.key} style={styles.imagePlaceholder as never}>
      {node.content ? `[Image omitted: ${node.content}]` : '[Image omitted]'}
    </Text>
  ),
  code_block: (node, _children, _parents, styles) => renderCode(node, styles),
  fence: (node, _children, _parents, styles) => renderCode(node, styles),
};

function openSafeLink(url: string): boolean {
  if (!/^(https?:|mailto:)/i.test(url)) return false;
  void Linking.openURL(url).catch(() => undefined);
  return true;
}

export interface RichNotesHandle {
  focusAtEnd: () => void;
}

interface Props {
  taskId: string;
  value: string;
  onChangeText: (value: string) => void;
  onFlush: () => void;
  sheet?: boolean;
  inputAccessoryViewID?: string;
  onFocus?: TextInputProps['onFocus'];
  onBlur?: TextInputProps['onBlur'];
}

interface ToolbarItem {
  label: string;
  accessibilityLabel: string;
  action: (text: string, selection: TextSelection) => TextEdit;
  textStyle?: object;
}

const RichNotes = forwardRef<RichNotesHandle, Props>(function RichNotes(
  { taskId, value, onChangeText, onFlush, sheet, inputAccessoryViewID, onFocus, onBlur },
  forwardedRef
) {
  const accent = useAccent();
  const styles = useStyles();
  const inputRef = useRef<TextInput>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const selectionRef = useRef<TextSelection>({ start: value.length, end: value.length });
  const focusWhenMountedRef = useRef(false);
  const [editing, setEditing] = useState(() => value.trim().length === 0);
  const [focused, setFocused] = useState(false);

  const focusEditor = () => {
    selectionRef.current = { start: valueRef.current.length, end: valueRef.current.length };
    // Already editing — empty notes start that way — so there is no mount to
    // wait for, and setting it again wouldn't run the effect below.
    if (editing && inputRef.current) {
      const selection = selectionRef.current;
      inputRef.current.focus();
      // A frame later, as below: the web has no caret command to call at once.
      requestAnimationFrame(() => placeCaret(selection));
      return;
    }
    focusWhenMountedRef.current = true;
    setEditing(true);
  };

  useImperativeHandle(forwardedRef, () => ({ focusAtEnd: focusEditor }));

  // `setSelection` is a native command, which the new architecture honours;
  // a `selection` sent through setNativeProps can be dropped there.
  const placeCaret = ({ start, end }: TextSelection) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.setSelection === 'function') input.setSelection(start, end);
    else input.setNativeProps({ selection: { start, end } });
  };

  useEffect(() => {
    if (!editing || !focusWhenMountedRef.current) return;
    focusWhenMountedRef.current = false;
    const selection = selectionRef.current;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      placeCaret(selection);
    });
  }, [editing]);

  /**
   * Where a toolbar edit wants the caret: between the markers of an empty pair,
   * or around the text it just wrapped. Writing the new text into the field
   * moves the caret to the end, and that write can land on either side of the
   * next frame, so the caret is placed in both spots and cleared after.
   */
  const pendingCaretRef = useRef<TextSelection | null>(null);
  const applyEdit = (formatter: ToolbarItem['action']) => {
    const edit = formatter(valueRef.current, selectionRef.current);
    valueRef.current = edit.text;
    selectionRef.current = edit.selection;
    pendingCaretRef.current = edit.selection;
    onChangeText(edit.text);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      placeCaret(edit.selection);
      requestAnimationFrame(() => {
        if (pendingCaretRef.current === edit.selection) pendingCaretRef.current = null;
      });
    });
  };
  const onExternalText = () => {
    if (pendingCaretRef.current) placeCaret(pendingCaretRef.current);
  };

  // ⌘B and ⌘I, from the menu bar or a key on the web, while the field has focus.
  useCommand('bold', () => applyEdit(toggleBold), editing && focused);
  useCommand('italic', () => applyEdit(toggleItalic), editing && focused);

  const toolbar: ToolbarItem[] = [
    { label: 'B', accessibilityLabel: 'Bold', action: toggleBold, textStyle: styles.boldButton },
    { label: 'I', accessibilityLabel: 'Italic', action: toggleItalic, textStyle: styles.italicButton },
    { label: 'S', accessibilityLabel: 'Strikethrough', action: toggleStrikethrough, textStyle: styles.strikeButton },
    { label: 'Link', accessibilityLabel: 'Insert link', action: insertLink },
    { label: '•', accessibilityLabel: 'Bulleted list', action: toggleBulletList },
    { label: '1.', accessibilityLabel: 'Numbered list', action: toggleNumberedList },
    { label: '❯', accessibilityLabel: 'Block quote', action: toggleQuote },
    { label: '<>', accessibilityLabel: 'Inline code', action: toggleInlineCode, textStyle: styles.monoButton },
    { label: '{ }', accessibilityLabel: 'Code block', action: toggleCodeBlock, textStyle: styles.monoButton },
    { label: 'H2', accessibilityLabel: 'Heading', action: toggleHeading, textStyle: styles.boldButton },
  ];

  const markdownStyle = {
    root: styles.markdownRoot,
    text: styles.markdownText,
    paragraph: styles.markdownParagraph,
    strong: styles.markdownStrong,
    em: styles.markdownEm,
    heading: styles.markdownHeading,
    heading1: styles.markdownHeading1,
    heading2: styles.markdownHeading2,
    heading3: styles.markdownHeading3,
    heading4: styles.markdownHeading4,
    heading5: styles.markdownHeading5,
    heading6: styles.markdownHeading6,
    headingContainer: styles.markdownHeadingContainer,
    heading1Container: styles.markdownHeadingContainer,
    heading2Container: styles.markdownHeadingContainer,
    blockquote: styles.markdownBlockquote,
    codeInline: styles.markdownCodeInline,
    codeBlock: styles.markdownCodeBlock,
    codeScroll: styles.markdownCodeScroll,
    codeScrollContent: styles.markdownCodeScrollContent,
    pre: styles.markdownPre,
    list: styles.markdownList,
    listUnorderedItem: styles.markdownListItem,
    listOrderedItem: styles.markdownListItem,
    listUnorderedItemIcon: styles.markdownListIcon,
    listOrderedItemIcon: styles.markdownListIcon,
    link: [styles.markdownLink, { color: accent }],
    hr: styles.markdownRule,
    imagePlaceholder: styles.markdownImagePlaceholder,
    htmlBlock: styles.markdownHtml,
    htmlInline: styles.markdownHtml,
  };

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>Notes</Text>
        <Pressable
          onPress={() => {
            if (editing) {
              inputRef.current?.blur();
              onFlush();
              setEditing(false);
            } else {
              focusEditor();
            }
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Finish editing notes' : 'Edit notes'}
        >
          <Text style={[styles.modeButton, { color: accent }]}>{editing ? 'Done' : 'Edit'}</Text>
        </Pressable>
      </View>

      {editing ? (
        <>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            style={styles.toolbarScroll}
            contentContainerStyle={styles.toolbar}
            accessibilityRole="toolbar"
          >
            {toolbar.map((item) => (
              <Pressable
                key={item.accessibilityLabel}
                onPress={() => applyEdit(item.action)}
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.toolbarButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
              >
                <Text style={[styles.toolbarButtonText, item.textStyle]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <NativeOwnedTextInput
            ref={inputRef as never}
            sheet={sheet}
            syncKey={taskId}
            onExternalText={onExternalText}
            value={value}
            onChangeText={(next) => {
              valueRef.current = next;
              onChangeText(next);
            }}
            onSelectionChange={(event) => {
              selectionRef.current = event.nativeEvent.selection;
            }}
            placeholder="Add notes with Markdown…"
            placeholderTextColor={styles.notesPlaceholder.color}
            style={styles.notesInput}
            multiline
            scrollEnabled={false}
            inputAccessoryViewID={inputAccessoryViewID}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
              onFlush();
            }}
          />
        </>
      ) : value.trim() ? (
        <View style={styles.preview} accessibilityLabel="Note preview">
          <Markdown
            markdownit={markdownParser}
            rules={markdownRules}
            style={markdownStyle}
            onLinkPress={openSafeLink}
            allowedImageHandlers={[]}
            defaultImageHandler={null}
          >
            {value}
          </Markdown>
        </View>
      ) : (
        <Pressable onPress={focusEditor} accessibilityRole="button" accessibilityLabel="Add notes">
          <Text style={styles.emptyPreview}>Add notes…</Text>
        </Pressable>
      )}
    </View>
  );
});

export default RichNotes;

const useStyles = makeStyles((c) => ({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  modeButton: {
    fontFamily: fonts.sansMedium,
    fontSize: 13.5,
  },
  toolbarScroll: {
    marginHorizontal: -14,
    marginTop: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.divider,
  },
  toolbar: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  toolbarButton: {
    minWidth: 32,
    height: 30,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  toolbarButtonPressed: {
    backgroundColor: c.chipBg,
  },
  toolbarButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.textSecondary,
  },
  boldButton: {
    fontFamily: fonts.sansBold,
  },
  italicButton: {
    fontStyle: 'italic',
  },
  strikeButton: {
    textDecorationLine: 'line-through',
  },
  monoButton: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
  },
  notesInput: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: c.textPrimary,
    marginTop: 10,
    padding: 0,
    minHeight: 96,
  },
  notesPlaceholder: {
    color: c.textTertiary,
  },
  preview: {
    marginTop: 8,
    minHeight: 32,
  },
  emptyPreview: {
    marginTop: 8,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: c.textTertiary,
  },
  markdownRoot: {
    color: c.textBody,
  },
  markdownText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: c.textBody,
  },
  markdownParagraph: {
    marginTop: 0,
    marginBottom: 10,
    flexWrap: 'wrap',
    flexDirection: 'row',
  },
  markdownStrong: {
    fontFamily: fonts.sansBold,
    fontWeight: '700',
  },
  markdownEm: {
    fontStyle: 'italic',
  },
  markdownHeading: {
    fontFamily: fonts.sansSemiBold,
    fontWeight: '600',
    color: c.textPrimary,
  },
  markdownHeading1: {
    fontSize: 22,
    lineHeight: 28,
  },
  markdownHeading2: {
    fontSize: 19,
    lineHeight: 25,
  },
  markdownHeading3: {
    fontSize: 17,
    lineHeight: 23,
  },
  markdownHeading4: {
    fontSize: 16,
    lineHeight: 22,
  },
  markdownHeading5: {
    fontSize: 15,
    lineHeight: 21,
  },
  markdownHeading6: {
    fontSize: 14,
    lineHeight: 20,
  },
  markdownHeadingContainer: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 7,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  markdownBlockquote: {
    borderLeftWidth: 3,
    borderLeftColor: c.dividerStrong,
    paddingLeft: 12,
    paddingRight: 4,
    marginBottom: 10,
  },
  markdownCodeInline: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: c.textPrimary,
    backgroundColor: c.chipBg,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  markdownCodeBlock: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    lineHeight: 19,
    color: c.textPrimary,
    backgroundColor: 'transparent',
    padding: 0,
    marginBottom: 0,
  },
  markdownCodeScroll: {
    maxWidth: '100%',
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 7,
    marginBottom: 10,
  },
  markdownCodeScrollContent: {
    padding: 10,
  },
  markdownPre: {
    marginBottom: 0,
  },
  markdownList: {
    marginBottom: 10,
  },
  markdownListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
  },
  markdownListIcon: {
    fontFamily: fonts.monoRegular,
    fontSize: 14,
    lineHeight: 22,
    color: c.textSecondary,
    marginLeft: 8,
    marginRight: 8,
  },
  markdownLink: {
    textDecorationLine: 'underline',
  },
  markdownRule: {
    backgroundColor: c.dividerStrong,
    height: 1,
    marginVertical: 12,
  },
  markdownImagePlaceholder: {
    fontFamily: fonts.sansRegular,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    color: c.textTertiary,
  },
  markdownHtml: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    lineHeight: 20,
    color: c.textSecondary,
  },
}));
