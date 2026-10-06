import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, TextInput, TextInputProps } from 'react-native';
import { BottomSheetTextInput, useBottomSheetInternal } from '@gorhom/bottom-sheet';
import { useScheme } from '../theme/ThemeContext';

interface Props extends Omit<TextInputProps, 'defaultValue' | 'onChangeText' | 'value'> {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Register the native field with Gorhom so its sheet follows the keyboard.
   * Ignored when the field isn't actually in a sheet — the same picker renders
   * as a popover or dialog on the desktop, and Gorhom's field throws outside one.
   */
  sheet?: boolean;
  /** Re-check the native value when a persistent sheet starts a new session. */
  syncKey?: string | number | boolean | null;
  /**
   * Called just after a change from outside is written into the native field.
   * Writing the text puts the caret at the end, so a caller that wants it
   * somewhere else (a formatting toolbar) places it from here.
   */
  onExternalText?: () => void;
}

/**
 * A controlled input to its caller, but an uncontrolled input to iOS.
 *
 * React still receives every edit for validation and persistence. Native keeps
 * ownership of the displayed text, though, so a parent render does not send the
 * same value back through the bridge and make the keyboard prediction strip
 * redraw. Real external changes are applied imperatively. Web remains controlled
 * because its input does not have the iOS prediction behavior this avoids.
 */
const NativeOwnedTextInput = forwardRef<TextInput, Props>(function NativeOwnedTextInput(
  { value, onChangeText, sheet = false, syncKey, onExternalText, ...props },
  forwardedRef
) {
  const scheme = useScheme();
  const inputRef = useRef<TextInput>(null);
  const initialValueRef = useRef(value);
  const nativeValueRef = useRef(value);
  const onChangeTextRef = useRef(onChangeText);
  onChangeTextRef.current = onChangeText;

  useImperativeHandle(forwardedRef, () => inputRef.current as TextInput, []);

  const handleChangeText = useCallback((next: string) => {
    nativeValueRef.current = next;
    onChangeTextRef.current(next);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || value === nativeValueRef.current) return;
    inputRef.current?.setNativeProps({ text: value });
    nativeValueRef.current = value;
    onExternalText?.();
  }, [value, syncKey]);

  const inSheet = useBottomSheetInternal(true) !== null;
  const Input = sheet && inSheet && Platform.OS !== 'web' ? BottomSheetTextInput : TextInput;

  return (
    <Input
      ref={inputRef as never}
      keyboardAppearance={scheme}
      {...props}
      {...(Platform.OS === 'web' ? { value } : { defaultValue: initialValueRef.current })}
      onChangeText={handleChangeText}
    />
  );
});

export default NativeOwnedTextInput;
