package com.callx

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.IOException

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
        
        // TODO: Send token to your server if needed
        // You can also notify JS layer if app is active
    }

    private fun loadConfigurationFromAssets(): CallxConfiguration? {
        return try {
            val inputStream = assets.open("callx.json")
            val jsonString = inputStream.bufferedReader().use { it.readText() }
            inputStream.close()
            
            val jsonConfig = JSONObject(jsonString)
            parseJsonConfiguration(jsonConfig)
        } catch (e: IOException) {
            Log.w(TAG, "callx.json not found in assets")
            null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load configuration: ${e.message}")
            null
        }
    }

    private fun parseJsonConfiguration(json: JSONObject): CallxConfiguration {
        val triggers = mutableMapOf<String, TriggerConfig>()
        val fields = mutableMapOf<String, FieldConfig>()
        
        // Parse triggers
        if (json.has("triggers")) {
            val triggersJson = json.getJSONObject("triggers")
            triggersJson.keys().forEach { triggerName ->
                val triggerData = triggersJson.getJSONObject(triggerName)
                val field = triggerData.getString("field")
                val value = triggerData.getString("value")
                triggers[triggerName] = TriggerConfig(field, value)
            }
        }
        
        // Parse fields
        if (json.has("fields")) {
            val fieldsJson = json.getJSONObject("fields")
            fieldsJson.keys().forEach { fieldName ->
                val fieldData = fieldsJson.getJSONObject(fieldName)
                val field = fieldData.getString("field")
                val fallback = if (fieldData.has("fallback")) fieldData.getString("fallback") else null
                fields[fieldName] = FieldConfig(field, fallback)
            }
        }
        
        // Parse notification config
        val notificationConfig = if (json.has("notification")) {
            val notificationJson = json.getJSONObject("notification")
            NotificationConfig(
                channelId = notificationJson.optString("channelId", "callx_incoming_calls"),
                channelName = notificationJson.optString("channelName", "Incoming Calls"),
                channelDescription = notificationJson.optString("channelDescription", "Notifications for incoming calls"),
                importance = notificationJson.optString("importance", "high"),
                sound = notificationJson.optString("sound", "default")
            )
        } else {
            NotificationConfig()
        }
        
        return CallxConfiguration(
            triggers = triggers.ifEmpty { CallxConfiguration().triggers },
            fields = fields.ifEmpty { CallxConfiguration().fields },
            notification = notificationConfig
        )
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
            val callId = getFieldFromJson(fcmData, config.fields["callId"]) ?: "unknown-call"
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
} 