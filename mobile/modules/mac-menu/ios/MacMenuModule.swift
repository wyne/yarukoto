import ExpoModulesCore

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
  }
}
