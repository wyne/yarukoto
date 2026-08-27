import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, TextInput, TextInputProps } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

interface Props extends Omit<TextInputProps, 'defaultValue' | 'onChangeText' | 'value'> {
  value: string;
  onChangeText: (value: string) => void;
  /** Register the native field with Gorhom so its sheet follows the keyboard. */
  sheet?: boolean;
  /** Re-check the native value when a persistent sheet starts a new session. */
  syncKey?: string | number | boolean | null;
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
  { value, onChangeText, sheet = false, syncKey, ...props },
  forwardedRef
) {
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
  }, [value, syncKey]);

  const Input = sheet && Platform.OS !== 'web' ? BottomSheetTextInput : TextInput;

  return (
    <Input
      ref={inputRef as never}
      {...props}
      {...(Platform.OS === 'web' ? { value } : { defaultValue: initialValueRef.current })}
      onChangeText={handleChangeText}
    />
  );
});

export default NativeOwnedTextInput;
