import ExpoModulesCore

public final class SecondaryClickModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SecondaryClick")

    View(SecondaryClickView.self) {
      Events("onSecondaryClick")
    }
  }
}
