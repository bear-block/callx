package dev.callx.reactnative

import android.content.Context
import android.widget.FrameLayout
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.CallxVideoViewManagerDelegate
import com.facebook.react.viewmanagers.CallxVideoViewManagerInterface
import dev.callx.telecom.CallxVideoSurface
import dev.callx.telecom.CallxVideoSurfaces
import dev.callx.telecom.VideoSource

/** `CallxVideoView` (ADR-0010): props from src/specs/CallxVideoViewNativeComponent.ts through codegen. */
@ReactModule(name = CallxVideoViewManager.NAME)
class CallxVideoViewManager : SimpleViewManager<CallxVideoFrame>(), CallxVideoViewManagerInterface<CallxVideoFrame> {
    companion object { const val NAME = "CallxVideoView" }

    private val delegate = CallxVideoViewManagerDelegate(this)
    override fun getDelegate(): ViewManagerDelegate<CallxVideoFrame> = delegate
    override fun getName() = NAME
    override fun createViewInstance(context: ThemedReactContext) = CallxVideoFrame(context)

    override fun setCallId(view: CallxVideoFrame, value: String?) { view.callId = value }
    override fun setSource(view: CallxVideoFrame, value: String?) { view.source = value }
    override fun setFit(view: CallxVideoFrame, value: String?) { view.fit = value }
    override fun setMirror(view: CallxVideoFrame, value: Boolean) { view.mirror = value }

    override fun onAfterUpdateTransaction(view: CallxVideoFrame) {
        super.onAfterUpdateTransaction(view)
        view.apply()
    }

    override fun onDropViewInstance(view: CallxVideoFrame) {
        view.release()
        super.onDropViewInstance(view)
    }
}

/** The container the video adapter renders into. React Native does not lay out native children, so it does. */
class CallxVideoFrame(context: Context) : FrameLayout(context) {
    var callId: String? = null
    var source: String? = null
    var fit: String? = null
    var mirror = false
    private var surface: CallxVideoSurface? = null
    private var shown: List<Any?>? = null

    /** Attaches a surface for the current props, replacing the previous one when they changed. */
    fun apply() {
        val wanted = listOf(callId, source, fit, mirror)
        if (wanted == shown) return
        release()
        val id = callId?.takeIf { it.isNotEmpty() } ?: return
        val next = CallxVideoSurface(this,
            fit = if (fit == "contain") CallxVideoSurface.Fit.contain else CallxVideoSurface.Fit.cover, mirror = mirror)
        surface = next; shown = wanted
        CallxVideoSurfaces.attach(id, if (source == "local") VideoSource.local else VideoSource.remote, next)
    }

    fun release() {
        surface?.let(CallxVideoSurfaces::detach)
        surface = null; shown = null
    }

    private val relayout = Runnable {
        measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        layout(left, top, right, bottom)
    }

    override fun requestLayout() {
        super.requestLayout()
        // The adapter adds its renderer after React laid this view out; lay it out again.
        post(relayout)
    }
}
