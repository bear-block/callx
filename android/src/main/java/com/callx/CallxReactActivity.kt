package com.callx

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Base ReactActivity class that includes Callx lock screen handling
 * 
 * Usage:
 * class MainActivity : CallxReactActivity() {
 *   override fun getMainComponentName(): String = "YourAppName"
 * }
 */
abstract class CallxReactActivity : ReactActivity() {

    private lateinit var callxHelper: CallxActivityHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize Callx helper
        callxHelper = CallxActivityHelper(this)
        
        // Handle call answer from locked screen
        callxHelper.handleCallAnswer()
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        
        // Handle call answer from locked screen
        callxHelper.handleCallAnswer()
    }

    /**
     * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
     * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName ?: "Unknown", fabricEnabled)
} 