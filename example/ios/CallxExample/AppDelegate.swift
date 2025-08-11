import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import CallKit
import PushKit
import FirebaseCore

@main
class AppDelegate: RCTAppDelegate {
  var reactNativeDelegate: ReactNativeDelegate!
  // Factory will be set in didFinishLaunchingWithOptions

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Configure Firebase - follow React Native Firebase docs
    FirebaseApp.configure()
    
    // Initialize Callx native PushKit handler early
    // Note: This will be handled by the native module initialization
    // We don't need to manually call it here to avoid potential crashes
    
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    self.reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "CallxExample",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // MARK: - Remote Notifications

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    print("📱 Device token received: \(deviceToken.map { String(format: "%02.2hhx", $0) }.joined())")
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    print("❌ Failed to register for remote notifications: \(error.localizedDescription)")
  }

  // MARK: - Background App Refresh

  override func application(
    _ application: UIApplication,
    performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    // Handle background app refresh for VoIP
    print("🔄 Background app refresh triggered")
    completionHandler(.newData)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
