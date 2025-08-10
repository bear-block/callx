package com.callx

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/**
 * Native Firebase Messaging Service
 * Handles FCM messages directly in native code without JS bundle
 */
class CallxFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "CallxFCMService"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
                Log.d(TAG, "FCM message received in native service")
        Log.d(TAG, "From: ${remoteMessage.from}")
        
        try {
            // Convert FCM data to JSON
            val fcmData = JSONObject()
            for ((key, value) in remoteMessage.data) {
                fcmData.put(key, value)
            }
            
            // Load configuration and process message
            val config = loadConfigurationFromAssets()
            if (config != null) {
                processFcmMessage(fcmData, config)
            } else {
                Log.w(TAG, "No configuration available, skipping FCM processing")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error processing FCM message", e)
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "📱 New FCM token: $token")
        
        // Send token to JS layer through CallxModule if available
        try {
            val callxModule = CallxModule.getInstance()
            if (callxModule != null) {
                // CallxModule will handle sending to JS layer
                Log.d(TAG, "📱 FCM token will be available through CallxModule")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send FCM token to JS layer: ${e.message}")
        }
    }

    private fun loadConfigurationFromAssets(): CallxConfiguration? {
        return try {
            val inputStream = assets.open("callx.json")
            val size = inputStream.available()
            val buffer = ByteArray(size)
            inputStream.read(buffer)
            inputStream.close()
            
            val jsonString = String(buffer, Charsets.UTF_8)
            val jsonObject = JSONObject(jsonString)
            
            parseConfigurationFromJson(jsonObject)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load configuration from assets", e)
            null
        }
    }

    private fun parseConfigurationFromJson(json: JSONObject): CallxConfiguration {
        return try {
                            val appConfig = json.optJSONObject("app")?.let { appJson ->
                    AppConfig(
                        packageName = appJson.optString("packageName", "").ifEmpty { detectAppPackageName(context) },
                        mainActivity = appJson.optString("mainActivity", "").ifEmpty { detectMainActivity(context) },
                        showOverLockscreen = appJson.optBoolean("showOverLockscreen", true),
                        requireUnlock = appJson.optBoolean("requireUnlock", false),
                        supportsVideo = appJson.optBoolean("supportsVideo", false)
                    )
                } ?: AppConfig(
                    packageName = detectAppPackageName(context),
                    mainActivity = detectMainActivity(context)
                )

            val triggers = json.optJSONObject("triggers")?.let { triggersJson ->
                val triggersMap = mutableMapOf<String, TriggerConfig>()
                val keys = triggersJson.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val triggerJson = triggersJson.getJSONObject(key)
                    triggersMap[key] = TriggerConfig(
                        field = triggerJson.optString("field", ""),
                        value = triggerJson.optString("value", "")
                    )
                }
                triggersMap
            } ?: mapOf(
                "incoming" to TriggerConfig("data.type", "call.started"),
                "ended" to TriggerConfig("data.type", "call.ended"),
                "missed" to TriggerConfig("data.type", "call.missed"),
                "answered_elsewhere" to TriggerConfig("data.type", "call.answered_elsewhere")
            )

            val fields = json.optJSONObject("fields")?.let { fieldsJson ->
                val fieldsMap = mutableMapOf<String, FieldConfig>()
                val keys = fieldsJson.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val fieldJson = fieldsJson.getJSONObject(key)
                    fieldsMap[key] = FieldConfig(
                        field = fieldJson.optString("field", ""),
                        fallback = fieldJson.optString("fallback", null)
                    )
                }
                fieldsMap
            } ?: mapOf(
                "callId" to FieldConfig("data.callId", null),
                "callerName" to FieldConfig("data.callerName", "Unknown Caller"),
                "callerPhone" to FieldConfig("data.callerPhone", "No Number"),
                "callerAvatar" to FieldConfig("data.callerAvatar", null),
                "hasVideo" to FieldConfig("data.hasVideo", "false")
            )

            val notificationConfig = NotificationConfig(
                channelId = "callx_incoming_calls",
                channelName = "Incoming Calls",
                channelDescription = "Incoming call notifications with ringtone",
                importance = "high",
                sound = "default"
            )

            // Parse enabledLogPhoneCall from root level
            val enabledLogPhoneCall = json.optBoolean("enabledLogPhoneCall", true)
            val callLoggingConfig = CallLoggingConfig(enabledLogPhoneCall = enabledLogPhoneCall)

            CallxConfiguration(
                app = appConfig,
                triggers = triggers,
                fields = fields,
                notification = notificationConfig,
                callLogging = callLoggingConfig
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse configuration JSON, using defaults", e)
            CallxConfiguration()
        }
    }

    private fun processFcmMessage(fcmData: JSONObject, config: CallxConfiguration) {
        Log.d(TAG, "Processing FCM data")
        
        val callData = extractCallDataFromFcm(fcmData, config)
        if (callData != null) {
            val triggerType = detectTriggerType(fcmData, config)
            Log.d(TAG, "Detected trigger: $triggerType")
            
            when (triggerType) {
                "incoming" -> {
                    Log.d(TAG, "Showing incoming call notification")
                    showIncomingCallNotification(callData, config)
                }
                "ended" -> {
                    Log.d(TAG, "Dismissing call notification")
                    dismissIncomingCallNotification()
                }
                "missed" -> {
                    Log.d(TAG, "Handling missed call")
                    // Could show missed call notification
                }
                else -> {
                    Log.w(TAG, "Unknown trigger type: $triggerType")
                }
            }
        } else {
            Log.w(TAG, "Could not extract call data from FCM")
        }
    }

    private fun extractCallDataFromFcm(fcmData: JSONObject, config: CallxConfiguration): CallData? {
        return try {
            val callId = getFieldFromJson(fcmData, config.fields["callId"]) ?: generateUUID()
            val callerName = getFieldFromJson(fcmData, config.fields["callerName"]) ?: "Unknown Caller"
            val callerPhone = getFieldFromJson(fcmData, config.fields["callerPhone"]) ?: "No Number"
            val callerAvatar = getFieldFromJson(fcmData, config.fields["callerAvatar"])
            
            CallData(
                callId = callId,
                callerName = callerName,
                callerPhone = callerPhone,
                callerAvatar = callerAvatar,
                timestamp = System.currentTimeMillis()
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error extracting call data", e)
            null
        }
    }

    private fun detectTriggerType(fcmData: JSONObject, config: CallxConfiguration): String? {
        return try {
            for ((triggerName, triggerConfig) in config.triggers) {
                val fieldValue = getFieldFromJson(fcmData, FieldConfig(triggerConfig.field))
                if (fieldValue == triggerConfig.value) {
                    return triggerName
                }
            }
            null
        } catch (e: Exception) {
            null
        }
    }

    private fun getFieldFromJson(json: JSONObject, fieldConfig: FieldConfig?): String? {
        if (fieldConfig == null) return null
        
        return try {
            val fieldPath = fieldConfig.field.split(".")
            var current: Any? = json
            
            for (pathSegment in fieldPath) {
                current = when (current) {
                    is JSONObject -> if (current.has(pathSegment)) current.get(pathSegment) else null
                    else -> null
                }
                if (current == null) break
            }
            
            current?.toString() ?: fieldConfig.fallback
        } catch (e: Exception) {
            fieldConfig.fallback
        }
    }

    private fun showIncomingCallNotification(callData: CallData, config: CallxConfiguration) {
        // Use CallxModule's existing notification logic
        // Or implement a simplified version here
        val callxModule = CallxModule.getInstance()
        callxModule?.showIncomingCallFromService(callData)
    }

    private fun dismissIncomingCallNotification() {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(CallxModule.NOTIFICATION_ID)
    }

    private fun generateUUID(): String {
        return UUID.randomUUID().toString()
    }

            private fun detectAppPackageName(context: Context): String {
            return try {
                // Use application context to get the main app's package name
                val appContext = context.applicationContext
                val appPackageName = appContext.packageName
                Log.d(TAG, "🔍 Auto-detected App Package: $appPackageName")
                appPackageName
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error detecting App Package: ${e.message}")
                // Fallback to module package name if detection fails
                context.packageName
            }
        }

        private fun detectMainActivity(context: Context): String {
            return try {
                val packageManager = context.packageManager
                val appPackageName = detectAppPackageName(context)
                val launchIntent = packageManager.getLaunchIntentForPackage(appPackageName)
                
                if (launchIntent != null && launchIntent.component != null) {
                    val fullClassName = launchIntent.component!!.className
                    val activityName = fullClassName.substringAfterLast(".")
                    Log.d(TAG, "🔍 Auto-detected MainActivity: $activityName for package: $appPackageName")
                    activityName
                } else {
                    Log.w(TAG, "⚠️ Could not detect MainActivity for package: $appPackageName, using default")
                    "MainActivity"
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error detecting MainActivity: ${e.message}")
                "MainActivity"
            }
        }
} 