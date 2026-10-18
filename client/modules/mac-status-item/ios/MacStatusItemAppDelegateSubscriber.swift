import ExpoModulesCore
import UIKit

/**
 Puts the menu bar extra up as launch finishes, before JS has started.

 Two things can't wait for JS: a login launch has to be noticed while its Apple
 event is still current, and the icon has to be in the menu bar as soon as the
 app is running, not once the bundle has loaded. The menu has New Task, Open and
 Quit from the start; Today's tasks join it when JS sends them.
 */
public class MacStatusItemAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    YKMacAppKit.applicationDidFinishLaunching()
    return true
  }
}
