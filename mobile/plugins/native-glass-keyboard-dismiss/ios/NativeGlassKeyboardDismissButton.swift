import UIKit
import React

@objc(NativeGlassKeyboardDismissButtonManager)
class NativeGlassKeyboardDismissButtonManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    NativeGlassKeyboardDismissButton()
  }
}

final class NativeGlassKeyboardDismissButton: UIView {
  private let button = UIButton(type: .system)

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: 56, height: 48)
  }

  private func setup() {
    isOpaque = false
    backgroundColor = .clear
    clipsToBounds = false

    button.translatesAutoresizingMaskIntoConstraints = false
    button.clipsToBounds = false
    button.tintColor = .label
    button.accessibilityLabel = "Dismiss keyboard"
    button.accessibilityTraits = [.button]
    button.addTarget(self, action: #selector(dismissKeyboard), for: .touchUpInside)
    configureButton()

    addSubview(button)
    NSLayoutConstraint.activate([
      button.centerXAnchor.constraint(equalTo: centerXAnchor),
      button.centerYAnchor.constraint(equalTo: centerYAnchor),
      button.widthAnchor.constraint(equalToConstant: 52),
      button.heightAnchor.constraint(equalToConstant: 44),
    ])
  }

  private func configureButton() {
    let symbolConfig = UIImage.SymbolConfiguration(pointSize: 18, weight: .bold)
    let image = UIImage(systemName: "chevron.down", withConfiguration: symbolConfig)

    if #available(iOS 26.0, *) {
      var configuration = UIButton.Configuration.glass()
      configuration.image = image
      configuration.cornerStyle = .capsule
      configuration.baseForegroundColor = .label
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
      button.configuration = configuration
    } else {
      var configuration = UIButton.Configuration.gray()
      configuration.image = image
      configuration.cornerStyle = .capsule
      configuration.baseForegroundColor = .label
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0)
      button.configuration = configuration

      button.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.72)
      button.layer.cornerRadius = 22
      button.layer.borderWidth = 0.5
      button.layer.borderColor = UIColor.white.withAlphaComponent(0.65).cgColor
    }

    layer.shadowColor = UIColor.black.cgColor
    layer.shadowOpacity = 0.18
    layer.shadowRadius = 18
    layer.shadowOffset = CGSize(width: 0, height: 8)
  }

  @objc private func dismissKeyboard() {
    window?.endEditing(true)
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

}
