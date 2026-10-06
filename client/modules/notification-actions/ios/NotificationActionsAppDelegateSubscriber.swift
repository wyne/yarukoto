import ExpoModulesCore
import ExpoNotifications
import UIKit

/**
 Registers the reminder action handler while the app is still launching.

 The timing is the entire point. A notification action on a killed app launches
 the process in the background and delivers the response almost immediately;
 anything that waits for the JS bundle has already missed it. App delegate
 subscribers run inside `didFinishLaunchingWithOptions`, which is early enough.

 `NotificationCenterManager.addDelegate` also replays responses it has already
 queued, so even a response that arrives fractionally before this call is handed
 over rather than dropped.
 */
public class NotificationActionsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NotificationCenterManager.shared.addDelegate(ReminderActionHandler.shared)
    return true
  }
}
