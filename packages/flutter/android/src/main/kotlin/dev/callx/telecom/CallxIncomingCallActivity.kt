package dev.callx.telecom

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Chronometer
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.PathParser
import java.lang.ref.WeakReference

/**
 * Default full-screen incoming call screen. It uses plain Android views, so it appears at once
 * over the lock screen instead of waiting for Flutter or React Native to start. Decline only
 * closes it. Answer connects the call, then opens the app's launcher Activity with
 * [TelecomIngress.EXTRA_CALL_ID]; while the device is locked, [LockedAnswer] decides whether the
 * app waits for the user to unlock or opens above the lock screen. Hosts replace this screen with
 * `CallStylePresenter(fullScreenIntent = ...)`.
 *
 * The notification's answer button opens this Activity with [EXTRA_ANSWER] instead of a broadcast
 * receiver: since Android 12, a receiver started from a notification cannot open an Activity.
 */
class CallxIncomingCallActivity : Activity() {
    companion object {
        internal const val EXTRA_DISPLAY_NAME = "dev.callx.telecom.DISPLAY_NAME"
        internal const val EXTRA_ANSWER = "dev.callx.telecom.ANSWER_NOW"
        internal const val EXTRA_LOCKED_ANSWER = "dev.callx.telecom.LOCKED_ANSWER"
        internal const val EXTRA_ANSWER_LABEL = "dev.callx.telecom.ANSWER_LABEL"
        internal const val EXTRA_DECLINE_LABEL = "dev.callx.telecom.DECLINE_LABEL"
        internal const val EXTRA_HANG_UP_LABEL = "dev.callx.telecom.HANG_UP_LABEL"
        internal const val EXTRA_OPEN_APP_LABEL = "dev.callx.telecom.OPEN_APP_LABEL"
        @Volatile private var shown: WeakReference<CallxIncomingCallActivity>? = null

        internal fun intent(context: Context, callId: String, displayName: String, answer: Boolean,
            labels: CallNotificationLabels, lockedAnswer: LockedAnswer) = Intent(context, CallxIncomingCallActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(TelecomIngress.EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_DISPLAY_NAME, displayName)
            .putExtra(EXTRA_ANSWER, answer)
            .putExtra(EXTRA_LOCKED_ANSWER, lockedAnswer.name)
            .putExtra(EXTRA_ANSWER_LABEL, labels.answer)
            .putExtra(EXTRA_DECLINE_LABEL, labels.decline)
            .putExtra(EXTRA_HANG_UP_LABEL, labels.hangUp)
            .putExtra(EXTRA_OPEN_APP_LABEL, labels.openApp)

        /** The call was answered elsewhere (the app, a headset, the car): close the ringing screen. */
        internal fun callAnswered(callId: String) = finishIf(callId) { !it.inCall }

        /** The call ended: close the screen in either mode. */
        internal fun callEnded(callId: String) = finishIf(callId) { true }

        private fun finishIf(callId: String, condition: (CallxIncomingCallActivity) -> Boolean) {
            val activity = shown?.get() ?: return
            activity.runOnUiThread { if (activity.callId == callId && condition(activity)) activity.finish() }
        }
    }

    private var callId: String? = null
    /** Answered while locked with [LockedAnswer.RequireUnlock]: this screen now shows the call. */
    private var inCall = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true); setTurnScreenOn(true)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent); handle(intent)
    }

    override fun onDestroy() {
        if (shown?.get() === this) shown = null
        super.onDestroy()
    }

    private fun handle(intent: Intent) {
        val id = intent.getStringExtra(TelecomIngress.EXTRA_CALL_ID)
        val ingress = TelecomIngress.active
        if (inCall && id == callId) return
        // Without an attached ingress, or once the call stopped ringing, there is nothing to answer.
        if (id == null || ingress == null || !ingress.isRinging(id)) { finish(); return }
        callId = id; shown = WeakReference(this)
        if (intent.getBooleanExtra(EXTRA_ANSWER, false)) { answer(ingress, id); return }
        setContentView(content(intent, ingress, id))
    }

    private fun answer(ingress: TelecomIngress, id: String) {
        ingress.onNotificationAction(id, TelecomIngress.ACTION_ANSWER)
        val locked = getSystemService(KeyguardManager::class.java).isKeyguardLocked
        val policy = intent.getStringExtra(EXTRA_LOCKED_ANSWER)
            ?.let { runCatching { LockedAnswer.valueOf(it) }.getOrNull() } ?: LockedAnswer.RequireUnlock
        when {
            !locked -> { openApp(id, overLockScreen = false); finish() }
            policy == LockedAnswer.ShowOverLockScreen -> { openApp(id, overLockScreen = true); finish() }
            else -> { inCall = true; setContentView(inCallContent(ingress, id)); requestUnlock(id) }
        }
    }

    /** Opens the app once the user unlocks. If they cancel, the call continues on this screen. */
    private fun requestUnlock(id: String) {
        getSystemService(KeyguardManager::class.java).requestDismissKeyguard(this,
            object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() { openApp(id, overLockScreen = false); finish() }
            })
    }

    private fun openApp(id: String, overLockScreen: Boolean) {
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(TelecomIngress.EXTRA_CALL_ID, id)
                .putExtra(CallxLockScreen.EXTRA_SHOW_OVER_LOCK_SCREEN, overLockScreen))
        }
    }

    private fun inCallContent(ingress: TelecomIngress, id: String): View {
        val root = screen(intent.getStringExtra(EXTRA_DISPLAY_NAME) ?: id)
        root.addView(Chronometer(this).apply {
            base = SystemClock.elapsedRealtime(); gravity = Gravity.CENTER
            setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f); start()
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(12) })
        root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))
        root.addView(text(intent.getCharSequenceExtra(EXTRA_OPEN_APP_LABEL) ?: "Open app", 16f, Color.WHITE).apply {
            setPadding(dp(28), dp(12), dp(28), dp(12))
            background = GradientDrawable().apply { cornerRadius = dp(24).toFloat(); setColor(Color.argb(0x33, 0xff, 0xff, 0xff)) }
            isClickable = true; isFocusable = true; setOnClickListener { requestUnlock(id) }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            .apply { bottomMargin = dp(40) })
        root.addView(button(intent.getCharSequenceExtra(EXTRA_HANG_UP_LABEL) ?: "Hang up", Color.rgb(0xc6, 0x28, 0x28), declines = true) {
            ingress.onNotificationAction(id, TelecomIngress.ACTION_HANG_UP); finish()
        })
        return root
    }

    private fun content(intent: Intent, ingress: TelecomIngress, id: String): View {
        val root = screen(intent.getStringExtra(EXTRA_DISPLAY_NAME) ?: id)
        root.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        buttons.addView(button(intent.getCharSequenceExtra(EXTRA_DECLINE_LABEL) ?: "Decline", Color.rgb(0xc6, 0x28, 0x28), declines = true) {
            ingress.onNotificationAction(id, TelecomIngress.ACTION_DECLINE); finish()
        })
        buttons.addView(View(this), LinearLayout.LayoutParams(dp(72), 0))
        buttons.addView(button(intent.getCharSequenceExtra(EXTRA_ANSWER_LABEL) ?: "Answer", Color.rgb(0x2e, 0x7d, 0x32), declines = false) {
            answer(ingress, id)
        })
        root.addView(buttons)
        return root
    }

    /** The shared top of both screens: app name, caller initials and caller name. */
    private fun screen(name: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        setBackgroundColor(Color.rgb(0x17, 0x2c, 0x2a)); setPadding(dp(24), dp(96), dp(24), dp(64))
        addView(text(appLabel(), 14f, Color.rgb(0x9b, 0xdd, 0xc5)).apply { letterSpacing = 0.15f })
        addView(TextView(context).apply {
            text = initials(name); gravity = Gravity.CENTER; setTextColor(Color.rgb(0x17, 0x2c, 0x2a))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f); typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.rgb(0xd7, 0xe9, 0xde)) }
        }, LinearLayout.LayoutParams(dp(112), dp(112)).apply { topMargin = dp(48) })
        addView(text(name, 30f, Color.WHITE).apply { typeface = Typeface.DEFAULT_BOLD; setPadding(0, dp(24), 0, 0) })
    }

    private fun button(label: CharSequence, color: Int, declines: Boolean, onClick: () -> Unit) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        addView(CallButton(context, color, declines).apply {
            contentDescription = label; isClickable = true; isFocusable = true
            setOnClickListener { onClick() }
        }, LinearLayout.LayoutParams(dp(72), dp(72)))
        addView(text(label, 15f, Color.WHITE).apply { setPadding(0, dp(12), 0, 0) })
    }

    private fun text(value: CharSequence, sp: Float, color: Int) = TextView(this).apply {
        text = value; gravity = Gravity.CENTER; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
    }

    private fun appLabel() = applicationInfo.loadLabel(packageManager).toString().uppercase()
    private fun initials(name: String) = name.split(Regex("[\\s._-]+")).filter { it.isNotEmpty() }
        .take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(),
        resources.displayMetrics).toInt()
}

/** A round button with the Material call icon; the decline handset points down, as in dialers. */
private class CallButton(context: Context, color: Int, private val declines: Boolean) : View(context) {
    private val circle = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private val glyph = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = Color.WHITE }
    private val handset = PathParser.createPathFromPathData(HANDSET)

    override fun onDraw(canvas: Canvas) {
        val size = minOf(width, height).toFloat()
        canvas.drawCircle(width / 2f, height / 2f, size / 2, circle)
        canvas.save()
        canvas.translate(width / 2f, height / 2f)
        if (declines) canvas.rotate(135f)
        val scale = size * 0.45f / 24f
        canvas.scale(scale, scale)
        canvas.translate(-12f, -12f)
        canvas.drawPath(handset, glyph)
        canvas.restore()
    }

    private companion object {
        /** Material Symbols "call", 24×24 viewport. */
        const val HANDSET = "M6.62,10.79c1.44,2.83 3.76,5.14 6.59,6.59l2.2,-2.2c0.27,-0.27 0.67,-0.36 1.02,-0.24 " +
            "1.12,0.37 2.33,0.57 3.57,0.57 0.55,0 1,0.45 1,1V20c0,0.55 -0.45,1 -1,1 -9.39,0 -17,-7.61 -17,-17 " +
            "0,-0.55 0.45,-1 1,-1h3.5c0.55,0 1,0.45 1,1 0,1.25 0.2,2.45 0.57,3.57 0.11,0.35 0.03,0.74 -0.25,1.02l-2.2,2.2z"
    }
}
