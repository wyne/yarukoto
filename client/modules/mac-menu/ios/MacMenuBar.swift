import UIKit

/**
 * The app's own commands in the Mac menu bar.
 *
 * Mac Catalyst gives every app a default menu bar — the app menu, File, Edit,
 * Format, View, Window, Help — and asks the app delegate to amend it through
 * `buildMenu(with:)`. That override can't live in a module, so the mac-catalyst
 * config plugin writes a short one into the generated AppDelegate that calls
 * `build(with:)` here, plus the action every command below sends, which calls
 * `perform(_:)`, and a `canPerformAction` that asks `canPerform` here.
 *
 * Which commands exist, and their titles and keys, is JS's business: the list in
 * src/navigation/commands.ts arrives through `setCommands`, and the menus are
 * rebuilt from it. That is the same list the command menu (⌘K) shows its
 * shortcuts from, so the two can't disagree. Until it arrives — the moment
 * between launch and JS starting — the menu bar is the system's alone.
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
  /// Delivers a command's id to JS. Nil until JS listens, so a command chosen
  /// during launch is dropped rather than queued up for a screen that isn't there.
  static var onCommand: ((String) -> Void)?

  /// The selector the plugin's AppDelegate method answers. Named once here so the
  /// two can't drift; see plugins/mac-catalyst.
  static let action = NSSelectorFromString("macMenuCommand:")

  struct Spec {
    let id: String
    let title: String
    let menu: String
    let group: String
    let submenu: String?
    let input: String?
    let modifiers: UIKeyModifierFlags
    /// Acts on the task list; see `canPerform`.
    let list: Bool
  }

  private static var specs: [Spec] = []
  private static var enabled: Set<String> = []

  static func setCommands(_ commands: [MenuCommandRecord]) {
    specs = commands.map { record in
      Spec(
        id: record.id,
        title: record.title,
        menu: record.menu,
        group: record.group,
        submenu: record.submenu,
        input: record.input.flatMap(keyInput),
        modifiers: modifierFlags(record.modifiers),
        list: record.list
      )
    }
    UIMenuSystem.main.setNeedsRebuild()
  }

  static func setEnabled(_ ids: [String]) {
    enabled = Set(ids)
    UIMenuSystem.main.setNeedsRevalidate()
  }

  public static func build(with builder: UIMenuBuilder) {
    guard builder.system == .main else { return }

    // Format is for styling text, which nothing here does, and its Show Fonts
    // holds ⌘T, which Due Today wants.
    builder.remove(menu: .format)

    guard !specs.isEmpty else { return }

    // App menu: under About, as on the Mac. Catalyst only adds its own Settings
    // entry for an app with a Settings bundle, which opens the iOS Settings app;
    // replace it if one ever appears, rather than showing both.
    if let app = section("app") {
      if builder.menu(for: .preferences) != nil {
        builder.replace(menu: .preferences, with: app)
      } else {
        builder.insertSibling(app, afterMenu: .about)
      }
    }

    // File: first, where New sits in every Mac app.
    if let file = section("file") {
      builder.insertChild(file, atStartOfMenu: .file)
    }

    // Edit: in place of the system's Find submenu. Its items drive a text view's
    // find bar, which nothing here has, and its ⌘F would shadow ours.
    if let edit = section("edit") {
      if builder.menu(for: .find) != nil {
        builder.replace(menu: .find, with: edit)
      } else {
        builder.insertChild(edit, atEndOfMenu: .edit)
      }
    }

    if let view = section("view") {
      builder.insertChild(view, atStartOfMenu: .view)
    }

    // Task: a menu of its own after View, as Mail has Message and Things has Items.
    let task = groups(of: "task")
    if !task.isEmpty {
      builder.insertSibling(
        UIMenu(title: "Task", identifier: UIMenu.Identifier("yarukoto.menu.task"), children: task),
        afterMenu: .view
      )
    }

    // Help: ours in place of the system's single "Yarukoto Help" item, which
    // has no help book behind it and only says help isn't available. AppKit
    // still adds its search field above these.
    let help = groups(of: "help")
    if !help.isEmpty, builder.menu(for: .help) != nil {
      builder.replaceChildren(ofMenu: .help) { _ in help }
    }
  }

  public static func perform(_ command: UICommand) {
    guard let id = command.propertyList as? String else { return }
    onCommand?(id)
  }

  /**
   * Whether one of our commands can run, or nil when `action` isn't ours.
   *
   * Dimmed when nothing on screen answers it, and a task-list command also
   * while a popover or dialog is up, so its key can't reach the list behind.
   * (JS refuses those too, in dispatchCommand; this is what draws it dimmed.)
   *
   * None of these is on a plain key — those belong to the list itself, through
   * KeyCommandsView — so a focused text field needs no special case here.
   */
  public static func canPerform(_ action: Selector, withSender sender: Any?) -> Bool? {
    guard action == Self.action else { return nil }
    guard let command = sender as? UICommand,
          let id = command.propertyList as? String,
          let spec = specs.first(where: { $0.id == id }) else {
      return true
    }
    guard enabled.contains(id) else { return false }
    if spec.list, keyWindow()?.rootViewController?.presentedViewController != nil { return false }
    return true
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

  // MARK: Building

  /// One placement's commands as a single inline section, for menus that already
  /// have items of their own around it.
  private static func section(_ menu: String) -> UIMenu? {
    let children = groups(of: menu)
    if children.isEmpty { return nil }
    return inline("\(menu)", children)
  }

  /// A placement's commands, as one inline group per `group`, in list order.
  private static func groups(of menu: String) -> [UIMenuElement] {
    let inMenu = specs.filter { $0.menu == menu }
    var order: [String] = []
    for spec in inMenu where !order.contains(spec.group) { order.append(spec.group) }

    return order.map { group in
      let members = inMenu.filter { $0.group == group }
      var elements: [UIMenuElement] = []
      var submenus: [String] = []
      for spec in members {
        guard let submenu = spec.submenu else {
          elements.append(element(spec))
          continue
        }
        if submenus.contains(submenu) { continue }
        submenus.append(submenu)
        elements.append(
          UIMenu(title: submenu, children: members.filter { $0.submenu == submenu }.map(element))
        )
      }
      return inline("\(menu).\(group)", elements)
    }
  }

  private static func element(_ spec: Spec) -> UIMenuElement {
    guard let input = spec.input else {
      return UICommand(title: spec.title, action: action, propertyList: spec.id)
    }
    return UIKeyCommand(
      title: spec.title,
      action: action,
      input: input,
      modifierFlags: spec.modifiers,
      propertyList: spec.id
    )
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

  /// A key named as src/navigation/commands.ts names it, as UIKit spells it.
  private static func keyInput(_ name: String) -> String? {
    switch name {
    case "return": return "\r"
    case "delete": return "\u{8}"
    case "escape": return UIKeyCommand.inputEscape
    case "up": return UIKeyCommand.inputUpArrow
    case "down": return UIKeyCommand.inputDownArrow
    case "left": return UIKeyCommand.inputLeftArrow
    case "right": return UIKeyCommand.inputRightArrow
    default: return name.count == 1 ? name : nil
    }
  }

  private static func modifierFlags(_ names: [String]) -> UIKeyModifierFlags {
    var flags: UIKeyModifierFlags = []
    for name in names {
      switch name {
      case "command": flags.insert(.command)
      case "shift": flags.insert(.shift)
      case "option": flags.insert(.alternate)
      case "control": flags.insert(.control)
      default: break
      }
    }
    return flags
  }

  // MARK: Helpers

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
  }
}
