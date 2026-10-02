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
      Events("onKeyCommand")

      Prop("keys") { (view: KeyCommandsView, keys: [String]) in
        view.keys = keys
      }
    }
  }
}
