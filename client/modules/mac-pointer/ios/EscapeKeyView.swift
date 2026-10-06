import ExpoModulesCore
import UIKit

/**
 * A container that reports the Escape key while anything inside it is on screen,
 * on the Mac.
 *
 * Popovers and dialogs are React Native modals, and on the web they close on
 * Escape through a `document` listener. Catalyst has no document, and UIKit only
 * offers a key to the responder chain, so this sits in that chain instead: a key
 * command on the view that wraps the panel. A text field focused inside it is a
 * descendant, so Escape still reaches here while someone is typing; with nothing
 * focused, the view takes first responder itself so there is a chain to be in.
 *
 * Mac only. A phone has no Escape key, and taking first responder there would
 * fight the keyboard for focus.
 */
public final class EscapeKeyView: ExpoView {
  let onEscape = EventDispatcher()

  private static let isMac = ProcessInfo.processInfo.isMacCatalystApp

  public override var canBecomeFirstResponder: Bool {
    Self.isMac
  }

  public override var keyCommands: [UIKeyCommand]? {
    guard Self.isMac else { return nil }
    let command = UIKeyCommand(input: UIKeyCommand.inputEscape, modifierFlags: [], action: #selector(escape))
    if #available(iOS 15.0, *) {
      // A focused text field would otherwise keep Escape for itself.
      command.wantsPriorityOverSystemBehavior = true
    }
    return [command]
  }

  @objc private func escape() {
    onEscape([:])
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    guard Self.isMac, window != nil else { return }
    // Deferred so a field that focuses itself as the panel appears gets there
    // first; taking focus back from it would drop the caret.
    DispatchQueue.main.async { [weak self] in
      guard let self, self.window != nil, !self.containsFirstResponder(self) else { return }
      _ = self.becomeFirstResponder()
    }
  }

  private func containsFirstResponder(_ view: UIView) -> Bool {
    if view.isFirstResponder { return true }
    return view.subviews.contains { containsFirstResponder($0) }
  }
}
