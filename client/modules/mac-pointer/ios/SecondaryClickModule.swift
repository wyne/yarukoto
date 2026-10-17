import ExpoModulesCore

public final class SecondaryClickModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SecondaryClick")

    View(SecondaryClickView.self) {
      Events("onSecondaryClick")
    }
  }
}

public final class EscapeKeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EscapeKey")

    View(EscapeKeyView.self) {
      Events("onEscape")
    }
  }
}

public final class KeyCommandsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KeyCommands")

    View(KeyCommandsView.self) {
      Events("onKeyCommand", "onFocusChange")

      Prop("keys") { (view: KeyCommandsView, keys: [String]) in
        view.keys = keys
      }

      Prop("active") { (view: KeyCommandsView, active: Bool?) in
        view.active = active ?? true
      }

      Prop("focusable") { (view: KeyCommandsView, focusable: Bool?) in
        view.focusable = focusable ?? false
      }

      Prop("focusKey") { (view: KeyCommandsView, focusKey: Int?) in
        view.focusKey = focusKey ?? 0
      }
    }
  }
}

public final class ResizeCursorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ResizeCursor")

    View(ResizeCursorView.self) {}
  }
}
