package com.callx

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.util.Log
import java.lang.reflect.Method
import java.lang.reflect.Proxy

/**
 * Automatic setup for Callx without requiring class extension
 * 
 * This class automatically detects ReactActivity and adds lock screen handling
 * without requiring developers to change their existing MainActivity
 */
object CallxAutoSetup {
    
    private const val TAG = "CallxAutoSetup"
    private var isInitialized = false
    private val activityHelpers = mutableMapOf<Activity, CallxActivityHelper>()
    
    /**
     * Initialize Callx auto-setup
     * Call this in Application.onCreate()
     */
    fun initialize(application: Application) {
        if (isInitialized) return
        
        try {
            Log.d(TAG, "🚀 Initializing Callx auto-setup...")
            
            // Register activity lifecycle callback
            application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
                    setupActivityIfNeeded(activity)
                }
                
                override fun onActivityStarted(activity: Activity) {}
                override fun onActivityResumed(activity: Activity) {}
                override fun onActivityPaused(activity: Activity) {}
                override fun onActivityStopped(activity: Activity) {}
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
                override fun onActivityDestroyed(activity: Activity) {
                    activityHelpers.remove(activity)
                }
            })
            
            isInitialized = true
            Log.d(TAG, "✅ Callx auto-setup initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to initialize Callx auto-setup", e)
        }
    }
    
    /**
     * Setup activity if it's a ReactActivity
     */
    private fun setupActivityIfNeeded(activity: Activity) {
        try {
            // Check if this is a ReactActivity
            if (isReactActivity(activity)) {
                Log.d(TAG, "📱 Detected ReactActivity: ${activity.javaClass.simpleName}")
                
                // Create helper for this activity
                val helper = CallxActivityHelper(activity)
                activityHelpers[activity] = helper
                
                // Hook into onCreate and onNewIntent
                hookActivityMethods(activity, helper)
                
                Log.d(TAG, "✅ Activity setup complete: ${activity.javaClass.simpleName}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to setup activity: ${activity.javaClass.simpleName}", e)
        }
    }
    
    /**
     * Check if activity extends ReactActivity
     */
    private fun isReactActivity(activity: Activity): Boolean {
        var currentClass: Class<*>? = activity.javaClass
        while (currentClass != null) {
            if (currentClass.name == "com.facebook.react.ReactActivity") {
                return true
            }
            currentClass = currentClass.superclass
        }
        return false
    }
    
    /**
     * Hook into activity methods using reflection
     */
    private fun hookActivityMethods(activity: Activity, helper: CallxActivityHelper) {
        try {
            Log.d(TAG, "🔗 Attempting to hook activity methods for: ${activity.javaClass.simpleName}")
            
            // Store original methods for later use
            val originalOnCreate = activity.javaClass.getDeclaredMethod("onCreate", Bundle::class.java)
            val originalOnNewIntent = activity.javaClass.getDeclaredMethod("onNewIntent", android.content.Intent::class.java)
            
            // Create proxy methods that call original + our logic
            val proxyOnCreate = Proxy.newProxyInstance(
                activity.javaClass.classLoader,
                arrayOf(originalOnCreate.declaringClass)
            ) { proxy, method, args ->
                if (method.name == "onCreate") {
                    Log.d(TAG, "🔧 Intercepted onCreate for: ${activity.javaClass.simpleName}")
                    // Call original onCreate
                    originalOnCreate.invoke(activity, args)
                    // Call our logic
                    helper.handleCallAnswerFromCreate()
                } else {
                    method.invoke(activity, args)
                }
            }
            
            val proxyOnNewIntent = Proxy.newProxyInstance(
                activity.javaClass.classLoader,
                arrayOf(originalOnNewIntent.declaringClass)
            ) { proxy, method, args ->
                if (method.name == "onNewIntent") {
                    Log.d(TAG, "🔧 Intercepted onNewIntent for: ${activity.javaClass.simpleName}")
                    // Call original onNewIntent
                    originalOnNewIntent.invoke(activity, args)
                    // Call our logic with intent
                    val intent = args?.get(0) as? android.content.Intent
                    helper.handleCallAnswerWithIntent(intent)
                } else {
                    method.invoke(activity, args)
                }
            }
            
            Log.d(TAG, "✅ Activity methods hooked successfully for: ${activity.javaClass.simpleName}")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not hook activity methods (this is normal for some activities): ${e.message}")
        }
    }
    
    /**
     * Get helper for an activity
     */
    fun getHelper(activity: Activity): CallxActivityHelper? {
        return activityHelpers[activity]
    }
    
    /**
     * Manual setup for activities that can't be auto-detected
     */
    fun setupActivity(activity: Activity): CallxActivityHelper? {
        if (!isInitialized) {
            Log.w(TAG, "⚠️ CallxAutoSetup not initialized. Call initialize() first.")
            return null
        }
        
        return try {
            if (isReactActivity(activity)) {
                val helper = CallxActivityHelper(activity)
                activityHelpers[activity] = helper
                Log.d(TAG, "✅ Manual activity setup complete: ${activity.javaClass.simpleName}")
                helper
            } else {
                Log.d(TAG, "ℹ️ Activity is not a ReactActivity: ${activity.javaClass.simpleName}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to setup activity: ${activity.javaClass.simpleName}", e)
            null
        }
    }
} 