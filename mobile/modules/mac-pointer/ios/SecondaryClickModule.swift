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
