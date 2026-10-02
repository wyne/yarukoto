import ExpoModulesCore
import UIKit

/**
 * A container that reports the keys it is given while a field inside it has
 * focus, on the Mac.
 *
 * The command menu (⌘K) types into a field and moves through its results with
 * ↑ and ↓. A text field keeps those keys for its caret, and React Native's
 * `onKeyPress` doesn't report them on iOS, so they never reach JS. Like
 * EscapeKeyView, this sits in the responder chain above the field and claims
 * them first with key commands of its own.
 *
 * Mac only, for the same reason as EscapeKeyView: there is no hardware keyboard
 * to speak of on a phone.
 */
public final class KeyCommandsView: ExpoView {
  let onKeyCommand = EventDispatcher()

  /// The keys to claim, by the names src/navigation/commands.ts uses.
  var keys: [String] = []

  private static let isMac = ProcessInfo.processInfo.isMacCatalystApp

  private static let inputs: [String: String] = [
    "up": UIKeyCommand.inputUpArrow,
    "down": UIKeyCommand.inputDownArrow,
    "left": UIKeyCommand.inputLeftArrow,
    "right": UIKeyCommand.inputRightArrow,
  ]

  public override var keyCommands: [UIKeyCommand]? {
    guard Self.isMac else { return nil }
    return keys.compactMap { name in
      guard let input = Self.inputs[name] else { return nil }
      let command = UIKeyCommand(input: input, modifierFlags: [], action: #selector(fire(_:)))
      // The focused field would otherwise move its caret instead.
      command.wantsPriorityOverSystemBehavior = true
      return command
    }
  }

  @objc private func fire(_ command: UIKeyCommand) {
    guard let name = Self.inputs.first(where: { $0.value == command.input })?.key else { return }
    onKeyCommand(["key": name])
  }
}
