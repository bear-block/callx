```kotlin
// android/app/src/main/…/com/example/calls/MessagingService.kt
package com.example.calls

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.callx.telecom.CallxBootstrap
import dev.callx.telecom.CallxPushTokens

class MessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val ingress = CallxBootstrap.started?.ingress
        if (ingress?.handlePush(message.data, message.priority, message.originalPriority) == true) return
        // Not a Callx invitation: handle your app's other messages here.
    }

    override fun onNewToken(token: String) = CallxPushTokens.updateFcm(token)
}
```

```xml
<service android:name=".MessagingService" android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>
```

`handlePush` returns `false` for messages that are not Callx invitations, so this service can
keep handling your other notifications.
