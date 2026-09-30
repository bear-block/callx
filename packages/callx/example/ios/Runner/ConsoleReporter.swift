import Foundation
import UIKit

/// Test harness only: reports the VoIP token and host log to the local call console
/// (`npm run call:console`) once a second. Without the console running, each report fails fast
/// and is dropped.
enum ConsoleReporter {
  static func start(consoleURL: URL, app: String, state: @escaping @Sendable () -> (String?, [String])) {
    let model = "\(UIDevice.current.model) \(UIDevice.current.systemVersion)"
    let endpoint = consoleURL.appendingPathComponent("api/device")
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "callx.console-reporter"))
    timer.schedule(deadline: .now(), repeating: 1)
    timer.setEventHandler {
      let (token, events) = state()
      var request = URLRequest(url: endpoint, timeoutInterval: 1)
      request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "content-type")
      request.httpBody = try? JSONSerialization.data(withJSONObject: ["app": "\(app)-ios", "model": model,
        "token": token as Any, "events": events])
      URLSession.shared.dataTask(with: request).resume()
    }
    timer.resume()
    retained = timer
  }
  nonisolated(unsafe) private static var retained: DispatchSourceTimer?
}
