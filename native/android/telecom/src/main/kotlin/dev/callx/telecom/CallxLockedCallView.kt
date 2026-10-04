package dev.callx.telecom

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Chronometer
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.graphics.PathParser
import dev.callx.core.CallRecord
import dev.callx.core.CallState

/** Rendering only. The Activity routes actions through the native coordinator and Telecom. */
internal class CallxLockedCallView(
    context: Context, appName: String, callerName: String,
    private val labels: CallNotificationLabels,
    onMute: () -> Unit, onHold: () -> Unit, onAudio: () -> Unit,
    onOpenApp: () -> Unit, onEnd: () -> Unit,
) : ScrollView(context) {
    private val status = caption("Connecting", 15f, SUBTLE)
    private val timer = Chronometer(context).apply {
        gravity = Gravity.CENTER; setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
        typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
    }
    private var timerStarted = false
    private val error = caption("", 13f, Color.rgb(0xff, 0xb4, 0xab)).apply {
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    private val mute = control(labels.mute, Glyph.MIC, onMute)
    private val hold = control(labels.hold, Glyph.PAUSE, onHold)
    private val audio = control(labels.audio, Glyph.SPEAKER, onAudio).apply { contentDescription = "Audio route" }

    init {
        isFillViewport = true; setBackgroundColor(BACKGROUND)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(48), dp(24), dp(36))
        }
        addView(root, LayoutParams(-1, -1))
        root.addView(caption(appName, 12f, SUBTLE).apply { letterSpacing = 0.12f })
        root.addView(caption(initials(callerName), 26f, BACKGROUND).apply {
            typeface = Typeface.DEFAULT_BOLD
            background = rounded(Color.rgb(0xd7, 0xe9, 0xde), 40)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, LinearLayout.LayoutParams(dp(80), dp(80)).apply { topMargin = dp(28) })
        root.addView(caption(callerName, 32f, Color.WHITE).apply {
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            maxLines = 2; ellipsize = TextUtils.TruncateAt.END
        }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) })
        root.addView(status, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        root.addView(timer, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        root.addView(error, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        root.addView(View(context), LinearLayout.LayoutParams(0, 0, 1f))
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        for (item in listOf(mute, audio, hold)) row.addView(item,
            LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(4); marginEnd = dp(4) })
        root.addView(row, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) })
        root.addView(View(context), LinearLayout.LayoutParams(0, 0, 1f))
        root.addView(caption(labels.openApp, 15f, Color.WHITE).apply {
            background = rounded(Color.argb(0x22, 0xff, 0xff, 0xff), 24)
            setPadding(dp(28), dp(12), dp(28), dp(12))
            isClickable = true; isFocusable = true; setOnClickListener { onOpenApp() }
        }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(28); bottomMargin = dp(24) })
        root.addView(control(labels.hangUp, Glyph.END, onEnd, red = true), LinearLayout.LayoutParams(dp(104), -2))
    }

    fun showError(message: CharSequence) { error.text = message }

    fun render(call: CallRecord, endpoints: TelecomIngress.CallAudio?, pending: Boolean) {
        status.text = when {
            call.state == CallState.held -> "On hold"
            call.mediaInterrupted -> "Reconnecting"
            call.state == CallState.active -> if (call.video) "Video call · camera off while locked" else "Voice call connected"
            else -> "Connecting"
        }
        call.acceptedAtMs?.let { accepted ->
            if (!timerStarted) {
                timer.base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - accepted).coerceAtLeast(0)
                timer.start(); timerStarted = true
            }
        }
        val enabled = !pending && call.state in listOf(CallState.active, CallState.held)
        mute.update(if (call.muted) labels.unmute else labels.mute, call.muted, enabled)
        hold.update(if (call.state == CallState.held) labels.resume else labels.hold, call.state == CallState.held, enabled)
        audio.update(endpoints?.current?.name ?: labels.audio, false,
            !pending && endpoints?.available?.isNotEmpty() == true, "Audio route")
    }

    private fun control(label: CharSequence, glyph: Glyph, action: () -> Unit, red: Boolean = false) =
        RoundControl(label, glyph, action, red)

    private inner class RoundControl(label: CharSequence, glyph: Glyph, action: () -> Unit, private val red: Boolean) : LinearLayout(context) {
        private val icon = ControlIcon(context, glyph)
        private val labelView = caption(label, 13f, Color.WHITE).apply { maxLines = 2; ellipsize = TextUtils.TruncateAt.END }
        init {
            orientation = VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            contentDescription = label; isClickable = true; isFocusable = true; setOnClickListener { action() }
            // One accessible control; the decorative icon and label do not receive separate focus.
            icon.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            labelView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(icon, LinearLayout.LayoutParams(dp(64), dp(64)))
            addView(labelView, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(9) })
            update(label, false, true)
        }
        fun update(label: CharSequence, selected: Boolean, enabled: Boolean, description: CharSequence = label) {
            labelView.text = label; contentDescription = description; isEnabled = enabled
            alpha = if (enabled) 1f else 0.4f; isSelected = selected
            icon.highlighted = selected; icon.red = red; icon.invalidate()
        }
    }

    private enum class Glyph { MIC, PAUSE, SPEAKER, END }
    private class ControlIcon(context: Context, private val glyph: Glyph) : View(context) {
        var highlighted = false
        var red = false
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val path = PathParser.createPathFromPathData(when (glyph) {
            Glyph.MIC -> "M12,14c1.66,0 3,-1.34 3,-3V5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6c0,1.66 1.34,3 3,3z M17,11c0,2.76 -2.24,5 -5,5s-5,-2.24 -5,-5H5c0,3.53 2.61,6.43 6,6.92V21h2v-3.08c3.39,-0.49 6,-3.39 6,-6.92z"
            Glyph.PAUSE -> "M6,5h4v14H6z M14,5h4v14h-4z"
            Glyph.SPEAKER -> "M3,9v6h4l5,5V4L7,9z M16,7v2c1.3,0.6 2,1.7 2,3s-0.7,2.4 -2,3v2c2.5,-0.8 4,-2.7 4,-5s-1.5,-4.2 -4,-5z"
            Glyph.END -> "M6.62,10.79c1.44,2.83 3.76,5.14 6.59,6.59l2.2,-2.2c0.27,-0.27 0.67,-0.36 1.02,-0.24 1.12,0.37 2.33,0.57 3.57,0.57 0.55,0 1,0.45 1,1V20c0,0.55 -0.45,1 -1,1 -9.39,0 -17,-7.61 -17,-17 0,-0.55 0.45,-1 1,-1h3.5c0.55,0 1,0.45 1,1 0,1.25 0.2,2.45 0.57,3.57 0.11,0.35 0.03,0.74 -0.25,1.02z"
        })
        override fun onDraw(canvas: Canvas) {
            val size = minOf(width, height).toFloat()
            paint.color = when { red -> Color.rgb(0xeb, 0x43, 0x4b); highlighted -> Color.WHITE; else -> Color.argb(0x33, 0xff, 0xff, 0xff) }
            canvas.drawCircle(width / 2f, height / 2f, size / 2, paint)
            paint.color = if (highlighted && !red) BACKGROUND else Color.WHITE
            canvas.save(); canvas.translate(width / 2f, height / 2f)
            if (glyph == Glyph.END) canvas.rotate(135f)
            val scale = size * 0.43f / 24f; canvas.scale(scale, scale); canvas.translate(-12f, -12f)
            canvas.drawPath(path, paint)
            canvas.restore()
        }
    }

    private fun caption(value: CharSequence, sp: Float, color: Int) = TextView(context).apply {
        text = value; gravity = Gravity.CENTER; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
    }
    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(radius).toFloat() }
    private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()
    private fun initials(name: String) = name.split(Regex("[\\s._-]+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    private companion object {
        val BACKGROUND = Color.rgb(0x17, 0x2c, 0x2a)
        val SUBTLE = Color.rgb(0x9b, 0xdd, 0xc5)
    }
}
