import ExpoModulesCore
import UIKit

/**
 * A view that shows the Mac's left-right resize cursor while the pointer is over
 * it: the drag handle between two panes.
 *
 * Catalyst offers no UIKit way to ask for one. UIPointerStyle draws iPad-style
 * shapes that the Mac ignores, and React Native's `cursor` style knows only
 * `auto` and `pointer`. AppKit's NSCursor is in the process, though, so a hover
 * recognizer looks it up by name and sets it, and puts the arrow back when the
 * pointer leaves. A lookup that finds nothing does nothing, so the worst case
 * is the arrow the divider had before.
 *
 * The cursor is set again on every hover move, not only on entry: AppKit resets
 * it to the arrow whenever the window's own cursor handling runs.
 *
 * Mac only. A phone has no pointer, and an iPad's pointer has no such cursor.
 */
public final class ResizeCursorView: ExpoView {
  private static let isMac = ProcessInfo.processInfo.isMacCatalystApp

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    guard Self.isMac else { return }
    let hover = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
    hover.cancelsTouchesInView = false
    addGestureRecognizer(hover)
  }

  @objc private func hovered(_ recognizer: UIHoverGestureRecognizer) {
    switch recognizer.state {
    case .began, .changed:
      Self.setCursor("resizeLeftRightCursor")
    case .ended, .cancelled, .failed:
      Self.setCursor("arrowCursor")
    default:
      break
    }
  }

  private static func setCursor(_ name: String) {
    guard
      let cursorClass = NSClassFromString("NSCursor") as? NSObject.Type,
      cursorClass.responds(to: NSSelectorFromString(name)),
      let cursor = cursorClass.perform(NSSelectorFromString(name))?.takeUnretainedValue() as? NSObject
    else { return }
    cursor.perform(NSSelectorFromString("set"))
  }
}
