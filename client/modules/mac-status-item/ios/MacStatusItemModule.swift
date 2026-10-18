import ExpoModulesCore

/// One of Today's tasks, as the menu lists it.
struct StatusTaskRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var overdue: Bool = false
}

/// JS's side of YKMacAppKit: the setting, the login item and the menu's tasks.
public final class MacStatusItemModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MacStatusItem")

    Events("onAction")

    OnStartObserving {
      DispatchQueue.main.async { [weak self] in
        YKMacAppKit.onAction = { action, taskId in
          var body: [String: Any] = ["action": action]
          if let taskId { body["taskId"] = taskId }
          self?.sendEvent("onAction", body)
        }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        YKMacAppKit.onAction = nil
      }
    }

    Function("isAvailable") {
      YKMacAppKit.available
    }

    Function("isMenuBarEnabled") {
      YKMacAppKit.menuBarEnabled
    }

    AsyncFunction("setMenuBarEnabled") { (enabled: Bool) in
      YKMacAppKit.menuBarEnabled = enabled
    }.runOnQueue(.main)

    AsyncFunction("getLoginItemStatus") { () -> String in
      Self.statusName(YKMacAppKit.loginItemStatus())
    }.runOnQueue(.main)

    AsyncFunction("setOpensAtLogin") { (enabled: Bool) throws -> String in
      try YKMacAppKit.setOpensAtLogin(enabled)
      return Self.statusName(YKMacAppKit.loginItemStatus())
    }.runOnQueue(.main)

    AsyncFunction("openLoginItemsSettings") {
      YKMacAppKit.openLoginItemsSettings()
    }.runOnQueue(.main)

    AsyncFunction("setTasks") { (tasks: [StatusTaskRecord], more: Int, count: Int) in
      YKMacAppKit.setTasks(
        tasks.map { ["id": $0.id, "title": $0.title, "overdue": $0.overdue] },
        more: more,
        count: count
      )
    }.runOnQueue(.main)
  }

  private static func statusName(_ status: YKLoginItemStatus) -> String {
    switch status {
    case .enabled: return "enabled"
    case .requiresApproval: return "requiresApproval"
    case .notRegistered, .notFound: return "disabled"
    default: return "unavailable"
    }
  }
}
