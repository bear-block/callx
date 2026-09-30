// swift-tools-version: 6.0
import PackageDescription

// LiveKit's current Swift SDK ships through Swift Package Manager only, so this plugin requires
// Flutter's Swift Package Manager support (`flutter config --enable-swift-package-manager`).
// Flutter links every plugin's package side by side, so callx is a sibling directory.
let package = Package(
    name: "callx_livekit",
    platforms: [.iOS("15.0")],
    products: [.library(name: "callx-livekit", targets: ["callx_livekit"])],
    dependencies: [
        .package(name: "FlutterFramework", path: "../FlutterFramework"),
        .package(name: "callx", path: "../../../callx/ios/callx"),
        .package(url: "https://github.com/livekit/client-sdk-swift", exact: "2.17.0"),
    ],
    targets: [
        .target(name: "callx_livekit", dependencies: [
            .product(name: "FlutterFramework", package: "FlutterFramework"),
            .product(name: "callx", package: "callx"),
            .product(name: "LiveKit", package: "client-sdk-swift"),
        ]),
    ]
)
