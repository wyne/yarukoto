import ExpoModulesCore

/// One command from src/navigation/commands.ts, as JS sends it. See MacMenuBar.
struct MenuCommandRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var menu: String = ""
  @Field var group: String = ""
  @Field var submenu: String? = nil
  @Field var input: String? = nil
  @Field var modifiers: [String] = []
  @Field var list: Bool = false
}

public final class MacMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MacMenu")

    Events("onCommand")

    OnStartObserving {
      DispatchQueue.main.async { [weak self] in
        MacMenuBar.onCommand = { name in
          self?.sendEvent("onCommand", ["command": name])
        }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        MacMenuBar.onCommand = nil
      }
    }

    AsyncFunction("setUndo") { (actionName: String?) in
      MacMenuBar.setUndo(actionName)
    }.runOnQueue(.main)

    AsyncFunction("setCommands") { (commands: [MenuCommandRecord]) in
      MacMenuBar.setCommands(commands)
    }.runOnQueue(.main)

    AsyncFunction("setEnabled") { (ids: [String]) in
      MacMenuBar.setEnabled(ids)
    }.runOnQueue(.main)
  }
}
