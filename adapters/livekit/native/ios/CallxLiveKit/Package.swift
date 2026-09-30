// swift-tools-version: 6.0
import PackageDescription

// Canonical sources of the LiveKit adapter; native:sync vendors them into callx_livekit and
// @bear-block/callx-livekit. Build and test on an iOS Simulator (CallKit is iOS-only).
let package = Package(
    name: "CallxLiveKit",
    platforms: [.iOS(.v15)],
    products: [.library(name: "CallxLiveKit", targets: ["CallxLiveKit"])],
    dependencies: [
        .package(path: "../../../../../native/ios"),
        .package(url: "https://github.com/livekit/client-sdk-swift", exact: "2.17.0"),
    ],
    targets: [
        .target(name: "CallxLiveKit", dependencies: [
            .product(name: "CallxCore", package: "ios"),
            .product(name: "LiveKit", package: "client-sdk-swift"),
        ]),
        .testTarget(name: "CallxLiveKitTests", dependencies: ["CallxLiveKit"]),
    ]
)
