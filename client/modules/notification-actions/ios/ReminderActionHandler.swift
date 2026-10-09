import ExpoModulesCore
import ExpoNotifications
import Security
import UIKit
import UserNotifications

/**
 Handles the action buttons on a task reminder — natively, before JS exists.

 This is the whole reason the module exists. Expo's response listeners only run
 once the JS bundle is up, and iOS does not wait: when a killed app is launched
 in the background to service a notification action, the response is delivered
 during launch and the process can be suspended again before React Native has
 finished booting. The documented consequence (see `opensAppToForeground` in
 expo-notifications) is that the listener never fires and the tap is lost.

 So the tap is caught here instead, at a layer that is alive the moment the app
 is. Two things happen, in this order, and the order is the point:

 1. The action is written to a durable queue in UserDefaults. This is what makes
    the tap survivable — if the network is down, if the process is killed a
    second later, the intent is on disk and JS folds it into app state on the
    next launch.
 2. The completion is pushed to the server, under a background task assertion so
    iOS keeps the process alive long enough for the request to finish.

 Step 2 is best-effort by nature — a phone in a tunnel cannot reach a server, and
 no amount of native code changes that. Step 1 is what makes step 2's failure
 survivable rather than silent.

 COUPLING: this registers with `NotificationCenterManager`, which expo-notifications
 installs as the `UNUserNotificationCenter` delegate at launch. Setting our own
 delegate instead would displace theirs and break every notification the app has.
 The manager's `addDelegate` and the `NotificationDelegate` protocol are public
 API, but they are expo's, so this file is worth re-reading on an SDK upgrade.
 */
public final class ReminderActionHandler: NSObject, NotificationDelegate {
  public static let shared = ReminderActionHandler()

  // Duplicated from src/data/notificationActions.ts. Baked into notifications
  // already sitting in the system queue, so they can never be renamed.
  static let completeActionId = "complete"
  static let snoozeActionId = "snooze"
  static let snoozeInterval: TimeInterval = 60 * 60
  static let snoozePrefix = "yarukoto:taskSnooze:"

  static let queueKey = "yarukoto.pendingNotificationActions"
  static let serverUrlKey = "yarukoto.native.serverUrl"
  /// The token lives in the Keychain under this account. Builds before that kept
  /// it in UserDefaults under the same name, which `storedToken()` still reads until JS
  /// next hands over credentials and clears it.
  static let tokenKey = "yarukoto.native.token"

  private let defaults = UserDefaults.standard
  /// Serialises queue reads and writes: two notifications actioned in quick
  /// succession are two delegate calls against one UserDefaults key.
  private let queueLock = NSLock()

  /// Matches JavaScript's `Date.prototype.toISOString` exactly, fractional
  /// seconds included. The server compares these timestamps as *strings* for
  /// last-write-wins, so a format that merely parses the same is not enough.
  private static let iso8601: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter
  }()

  // MARK: - NotificationDelegate

  public func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    let actionId = response.actionIdentifier
    guard actionId == Self.completeActionId || actionId == Self.snoozeActionId else {
      // Returning false leaves the response for expo to queue and hand to JS,
      // which is what must happen for a plain tap: that opens the task detail.
      return false
    }

    let content = response.notification.request.content
    let info = content.userInfo
    guard let taskId = info["taskId"] as? String, !taskId.isEmpty else { return false }
    let reminderId = info["reminderId"] as? String ?? ""
    let now = Date()
    let at = Self.iso8601.string(from: now)

    if actionId == Self.snoozeActionId {
      let fireAt = now.addingTimeInterval(Self.snoozeInterval)
      scheduleSnooze(from: content, taskId: taskId, reminderId: reminderId, fireAt: fireAt)
      enqueue([
        "action": Self.snoozeActionId,
        "taskId": taskId,
        "reminderId": reminderId,
        "at": at,
        "fireAt": Self.iso8601.string(from: fireAt),
      ])
      return true
    }

    // Queued unconditionally, before the push is even attempted. The app applies
    // it locally and lets its own outbox carry it, which is both the fallback
    // when the push fails and a harmless repeat when it succeeds — an identical
    // row is a no-op under the server's last-write-wins.
    enqueue([
      "action": Self.completeActionId,
      "taskId": taskId,
      "reminderId": reminderId,
      "at": at,
    ])
    pushCompletion(taskId: taskId, completedAt: at)
    return true
  }

  // MARK: - Snooze

  private func scheduleSnooze(
    from content: UNNotificationContent,
    taskId: String,
    reminderId: String,
    fireAt: Date
  ) {
    let copy = UNMutableNotificationContent()
    copy.title = content.title
    copy.body = content.body
    copy.sound = content.sound
    // Kept so the snoozed notification offers the same buttons — snoozing twice
    // is a reasonable thing to want.
    copy.categoryIdentifier = content.categoryIdentifier
    var info = content.userInfo
    info["fireAt"] = Self.iso8601.string(from: fireAt)
    copy.userInfo = info

    let request = UNNotificationRequest(
      identifier: "\(Self.snoozePrefix)\(taskId):\(reminderId)",
      content: copy,
      trigger: UNTimeIntervalNotificationTrigger(timeInterval: Self.snoozeInterval, repeats: false)
    )
    UNUserNotificationCenter.current().add(request)
  }

  // MARK: - Server

  /**
   Posts to the one endpoint that needs no whole row.

   `POST /sync` is unusable from here: it upserts complete task rows, so it would
   mean reading the task out of AsyncStorage from Swift *and* reimplementing the
   feature negotiation in `pushDirty`, where a wrongly stripped field silently
   destroys server data. A dedicated endpoint needs a task id and a timestamp.
   */
  private func pushCompletion(taskId: String, completedAt: String) {
    guard
      let serverUrl = defaults.string(forKey: Self.serverUrlKey),
      let token = storedToken(),
      !serverUrl.isEmpty, !token.isEmpty,
      let escaped = taskId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
      let url = URL(string: "\(serverUrl.trimmingTrailingSlashes())/api/v1/tasks/\(escaped)/complete")
    else {
      // Local mode, sample mode, or not yet connected: the queue entry stands and
      // JS applies it on the next launch.
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["completedAt": completedAt])
    // The handler's own window is short and the app may be suspended the moment
    // it returns; this is what buys the request time to complete.
    request.timeoutInterval = 20

    var assertion: UIBackgroundTaskIdentifier = .invalid
    let endAssertion = {
      DispatchQueue.main.async {
        guard assertion != .invalid else { return }
        UIApplication.shared.endBackgroundTask(assertion)
        assertion = .invalid
      }
    }
    assertion = UIApplication.shared.beginBackgroundTask(withName: "yarukoto.completeTask") {
      endAssertion()
    }

    // Nothing to do with the response. A 404 from a server too old for this
    // endpoint, a timeout, a 500 — all reach the same place, which is the queue
    // entry already written above.
    URLSession.shared.dataTask(with: request) { _, _, _ in
      endAssertion()
    }.resume()
  }

  // MARK: - Durable queue

  private func enqueue(_ entry: [String: Any]) {
    queueLock.lock()
    defer { queueLock.unlock() }
    var queue = defaults.array(forKey: Self.queueKey) as? [[String: Any]] ?? []
    queue.append(entry)
    defaults.set(queue, forKey: Self.queueKey)
  }

  /// Hands the queue to JS and clears it in one step, so an action cannot be
  /// applied twice.
  func drain() -> [[String: Any]] {
    queueLock.lock()
    defer { queueLock.unlock() }
    let queue = defaults.array(forKey: Self.queueKey) as? [[String: Any]] ?? []
    defaults.removeObject(forKey: Self.queueKey)
    return queue
  }

  func setCredentials(serverUrl: String?, token: String?) {
    defaults.removeObject(forKey: Self.tokenKey)
    if let serverUrl, let token, !serverUrl.isEmpty, !token.isEmpty {
      defaults.set(serverUrl, forKey: Self.serverUrlKey)
      Keychain.write(Self.tokenKey, token)
    } else {
      defaults.removeObject(forKey: Self.serverUrlKey)
      Keychain.delete(Self.tokenKey)
    }
  }

  private func storedToken() -> String? {
    Keychain.read(Self.tokenKey) ?? defaults.string(forKey: Self.tokenKey)
  }
}

/**
 The access token, kept in the Keychain rather than UserDefaults, which is a
 plain file that rides along in device backups. Readable after the first unlock
 since boot, because a lock-screen "Mark done" is exactly when this runs, and
 never restored to another device.
 */
private enum Keychain {
  static let service = "yarukoto.native"

  static func query(_ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  static func read(_ account: String) -> String? {
    var request = query(account)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func write(_ account: String, _ value: String) {
    let attributes: [String: Any] = [
      kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(query(account) as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      SecItemAdd(query(account).merging(attributes) { _, new in new } as CFDictionary, nil)
    }
  }

  static func delete(_ account: String) {
    SecItemDelete(query(account) as CFDictionary)
  }
}

private extension String {
  func trimmingTrailingSlashes() -> String {
    var value = self
    while value.hasSuffix("/") { value.removeLast() }
    return value
  }
}
