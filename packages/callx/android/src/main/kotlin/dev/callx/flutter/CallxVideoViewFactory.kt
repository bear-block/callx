package dev.callx.flutter

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import dev.callx.telecom.CallxVideoSurface
import dev.callx.telecom.CallxVideoSurfaces
import dev.callx.telecom.VideoSource
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory

/**
 * `CallxVideoView` for Flutter (ADR-0010): a container the video adapter renders into. Flutter
 * shows it with Texture Layer Hybrid Composition, so adapters must render with a TextureView.
 * Parameters are fixed per view; the Dart widget recreates the view when they change.
 */
internal class CallxVideoViewFactory : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
        val params = args as? Map<*, *> ?: emptyMap<String, Any?>()
        return CallxVideoPlatformView(context, params)
    }
}

private class CallxVideoPlatformView(context: Context, params: Map<*, *>) : PlatformView {
    private val container = FrameLayout(context)
    private val surface = CallxVideoSurface(container,
        fit = if (params["fit"] == "contain") CallxVideoSurface.Fit.contain else CallxVideoSurface.Fit.cover,
        mirror = params["mirror"] == true)

    init {
        val callId = params["callId"] as? String
        val source = if (params["source"] == "local") VideoSource.local else VideoSource.remote
        if (!callId.isNullOrEmpty()) CallxVideoSurfaces.attach(callId, source, surface)
    }

    override fun getView(): View = container
    override fun dispose() = CallxVideoSurfaces.detach(surface)
}
