package com.callx

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity

/**
 * Base ReactActivity that automatically handles Callx lockscreen functionality
 * 
 * Usage:
 * class MainActivity : CallxReactActivity() {
 *   override fun getMainComponentName(): String = "YourApp"
 * }
 */
abstract class CallxReactActivity : ReactActivity() {
    
    companion object {
        private const val TAG = "CallxReactActivity"
    }
    
    /**
     * Handle onCreate - check if launched from incoming call
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "📱 CallxReactActivity.onCreate called")
        
        // Check if this is from incoming call (first launch)
        val fromIncomingCall = intent?.getBooleanExtra("from_incoming_call", false) ?: false
        val deviceWasLocked = intent?.getBooleanExtra("device_was_locked", false) ?: false
        
        Log.d(TAG, "📞 onCreate - From incoming call: $fromIncomingCall, Device locked: $deviceWasLocked")
        
        if (fromIncomingCall) {
            Log.d(TAG, "🚀 Handling incoming call launch from onCreate...")
            CallxAutoSetup.getHelper(this)?.handleCallAnswerFromCreate()
        }
    }

    /**
     * Handle new intent from IncomingCallActivity
     * This is called when app is launched from lockscreen call answer
     */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        Log.d(TAG, "📱 CallxReactActivity.onNewIntent called with: ${intent?.extras}")
        
        // Check if this is from incoming call
        val fromIncomingCall = intent?.getBooleanExtra("from_incoming_call", false) ?: false
        val deviceWasLocked = intent?.getBooleanExtra("device_was_locked", false) ?: false
        
        Log.d(TAG, "📞 From incoming call: $fromIncomingCall, Device locked: $deviceWasLocked")
        
        if (fromIncomingCall) {
            Log.d(TAG, "🚀 Handling incoming call launch from onNewIntent...")
            val helper = CallxAutoSetup.getHelper(this)
            if (helper != null) {
                Log.d(TAG, "✅ CallxActivityHelper found, calling handleCallAnswerWithIntent")
                helper.handleCallAnswerWithIntent(intent)
            } else {
                Log.e(TAG, "❌ CallxActivityHelper not found! Trying manual setup...")
                CallxAutoSetup.setupActivity(this)?.handleCallAnswerWithIntent(intent)
            }
        }
    }
} 