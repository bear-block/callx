package dev.callx.telecom

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.lang.ref.WeakReference

/** What answering a call does while the device is locked. */
enum class LockedAnswer {
    /**
     * The iOS behaviour: the call connects at once, and the app opens only after the user unlocks.
     * Until then a native call screen with the caller, a timer and hang-up stays on the lock screen.
     */
    RequireUnlock,

    /**
     * The app opens above the lock screen for the call without unlocking, and drops back behind it
     * when the call ends. Everything that Activity shows is reachable without unlocking, so use it
     * only when the Activity shows nothing but the call. The Activity must call [CallxLockScreen.onIntent].
     */
    ShowOverLockScreen,
}

/** Lets the Activity that Callx opens for an answered call show above the lock screen, only while the call lasts. */
object CallxLockScreen {
    internal const val EXTRA_SHOW_OVER_LOCK_SCREEN = "dev.callx.telecom.SHOW_OVER_LOCK_SCREEN"
    @Volatile private var shown: WeakReference<Activity>? = null

    /**
     * Call from `onCreate` and `onNewIntent` of your launcher Activity. It does nothing unless Callx
     * opened the Activity with [LockedAnswer.ShowOverLockScreen] for a call that is still live.
     */
    fun onIntent(activity: Activity, intent: Intent?) {
        val callId = intent?.getStringExtra(TelecomIngress.EXTRA_CALL_ID) ?: return
        if (!intent.getBooleanExtra(EXTRA_SHOW_OVER_LOCK_SCREEN, false)) return
        if (TelecomIngress.active?.isLive(callId) != true) return
        shown = WeakReference(activity)
        activity.setShowWhenLocked(true); activity.setTurnScreenOn(true)
    }

    /** Called when a call ends: the Activity goes back behind the lock screen. */
    internal fun release() {
        val activity = shown?.get() ?: return
        shown = null
        activity.runOnUiThread { activity.setShowWhenLocked(false); activity.setTurnScreenOn(false) }
    }
}

/**
 * Android 14+ lets users and Play policy deny full-screen intents. Without them a locked device shows
 * the call as a notification instead of the incoming call screen; the call still rings.
 */
object CallxFullScreenIntent {
    fun isAllowed(context: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

    /** Opens the system page where the user allows full-screen notifications for this app. */
    fun settingsIntent(context: Context): Intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
