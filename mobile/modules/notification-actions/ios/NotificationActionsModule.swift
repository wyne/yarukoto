import ExpoModulesCore

/**
 The JS side of the native reminder-action handling.

 Deliberately thin: the handler does its work without JS, and this exists only so
 the app can hand down the credentials it needs and collect what it did.
 */
public class NotificationActionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotificationActions")

    /**
     Mirrors the server connection where Swift can read it.

     AsyncStorage is not an option: on iOS it is React Native's own on-disk
     format, and reading it from native means binding to an implementation
     detail that is free to change. Two small strings in UserDefaults, rewritten
     whenever the connection changes, is the honest version of the same thing.
     */
    Function("setCredentials") { (serverUrl: String?, token: String?) in
      ReminderActionHandler.shared.setCredentials(serverUrl: serverUrl, token: token)
    }

    /// Returns every action taken while JS was not running, and clears them.
    Function("drainPendingActions") { () -> [[String: Any]] in
      ReminderActionHandler.shared.drain()
    }
  }
}
