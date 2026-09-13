// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CallxCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "CallxCore", targets: ["CallxCore"])],
    targets: [
        .target(name: "CallxCore"),
        .testTarget(name: "CallxCoreTests", dependencies: ["CallxCore"]),
    ]
)
