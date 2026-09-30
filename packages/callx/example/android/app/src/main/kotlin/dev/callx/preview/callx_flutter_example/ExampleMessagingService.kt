package dev.callx.preview.callx_flutter_example

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class ExampleMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        CallHost.pushToken = token; CallHost.record("FCM token refreshed")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (CallHost.bootstrapError != null) return
        if (CallHost.ingress.handlePush(message.data, message.priority, message.originalPriority)) return
        message.data["callxTest"]?.let(CallHost::handleTestSignal)
    }
}
