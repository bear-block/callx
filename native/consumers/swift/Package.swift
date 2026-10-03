// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CallxNativeConsumer",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "CallxNativeConsumer", targets: ["CallxNativeConsumer"])],
    dependencies: [.package(name: "CallxCheckout", path: "../../..")],
    targets: [.target(name: "CallxNativeConsumer", dependencies: [
        .product(name: "CallxCore", package: "CallxCheckout"),
    ])]
)
