import UIKit

/**
 * The app's own commands in the Mac menu bar.
 *
 * Mac Catalyst gives every app a default menu bar — the app menu, File, Edit,
 * Format, View, Window, Help — and asks the app delegate to amend it through
 * `buildMenu(with:)`. That override can't live in a module, so the mac-catalyst
 * config plugin writes a two-line one into the generated AppDelegate that calls
 * `build(with:)` here, plus the action every command below sends, which calls
 * `perform(_:)`. What the commands *do* is JS's business: they are reported by
 * name, and the screen in front decides.
 *
 * Undo is different. The Edit menu's Undo item is already there with ⌘Z, and
 * drives whichever undo manager the responder chain reaches — so rather than a
 * second Undo competing for the same key, a completed task is registered on the
 * window's undo manager. The item then reads "Undo Complete Task" while the undo
 * toast is up, dims when it isn't, and still undoes typing when a text field is
 * focused, since a field's edits land on that same manager.
 *
 * Main thread only, like the menu system it serves.
 */
public enum MacMenuBar {
  /// Delivers a command's name to JS. Nil until JS listens, so a command chosen
  /// during launch is dropped rather than queued up for a screen that isn't there.
  static var onCommand: ((String) -> Void)?

  /// The selector the plugin's AppDelegate method answers. Named once here so the
  /// two can't drift; see plugins/mac-catalyst.
  static let action = NSSelectorFromString("macMenuCommand:")

  public static func build(with builder: UIMenuBuilder) {
    guard builder.system == .main else { return }

    // File ▸ New Task, first — where New sits in every Mac app.
    builder.insertChild(
      inline("newTask", [command("New Task", input: "n", name: "newTask")]),
      atStartOfMenu: .file
    )

    // Edit ▸ Find…, in place of the system's Find submenu. Its items drive a text
    // view's find bar, which nothing here has, and its ⌘F would shadow ours.
    let find = inline("find", [command("Find…", input: "f", name: "find")])
    if builder.menu(for: .find) != nil {
      builder.replace(menu: .find, with: find)
    } else {
      builder.insertChild(find, atEndOfMenu: .edit)
    }

    // App menu ▸ Settings…, under About as on the Mac. Catalyst only adds its own
    // entry for an app with a Settings bundle, which opens the iOS Settings app;
    // replace it if one ever appears, rather than showing both.
    let settings = inline("settings", [command("Settings…", input: ",", name: "settings")])
    if builder.menu(for: .preferences) != nil {
      builder.replace(menu: .preferences, with: settings)
    } else {
      builder.insertSibling(settings, afterMenu: .about)
    }
  }

  public static func perform(_ command: UICommand) {
    guard let name = command.propertyList as? String else { return }
    onCommand?(name)
  }

  // MARK: Undo

  /// Owns the registered action, so it can be withdrawn without touching anything
  /// else on the manager — a text field's typing, say.
  private final class UndoToken: NSObject {}
  private static let undoToken = UndoToken()
  /// Where the action went, kept because the key window may have changed by the
  /// time it has to be withdrawn.
  private static weak var undoManager: UndoManager?

  /**
   * Offers one undo under Edit ▸ Undo, named `actionName`, or withdraws it (nil).
   *
   * Only ever one: JS offers the latest completion and nothing older, so each
   * call replaces whatever the last one registered.
   */
  static func setUndo(_ actionName: String?) {
    undoManager?.removeAllActions(withTarget: undoToken)
    undoManager = nil

    guard let actionName, let manager = keyWindow()?.undoManager else { return }
    manager.registerUndo(withTarget: undoToken) { _ in onCommand?("undo") }
    manager.setActionName(actionName)
    undoManager = manager
  }

  // MARK: Helpers

  private static func command(_ title: String, input: String, name: String) -> UIKeyCommand {
    UIKeyCommand(title: title, action: action, input: input, modifierFlags: .command, propertyList: name)
  }

  /// A group drawn inline, between separators, rather than as a submenu.
  private static func inline(_ id: String, _ children: [UIMenuElement]) -> UIMenu {
    UIMenu(
      title: "",
      identifier: UIMenu.Identifier("yarukoto.menu.\(id)"),
      options: .displayInline,
      children: children
    )
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
  }
}
