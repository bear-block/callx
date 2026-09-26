package dev.callx.preview.callx_flutter_example

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class ExampleApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CallHost.start(this)
        // FirebaseApp exists only when google-services.json was present at build time.
        if (FirebaseApp.getApps(this).isEmpty()) {
            CallHost.record("Firebase not configured: add android/app/google-services.json")
            return
        }
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { CallHost.pushToken = it; CallHost.record("FCM token ready") }
            .addOnFailureListener { CallHost.record("FCM token failed: ${it.message}") }
    }
}
