package com.bearblock.example.callx

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import org.json.JSONObject
import java.io.IOException
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "CallxExample"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Handle call answer from locked screen
    handleCallAnswer()
  }

  override fun onNewIntent(intent: android.content.Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleCallAnswer()
  }

  private fun handleCallAnswer() {
    intent?.let { intent ->
      val fromIncomingCall = intent.getBooleanExtra("from_incoming_call", false)
      val deviceWasLocked = intent.getBooleanExtra("device_was_locked", false)
      
      if (fromIncomingCall && deviceWasLocked) {
        Log.d("MainActivity", "🚀 App launched from locked screen call answer")
        
        // Check configuration to decide lock screen behavior
        val config = loadCallxConfig()
        
        when {
          config.showOverLockscreen && config.requireUnlock -> {
            // 🔐 HIGH SECURITY MODE: Show over lock screen but require unlock to interact
            Log.d("MainActivity", "🔐 High security mode: Show over lock screen + require unlock")
            enableShowOverLockscreen()
            requestUnlockForInteraction()
          }
          config.showOverLockscreen && !config.requireUnlock -> {
            // 🔓 STANDARD MODE: Show over lock screen, allow immediate interaction
            Log.d("MainActivity", "🔓 Standard mode: Show over lock screen")
            enableShowOverLockscreen()
          }
          !config.showOverLockscreen && config.requireUnlock -> {
            // 🔒 SECURE MODE: Don't show over lock screen, require unlock first
            Log.d("MainActivity", "🔒 Secure mode: Require unlock first")
            requestUnlockScreen()
          }
          else -> {
            // 📱 MINIMAL MODE: Don't show over lock screen, no special unlock requirement
            Log.d("MainActivity", "📱 Minimal mode: Standard behavior")
            // Do nothing special - standard app behavior
          }
        }
      }
    }
  }

  private fun enableShowOverLockscreen() {
    try {
      Log.d("MainActivity", "🔓 Enabling show over lock screen...")
      
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
      } else {
        @Suppress("DEPRECATION")
        window.addFlags(
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )
      }
      
      Log.d("MainActivity", "✅ Show over lock screen enabled")
    } catch (e: Exception) {
      Log.e("MainActivity", "❌ Failed to enable show over lock screen", e)
    }
  }

  private fun loadCallxConfig(): CallxAppConfig {
    return try {
      val inputStream = assets.open("callx.json")
      val jsonString = inputStream.bufferedReader().use { it.readText() }
      inputStream.close()
      
      val jsonConfig = JSONObject(jsonString)
      if (jsonConfig.has("app")) {
        val appConfig = jsonConfig.getJSONObject("app")
        CallxAppConfig(
          showOverLockscreen = appConfig.optBoolean("showOverLockscreen", true),
          requireUnlock = appConfig.optBoolean("requireUnlock", false)
        )
      } else {
        CallxAppConfig() // Default config
      }
    } catch (e: IOException) {
      Log.w("MainActivity", "callx.json not found, using default config")
      CallxAppConfig() // Default config
    } catch (e: Exception) {
      Log.e("MainActivity", "Failed to load callx.json: ${e.message}")
      CallxAppConfig() // Default config
    }
  }

  private fun requestUnlockScreen() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        
        Log.d("MainActivity", "🔓 Requesting keyguard dismiss...")
        keyguardManager.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() {
            Log.d("MainActivity", "✅ Keyguard dismissed - app now accessible")
            // App is now unlocked and accessible
          }
          
          override fun onDismissError() {
            Log.d("MainActivity", "❌ Keyguard dismiss failed")
            // User might need to unlock manually
          }
          
          override fun onDismissCancelled() {
            Log.d("MainActivity", "🚫 Keyguard dismiss cancelled by user")
            // User cancelled unlock
          }
        })
      } else {
        Log.d("MainActivity", "⚠️ Keyguard dismiss not available on this Android version")
      }
    } catch (e: Exception) {
      Log.e("MainActivity", "❌ Failed to request unlock", e)
    }
  }

  private fun requestUnlockForInteraction() {
    try {
      // In high security mode, we show the app over lock screen but
      // still require unlock for any interaction (answer/decline buttons)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        
        Log.d("MainActivity", "🔐 High security: App visible but requiring unlock for interaction...")
        
        // Don't auto-dismiss keyguard, let user see the call but require unlock to interact
        // This creates a "preview mode" - user can see caller info but must unlock to answer
        if (keyguardManager.isKeyguardLocked) {
          Log.d("MainActivity", "🔒 Device locked - user must unlock to interact with call")
          // The IncomingCallActivity will handle showing over lock screen
          // But MainActivity (main app) will require unlock for full interaction
        }
      }
    } catch (e: Exception) {
      Log.e("MainActivity", "❌ Failed to setup high security mode", e)
    }
  }

  // Data class for app configuration
  data class CallxAppConfig(
    val showOverLockscreen: Boolean = true,
    val requireUnlock: Boolean = false
  )
} 