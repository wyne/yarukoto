# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Backend/Mobile Compatibility

The full protocol is in the root `AGENTS.md`; the client half of it:

- Gate any UI that depends on backend storage with `supportsFeature(id)` from
  `useTasks()`, so a feature the connected server cannot keep is never offered.
- Strip that feature's fields in `pushDirty` before `POST /sync` when the server
  has not advertised the id.
- An unknown feature set — a failed `/health` probe, or a snapshot cached before
  the first probe — is neither: **hide the UI, but still send the field.** A row
  wrongly hidden reappears on the next probe; a field wrongly stripped is gone,
  because the upsert replaces the row. `supportsFeature` answers the UI question
  and reads unknown as no; `pushDirty` gets the full feature list when unknown.
- Never gate on the app's own version, and never on whether a pulled record
  happened to contain the field.

Local and sample mode have no server to negotiate with and are fully capable.

## Mac Catalyst

The iOS project also builds for the Mac (`npm run mac`; details in
`docs/src/content/docs/development/mac.md`). A few things follow for code in this directory:

- **`Platform.OS` is `'ios'` on the Mac.** Anything keyed on it treats a desktop with a
  keyboard and trackpad as a phone. Branch on the capability actually in question —
  `DESKTOP_UI`, `FINE_POINTER`, `FLOATING_TAB_BAR` in `src/data/platform.ts`, or window
  width — rather than adding another platform check. `DESKTOP_UI` does **not** mean the
  DOM exists: code touching `document` or `window` checks `Platform.OS === 'web'` itself.
- **Hover styling needs `HoverPressable`.** Import `Pressable` from
  `src/components/HoverPressable` wherever a style reads `hovered` (anything using
  `useHoverBg` or `hoverable`). React Native's own `Pressable` never sets it on the Mac.
- **Native menus go through `NativeMenu`** (`src/components/NativeMenu.tsx`), not
  `@expo/ui/community/menu` directly. On the Mac the library's trigger renders as an
  empty pop-up button.
- **No wheel pickers on the Mac.** UIKit throws the moment a `UIPickerView` reaches a
  window there, which takes the whole app down. That covers `@expo/ui/community/picker`
  (always a wheel on iOS) and `DateTimePicker` with `display="spinner"`. Branch on `MAC`
  from `src/data/platform.ts` and use `MacTimeMenus` for a time, or a `NativeMenu` for a
  choice. (The compact `DateTimePicker` doesn't crash there, but takes no input either.)
- **Keyboard commands are defined once, in `src/navigation/commands.ts`**, and answered through
  `useCommand` (`src/navigation/MenuCommands.tsx`) by the screen in front while it is focused.
  The Mac menu bar (`modules/mac-menu`) and the command menu (⌘K) are both built from that list,
  so a new command is one entry there plus a `useCommand` — nothing native to add. A command
  nothing has registered is dimmed in the menu and left out of ⌘K, so pass `enabled` false when
  there is nothing for it to act on. **Never give a menu command a plain key** (no ⌘): a menu
  key equivalent fires before any focused field hears the key. Plain keys go in `listKeys`,
  which the task list answers itself (`src/components/ListKeys.tsx`).
- **A new native dependency has to compile for Catalyst too.** After adding one, run
  `npm run mac` as well as the phone build; one pod without a Catalyst slice fails
  the whole Mac build. If it needs a project-level fix, it belongs in
  `plugins/mac-catalyst`, not in the generated `ios/` folder.
