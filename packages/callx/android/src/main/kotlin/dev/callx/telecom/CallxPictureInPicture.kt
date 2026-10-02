package dev.callx.telecom

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.ComponentCallbacks
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.view.View
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallRecord
import dev.callx.core.CallState
import dev.callx.core.LocalVideo

/**
 * Picture-in-picture for video calls on Android (ADR-0010 addendum). The whole Activity enters
 * PiP; the app shows a compact layout while [listener] reports true. The framework plugin
 * attaches the host Activity; the host declares `android:supportsPictureInPicture="true"`.
 * Main thread only.
 */
object CallxPictureInPicture {
    private val main = Handler(Looper.getMainLooper())
    private var activity: Activity? = null
    private var callbacks: ComponentCallbacks? = null
    private var layoutWatcher: View.OnLayoutChangeListener? = null
    private var runtime: BridgeRuntime? = null
    private var attachment = 0L
    private var stopObserving: (() -> Unit)? = null
    private var videoCallLive = false
    private var inPictureInPicture = false
    /** Enter PiP when the user leaves the app during a video call (Android 12+). */
    private var automatic = false
    /** Told when PiP starts or ends. */
    var listener: ((Boolean) -> Unit)? = null
        set(value) { field = value; value?.invoke(inPictureInPicture) }

    /** The plugin calls this when the host Activity is available, and again when it changes. */
    fun attach(activity: Activity, runtime: BridgeRuntime?) {
        if (this.activity === activity && this.runtime === runtime) { report(); return }
        detach()
        this.activity = activity
        this.runtime = runtime
        val generation = attachment
        val watcher = object : ComponentCallbacks {
            // Entering and leaving PiP resizes the window, which arrives as a configuration change.
            override fun onConfigurationChanged(newConfig: Configuration) {
                main.post { if (generation == attachment) report() }
            }
            @Deprecated("Required by the interface") override fun onLowMemory() {}
        }
        activity.registerComponentCallbacks(watcher)
        callbacks = watcher
        // Older Android versions dispatch application configuration callbacks without the
        // Activity's PiP window change. Observe its actual decor layout as well.
        val layout = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            main.post { if (generation == attachment) report() }
        }
        activity.window.decorView.addOnLayoutChangeListener(layout)
        layoutWatcher = layout
        videoCallLive = false
        stopObserving = runtime?.addCallObserver { call ->
            if (Looper.myLooper() == Looper.getMainLooper()) {
                if (generation == attachment) callChanged(call)
            } else main.post { if (generation == attachment) callChanged(call) }
        }
        report()
        update()
    }

    fun detach() {
        attachment++
        videoCallLive = false
        update()
        callbacks?.let { activity?.unregisterComponentCallbacks(it) }
        layoutWatcher?.let { activity?.window?.decorView?.removeOnLayoutChangeListener(it) }
        stopObserving?.invoke()
        activity = null; runtime = null; callbacks = null; layoutWatcher = null; stopObserving = null
        report()
    }

    fun configure(automatic: Boolean) {
        this.automatic = automatic
        update()
    }

    /** Enters PiP now. False when the device, the Activity or the moment does not allow it. */
    fun enter(): Boolean {
        val activity = activity ?: return false
        if (!supported(activity)) return false
        return try { activity.enterPictureInPictureMode(params()) } catch (_: IllegalStateException) { false }
        catch (_: IllegalArgumentException) { false }
    }

    private fun callChanged(call: CallRecord?) {
        val live = call != null && call.state in setOf(CallState.connecting, CallState.active, CallState.held) &&
            (call.video || call.localVideo != LocalVideo.off || call.remoteVideo)
        if (live == videoCallLive) return
        videoCallLive = live
        update()
    }

    private fun update() {
        val activity = activity ?: return
        if (!supported(activity)) return
        // setPictureInPictureParams throws when the Activity does not declare PiP support.
        try { activity.setPictureInPictureParams(params()) } catch (_: IllegalStateException) {}
        catch (_: IllegalArgumentException) {}
    }

    private fun params(): PictureInPictureParams = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(9, 16))
        .apply { if (Build.VERSION.SDK_INT >= 31) setAutoEnterEnabled(automatic && videoCallLive).setSeamlessResizeEnabled(true) }
        .build()

    private fun report() {
        val now = activity?.isInPictureInPictureMode == true
        if (now == inPictureInPicture) return
        inPictureInPicture = now
        listener?.invoke(now)
    }

    private fun supported(activity: Activity) =
        activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
}
