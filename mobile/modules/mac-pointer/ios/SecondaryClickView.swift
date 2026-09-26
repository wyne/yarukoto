import ExpoModulesCore
import UIKit

/**
 * A container that reports right-clicks on anything inside it, on the Mac.
 *
 * A right-click never reaches React Native on its own: its touch and pointer
 * recognizers accept the primary button only. A gesture recognizer of our own
 * requiring the secondary button doesn't get it either — tried, and UIKit never
 * offers it the touch — so this uses the channel Mac Catalyst actually routes
 * right-clicks through, a context menu interaction.
 *
 * The interaction is only asked where a menu should open. It answers by
 * reporting the point to JS and declining to show a native menu, so the popover
 * JS already draws for web opens instead, and nothing of UIKit's appears.
 *
 * Mac only. On a touchscreen the same interaction answers a long press, which
 * already means "start dragging" here and would open this menu on top of it.
 * That leaves an iPad's trackpad without right-click for now.
 */
public final class SecondaryClickView: ExpoView, UIContextMenuInteractionDelegate {
  let onSecondaryClick = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    if ProcessInfo.processInfo.isMacCatalystApp {
      addInteraction(UIContextMenuInteraction(delegate: self))
    }
  }

  public func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    // Window coordinates, the frame JS menus are anchored in: React Native's
    // root view fills the window, so its page coordinates are the same thing.
    let point = convert(location, to: nil)
    onSecondaryClick(["x": point.x, "y": point.y])
    return nil
  }
}
