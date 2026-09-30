import Foundation
@preconcurrency import React

/// JavaScript configuration only; the adapter itself is created natively by Callx's bootstrap.
@objc(CallxLiveKit)
final class CallxLiveKitModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func configure(_ tokenUrl: String, headers: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let url = URL(string: tokenUrl) else { reject("invalidArgument", "tokenUrl is not a URL.", nil); return }
    do {
      try CallxLiveKit.configure(tokenURL: url, headers: headers as? [String: String] ?? [:])
      resolve(nil)
    } catch { reject("invalidArgument", "\(error)", error) }
  }

  @objc func reset(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    CallxLiveKit.reset(); resolve(nil)
  }
}
