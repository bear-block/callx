import Foundation
import React

@objc(Callx)
final class CallxModule: RCTEventEmitter {
    override static func requiresMainQueueSetup() -> Bool { false }
    override func supportedEvents() -> [String]! { ["callxEvent"] }

    @objc func setup(_ config: NSDictionary, resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock) {
        resolve([
            "contractVersion": "0.1.0", "coreVersion": "0.1.0", "execution": "native",
            "accountGeneration": "unconfigured", "nativeCalling": false, "durableReplay": false,
            "providerManagedSignaling": false, "hold": false, "mute": false,
        ])
    }

    @objc func unavailable(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock,
        rejecter reject: RCTPromiseRejectBlock) {
        reject("notConfigured", "Native Callx host has not been configured.", nil)
    }
    @objc func execute(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        unavailable(value, resolver: resolve, rejecter: reject)
    }
    @objc func queryOperation(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        unavailable(value, resolver: resolve, rejecter: reject)
    }
    @objc func openSession(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        unavailable(value, resolver: resolve, rejecter: reject)
    }
    @objc func acknowledge(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        unavailable(value, resolver: resolve, rejecter: reject)
    }
    @objc func closeSession(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        unavailable(value, resolver: resolve, rejecter: reject)
    }
    @objc func getSnapshot(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        reject("notConfigured", "Native Callx host has not been configured.", nil)
    }
    @objc func dispose() {}
}
