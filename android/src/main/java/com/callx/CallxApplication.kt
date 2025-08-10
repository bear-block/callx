package com.callx

import android.app.Application
import android.util.Log

/**
 * Application class that automatically initializes Callx
 * 
 * Usage: Extend this class in your Application instead of Application
 * 
 * Example:
 * class MyApplication : CallxApplication() {
 *   // Your custom initialization here
 * }
 */
open class CallxApplication : Application() {
    
    companion object {
        private const val TAG = "CallxApplication"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        try {
            Log.d(TAG, "🚀 Initializing Callx...")
            
            // Initialize auto-setup
            CallxAutoSetup.initialize(this)
            
            Log.d(TAG, "✅ Callx initialization complete")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to initialize Callx", e)
        }
    }
} 