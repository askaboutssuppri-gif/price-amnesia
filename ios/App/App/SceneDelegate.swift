import UIKit
import Capacitor

/// Scene delegate (added in 1.28.11): iOS/iPadOS 27 requires the UIScene
/// life cycle for apps built with the current SDK. The old UIWindow-based
/// AppDelegate alone no longer launches — the app froze at launch with
/// "UIScene life cycle is required" / EXC_BREAKPOINT in
/// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption.
/// The scene owns the window now; the Main storyboard's initial view
/// controller is the Capacitor bridge (CAPBridgeViewController).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        window.rootViewController = storyboard.instantiateInitialViewController()
        self.window = window
        window.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Called when the app was launched with a url (deep links / OAuth
        // callbacks). Mirrors AppDelegate's open-url handler so the App API
        // keeps tracking app url opens.
        guard let urlContext = URLContexts.first else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // Called when the app was launched with an activity, including
        // Universal Links. Mirrors AppDelegate's continue-activity handler.
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

}
