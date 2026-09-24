import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var screenProtectionCoverView: UIView?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        setupScreenCaptureProtection()
        return true
    }

    // MARK: - iOS DRM & Screen Capture Protection

    private func setupScreenCaptureProtection() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenCapturedDidChange),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
    }

    @objc private func screenCapturedDidChange() {
        let isCaptured = UIScreen.main.isCaptured

        DispatchQueue.main.async { [weak self] in
            if isCaptured {
                self?.showScreenProtectionOverlay(
                    reason: "Screen Recording or Mirroring Detected.\nCampusRead academic content is protected under DRM policy."
                )
            } else {
                self?.hideScreenProtectionOverlay()
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        showScreenProtectionOverlay(reason: "CampusRead Academic Reader")
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if !UIScreen.main.isCaptured {
            hideScreenProtectionOverlay()
        }
    }

    private func currentWindow() -> UIWindow? {
        if let window = window {
            return window
        }

        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter {
                $0.activationState == .foregroundActive ||
                $0.activationState == .foregroundInactive
            }

        return scenes
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
            ?? scenes.flatMap { $0.windows }.first
    }

    private func showScreenProtectionOverlay(reason: String) {
        guard let window = currentWindow() else { return }
        if screenProtectionCoverView != nil { return }

        let cover = UIView(frame: window.bounds)
        cover.backgroundColor = UIColor(
            red: 0.08,
            green: 0.10,
            blue: 0.18,
            alpha: 1.0
        )
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        let label = UILabel()
        label.text = reason
        label.textColor = .white
        label.font = UIFont.systemFont(ofSize: 15, weight: .bold)
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false

        cover.addSubview(label)

        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            label.leadingAnchor.constraint(
                greaterThanOrEqualTo: cover.leadingAnchor,
                constant: 24
            ),
            label.trailingAnchor.constraint(
                lessThanOrEqualTo: cover.trailingAnchor,
                constant: -24
            )
        ])

        window.addSubview(cover)
        screenProtectionCoverView = cover
    }

    private func hideScreenProtectionOverlay() {
        screenProtectionCoverView?.removeFromSuperview()
        screenProtectionCoverView = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - UIScene Support

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )

        config.delegateClass = SceneDelegate.self
        return config
    }
}
