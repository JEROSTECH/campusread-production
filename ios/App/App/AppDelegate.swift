import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var screenProtectionCoverView: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Register iOS Screen Capture and Screen Mirroring protection notification observer
        setupScreenCaptureProtection()
        return true
    }

    // MARK: - iOS DRM & Screen Capture Protection
    private func setupScreenCaptureProtection() {
        // Listen for screen capture/recording/AirPlay mirroring status changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenCapturedDidChange),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )

        // Listen for app going into background to shield cached snapshot
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc private func screenCapturedDidChange() {
        let isCaptured = UIScreen.main.isCaptured
        DispatchQueue.main.async { [weak self] in
            if isCaptured {
                self?.showScreenProtectionOverlay(reason: "Screen Recording or Mirroring Detected.\nCampusRead academic content is protected under DRM policy.")
            } else {
                self?.hideScreenProtectionOverlay()
            }
        }
    }

    @objc private func applicationWillResignActive() {
        showScreenProtectionOverlay(reason: "CampusRead Academic Reader")
    }

    @objc private func applicationDidBecomeActive() {
        if !UIScreen.main.isCaptured {
            hideScreenProtectionOverlay()
        }
    }

    private func showScreenProtectionOverlay(reason: String) {
        guard let window = self.window else { return }
        if screenProtectionCoverView != nil { return }

        let cover = UIView(frame: window.bounds)
        cover.backgroundColor = UIColor(red: 0.08, green: 0.10, blue: 0.18, alpha: 1.0)
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
            label.leadingAnchor.constraint(greaterThanOrEqualTo: cover.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: cover.trailingAnchor, constant: -24)
        ])

        window.addSubview(cover)
        self.screenProtectionCoverView = cover
    }

    private func hideScreenProtectionOverlay() {
        self.screenProtectionCoverView?.removeFromSuperview()
        self.screenProtectionCoverView = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {
        NotificationCenter.default.removeObserver(self)
    }
}
