package dev.callx.preview.rn.device

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class DeviceHostMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        DeviceHost.pushToken = token; DeviceHost.record("FCM token refreshed")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Bootstrap failed: there is no runtime to deliver to, and the host log already says why.
        if (DeviceHost.bootstrapError != null) return
        if (DeviceHost.ingress.handlePush(message.data, message.priority, message.originalPriority)) return
        message.data["callxTest"]?.let(DeviceHost::handleTestSignal)
    }
}
