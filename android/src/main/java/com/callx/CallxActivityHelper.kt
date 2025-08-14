package com.callx

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.util.Log
import android.view.WindowManager
import android.content.pm.PackageManager
import org.json.JSONObject
import java.io.IOException

/**
 * Helper class to handle lock screen interactions for Callx
 * This can be used by any Activity that needs to handle incoming calls
 */
class CallxActivityHelper(private val activity: Activity) {

    companion object {
        private const val TAG = "CallxActivityHelper"
    }

    /**
     * Handle call answer from locked screen
     * Call this in onCreate() and onNewIntent()
     */
    fun handleCallAnswer() {
        Log.d(TAG, "🔧 handleCallAnswer called")
        handleCallAnswerWithIntent(activity.intent)
    }

    /**
     * Handle call answer from onCreate (when activity is first created)
     */
    fun handleCallAnswerFromCreate() {
        Log.d(TAG, "🔧 handleCallAnswerFromCreate called")
        // Delay a bit to ensure activity is fully created
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            handleCallAnswerWithIntent(activity.intent)
        }, 100)
    }

    /**
     * Handle call answer with specific intent
     */
    fun handleCallAnswerWithIntent(intent: android.content.Intent?) {
        Log.d(TAG, "🔧 handleCallAnswerWithIntent called with: $intent")
        
        intent?.let { 
            val fromIncomingCall = intent.getBooleanExtra("from_incoming_call", false)
            val deviceWasLocked = intent.getBooleanExtra("device_was_locked", false)
            
            Log.d(TAG, "📱 Intent extras - fromIncomingCall: $fromIncomingCall, deviceWasLocked: $deviceWasLocked")
            
            if (fromIncomingCall && deviceWasLocked) {
                Log.d(TAG, "🚀 App launched from locked screen call answer")
                
                // Check configuration to decide lock screen behavior
                val config = loadCallxConfig()
                Log.d(TAG, "⚙️ Config - showOverLockscreen: ${config.showOverLockscreen}, requireUnlock: ${config.requireUnlock}")
                
                when {
                    config.showOverLockscreen && config.requireUnlock -> {
                        // 🔐 HIGH SECURITY MODE: Show over lock screen but require unlock to interact
                        Log.d(TAG, "🔐 High security mode: Show over lock screen + require unlock")
                        enableShowOverLockscreen()
                        requestUnlockForInteraction()
                    }
                    config.showOverLockscreen && !config.requireUnlock -> {
                        // 🔓 STANDARD MODE: Show over lock screen, allow immediate interaction
                        Log.d(TAG, "🔓 Standard mode: Show over lock screen")
                        enableShowOverLockscreen()
                    }
                    !config.showOverLockscreen && config.requireUnlock -> {
                        // 🔒 SECURE MODE: Don't show over lock screen, require unlock first
                        Log.d(TAG, "🔒 Secure mode: Require unlock first")
                        requestUnlockScreen()
                    }
                    else -> {
                        // 📱 MINIMAL MODE: Don't show over lock screen, no special unlock requirement
                        Log.d(TAG, "📱 Minimal mode: Standard behavior")
                        // Do nothing special - standard app behavior
                    }
                }
            } else {
                Log.d(TAG, "❌ Not from incoming call or device not locked")
            }
        } ?: run {
            Log.d(TAG, "❌ No intent available")
        }
    }

    /**
     * Manually trigger lock screen handling
     * Useful for testing or custom implementations
     */
    fun triggerLockScreenHandling() {
        Log.d(TAG, "🔧 Manually triggering lock screen handling")
        handleCallAnswer()
    }

    /**
     * Enable showing app over lock screen
     */
    private fun enableShowOverLockscreen() {
        try {
            Log.d(TAG, "🔓 Enabling show over lock screen...")
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(true)
                activity.setTurnScreenOn(true)
            } else {
                @Suppress("DEPRECATION")
                activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                )
            }
            
            Log.d(TAG, "✅ Show over lock screen enabled")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to enable show over lock screen", e)
        }
    }

    /**
     * Load Callx configuration from AndroidManifest <meta-data>
     * Fallback to sensible defaults when not provided
     */
    private fun loadCallxConfig(): CallxAppConfig {
        val showOverLockscreen = readMetaBoolean("showOverLockscreen", true)
        val requireUnlock = readMetaBoolean("requireUnlock", false)
        return CallxAppConfig(
            showOverLockscreen = showOverLockscreen,
            requireUnlock = requireUnlock
        )
    }

    private fun readMetaBoolean(key: String, defaultValue: Boolean): Boolean {
        return try {
            val appInfo = activity.packageManager.getApplicationInfo(
                activity.packageName,
                PackageManager.GET_META_DATA
            )
            val metaData = appInfo.metaData ?: return defaultValue
            if (!metaData.containsKey(key)) return defaultValue

            val raw = metaData.get(key)
            when (raw) {
                is Boolean -> raw
                is String -> raw.equals("true", ignoreCase = true)
                is Int -> raw != 0
                else -> defaultValue
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read meta-data '$key': ${e.message}")
            defaultValue
        }
    }

    /**
     * Request unlock screen (for secure mode)
     */
    private fun requestUnlockScreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val keyguardManager = activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                
                Log.d(TAG, "🔓 Requesting keyguard dismiss...")
                keyguardManager.requestDismissKeyguard(activity, object : KeyguardManager.KeyguardDismissCallback() {
                    override fun onDismissSucceeded() {
                        Log.d(TAG, "✅ Keyguard dismissed - app now accessible")
                        // App is now unlocked and accessible
                    }
                    
                    override fun onDismissError() {
                        Log.d(TAG, "❌ Keyguard dismiss failed")
                        // User might need to unlock manually
                    }
                    
                    override fun onDismissCancelled() {
                        Log.d(TAG, "🚫 Keyguard dismiss cancelled by user")
                        // User cancelled unlock
                    }
                })
            } else {
                Log.d(TAG, "⚠️ Keyguard dismiss not available on this Android version")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to request unlock", e)
        }
    }

    /**
     * Request unlock for interaction (high security mode)
     */
    private fun requestUnlockForInteraction() {
        try {
            // In high security mode, we show the app over lock screen but
            // still require unlock for any interaction (answer/decline buttons)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val keyguardManager = activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                
                Log.d(TAG, "🔐 High security: App visible but requiring unlock for interaction...")
                
                // Don't auto-dismiss keyguard, let user see the call but require unlock to interact
                // This creates a "preview mode" - user can see caller info but must unlock to answer
                if (keyguardManager.isKeyguardLocked) {
                    Log.d(TAG, "🔒 Device locked - user must unlock to interact with call")
                    // The IncomingCallActivity will handle showing over lock screen
                    // But MainActivity (main app) will require unlock for full interaction
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to setup high security mode", e)
        }
    }

    /**
     * Data class for app configuration
     */
    data class CallxAppConfig(
        val showOverLockscreen: Boolean = true,
        val requireUnlock: Boolean = false
    )
} 