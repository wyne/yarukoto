import ExpoModulesCore
import UIKit

/**
 * A container that reports plain keys — arrows, Tab, Return, Escape, Delete, Space,
 * Home, End, Page Up and Page Down — on the Mac, while it or something inside it
 * has focus.
 *
 * UIKit only offers a key to the responder chain, starting at whatever has
 * focus, so a key handler has to be a view in that chain. Two uses:
 *
 * - **Around a field** (the command menu's search): the field has focus and
 *   this sits above it, claiming ↑ and ↓ before the field moves its caret with
 *   them — React Native's `onKeyPress` doesn't report arrows on iOS at all.
 * - **Around the task list**, `focusable`: the list has no field, so this takes
 *   focus itself — when it appears, and whenever `focusKey` changes, which JS
 *   does on a click in the list and when a dialog closes. A field focused
 *   elsewhere isn't inside it, so typing there keeps every key; and a dialog's
 *   field has focus while it is up, so the list never hears its keys.
 *
 * These keys are deliberately not menu-bar key equivalents. AppKit tries a key
 * equivalent before anything focused hears the key, so a plain one there would
 * take Return from every text field in the app.
 *
 * Mac only, like EscapeKeyView: a phone has no keyboard to speak of, and
 * taking focus there would fight the on-screen one.
 */
public final class KeyCommandsView: ExpoView {
  let onKeyCommand = EventDispatcher()
  /// When a `focusable` view takes or gives up the keyboard, so JS can draw the
  /// list's cursor in the accent color only while the list is the one listening.
  let onFocusChange = EventDispatcher()

  private static let isMac = ProcessInfo.processInfo.isMacCatalystApp

  /// Keys by name, `shift+down` style; see `keyName` in src/navigation/commands.ts.
  var keys: [String] = []
  /// Off while the screen isn't in front, so a list left mounted behind
  /// another doesn't keep answering.
  var active = true
  /// Takes focus itself, for content with no field of its own.
  var focusable = false
  var focusKey = 0 {
    didSet { if focusKey != oldValue { claimFocus() } }
  }

  public override var canBecomeFirstResponder: Bool {
    Self.isMac && focusable && active
  }

  public override var keyCommands: [UIKeyCommand]? {
    guard Self.isMac, active else { return nil }
    return keys.compactMap { name in
      guard let (input, flags) = Self.parse(name) else { return nil }
      let command = UIKeyCommand(input: input, modifierFlags: flags, action: #selector(fire(_:)))
      // A focused field inside, or a scroll view, would otherwise act first —
      // which for Tab means a text view typing a tab character, or UIKit's own
      // focus system moving to whichever view happens to be next.
      command.wantsPriorityOverSystemBehavior = true
      return command
    }
  }

  public override func becomeFirstResponder() -> Bool {
    let became = super.becomeFirstResponder()
    if became { onFocusChange(["focused": true]) }
    return became
  }

  public override func resignFirstResponder() -> Bool {
    let resigned = super.resignFirstResponder()
    if resigned { onFocusChange(["focused": false]) }
    return resigned
  }

  @objc private func fire(_ command: UIKeyCommand) {
    guard let name = keys.first(where: { name in
      guard let (input, flags) = Self.parse(name) else { return false }
      return input == command.input && flags == command.modifierFlags
    }) else { return }
    onKeyCommand(["key": name])
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    claimFocus()
  }

  /// Deferred a turn, so a dialog that is dismissing has let go of focus first.
  private func claimFocus() {
    guard Self.isMac, focusable else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self, self.window != nil, self.active, !self.isFirstResponder else { return }
      _ = self.becomeFirstResponder()
    }
  }

  private static func parse(_ name: String) -> (String, UIKeyModifierFlags)? {
    var parts = name.split(separator: "+").map(String.init)
    guard let key = parts.popLast() else { return nil }
    var flags: UIKeyModifierFlags = []
    for part in parts {
      switch part {
      case "shift": flags.insert(.shift)
      case "option": flags.insert(.alternate)
      case "control": flags.insert(.control)
      case "command": flags.insert(.command)
      default: return nil
      }
    }
    let input: String
    switch key {
    case "up": input = UIKeyCommand.inputUpArrow
    case "down": input = UIKeyCommand.inputDownArrow
    case "left": input = UIKeyCommand.inputLeftArrow
    case "right": input = UIKeyCommand.inputRightArrow
    case "escape": input = UIKeyCommand.inputEscape
    case "return": input = "\r"
    case "delete": input = "\u{8}"
    case "tab": input = "\t"
    case "space": input = " "
    case "home": input = UIKeyCommand.inputHome
    case "end": input = UIKeyCommand.inputEnd
    case "pageup": input = UIKeyCommand.inputPageUp
    case "pagedown": input = UIKeyCommand.inputPageDown
    default: return nil
    }
    return (input, flags)
  }
}
