// swift-tools-version: 6.0
import PackageDescription

// Source-checkout integration for native hosts. Framework packages still vendor the same
// canonical sources. No provider or framework dependency belongs in this product.
let package = Package(
    name: "CallxCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "CallxCore", targets: ["CallxCore"])],
    targets: [
        .target(name: "CallxCore", path: "native/ios/Sources/CallxCore"),
        .testTarget(name: "CallxCoreTests", dependencies: ["CallxCore"],
            path: "native/ios/Tests/CallxCoreTests"),
    ]
)
