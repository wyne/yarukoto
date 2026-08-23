import { Platform, TextInput } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

/**
 * The text field to use inside a bottom sheet.
 *
 * It has to be gorhom's on native: that one registers itself with the sheet,
 * which is how `keyboardBehavior` knows a field is focused and sizes the sheet
 * around it. With React Native's own, the sheet stays at its content height and
 * the keyboard simply covers it — the field included.
 *
 * And it must not be gorhom's on web: that implementation reaches for
 * `TextInput.State.currentlyFocusedInput`, which react-native-web does not
 * provide, and throws on focus. Nothing is lost by dropping back, because there
 * is no keyboard there for a sheet to ride above.
 *
 * Cast because gorhom's wraps a TextInput and takes the same props and ref; the
 * cast is what keeps callers from having to know which one they got.
 */
const SheetTextInput = (Platform.OS === 'web' ? TextInput : BottomSheetTextInput) as typeof TextInput;

export default SheetTextInput;
