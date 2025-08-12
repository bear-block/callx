package com.callx

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import android.content.Intent
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
            
            // Load configuration from AndroidManifest meta-data and process message
            val config = loadConfigurationFromManifest()
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

    private fun loadConfigurationFromManifest(): CallxConfiguration? {
        return try {
            val pm = applicationContext.packageManager
            val appInfo = pm.getApplicationInfo(applicationContext.packageName, android.content.pm.PackageManager.GET_META_DATA)
            val meta = appInfo.metaData ?: return CallxConfiguration()

            fun readMetaString(key: String): String? = try { meta.getString(key) } catch (_: Exception) { null }
            fun readMetaBoolean(key: String, default: Boolean): Boolean {
                return try {
                    val value = meta.get(key)
                    when (value) {
                        is Boolean -> value
                        is String -> value.equals("true", true) || value == "1"
                        is Int -> value != 0
                        else -> default
                    }
                } catch (_: Exception) { default }
            }

            // Triggers: shorthand only
            val triggers = mutableMapOf<String, TriggerConfig>()
            val triggerKeys = listOf("incoming", "ended", "missed", "answered_elsewhere")
            for (key in triggerKeys) {
                val compact = readMetaString(key)
                if (!compact.isNullOrEmpty() && ":" in compact) {
                    val idx = compact.indexOf(":")
                    val field = compact.substring(0, idx).trim()
                    val value = compact.substring(idx + 1).trim()
                    if (field.isNotEmpty() && value.isNotEmpty()) {
                        triggers[key] = TriggerConfig(field, value)
                    }
                }
            }

            // Fields: shorthand only
            val fields = mutableMapOf<String, FieldConfig>()
            val fieldKeys = listOf("callId", "callerName", "callerPhone", "callerAvatar", "hasVideo")
            for (key in fieldKeys) {
                val compact = readMetaString(key)
                if (!compact.isNullOrEmpty()) {
                    val parts = compact.split(":", limit = 2)
                    val path = parts.getOrNull(0)?.trim().orEmpty()
                    val fallback = parts.getOrNull(1)?.trim()
                    if (path.isNotEmpty()) fields[key] = FieldConfig(path, fallback)
                }
            }

            val showOverLockscreen = readMetaBoolean("showOverLockscreen", true)
            val requireUnlock = readMetaBoolean("requireUnlock", false)
            val supportsVideo = readMetaBoolean("supportsVideo", false)
            val enabledLogPhoneCall = readMetaBoolean("enabledLogPhoneCall", true)

            CallxConfiguration(
                app = AppConfig(
                    showOverLockscreen = showOverLockscreen,
                    requireUnlock = requireUnlock,
                    supportsVideo = supportsVideo,
                    enabledLogPhoneCall = enabledLogPhoneCall
                ),
                triggers = if (triggers.isNotEmpty()) triggers else CallxConfiguration().triggers,
                fields = if (fields.isNotEmpty()) fields else CallxConfiguration().fields,
                notification = NotificationConfig(
                    channelId = "callx_incoming_calls_v2",
                    channelName = "Incoming Calls",
                    channelDescription = "Incoming call notifications with ringtone",
                    importance = "high",
                    sound = "default"
                )
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load config from manifest: ${e.message}")
            CallxConfiguration()
        }
    }

    // Removed JSON config parsing: we no longer support callx.json. Config comes from AndroidManifest meta-data only.

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
                    Log.d(TAG, "Handling call ended")
                    dismissIncomingCallNotification()
                    val module = CallxModule.getInstance()
                    if (module != null) {
                        module.notifyEndedFromService(callData)
                    } else {
                        try {
                            CallxStorage.savePendingAction(applicationContext, "end", callData)
                        } catch (_: Exception) {}
                    }
                }
                "missed" -> {
                    Log.d(TAG, "Handling missed call")
                    val module = CallxModule.getInstance()
                    if (module != null) {
                        try {
                            val closeIntent = Intent(applicationContext, IncomingCallActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                                putExtra("action", "dismiss")
                                putExtra(IncomingCallActivity.EXTRA_CALL_ID, callData.callId)
                            }
                            applicationContext.startActivity(closeIntent)
                        } catch (_: Exception) {}
                        module.notifyMissedFromService(callData)
                    } else {
                        try {
                            CallxStorage.savePendingAction(applicationContext, "missed", callData)
                        } catch (_: Exception) {}
                    }
                }
                "answered_elsewhere" -> {
                    Log.d(TAG, "Handling answered elsewhere (close UI + JS event)")
                    // Close incoming UI
                    try {
                        val closeIntent = Intent(applicationContext, IncomingCallActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                            putExtra("action", "dismiss")
                            putExtra(IncomingCallActivity.EXTRA_CALL_ID, callData.callId)
                        }
                        applicationContext.startActivity(closeIntent)
                    } catch (_: Exception) {}
                    // Dismiss notification
                    dismissIncomingCallNotification()
                    // Emit answered_elsewhere like missed flow (close UI + send event)
                    val module = CallxModule.getInstance()
                    if (module != null) {
                        module.notifyAnsweredElsewhereFromService(callData)
                    } else {
                        try {
                            CallxStorage.savePendingAction(applicationContext, "answered_elsewhere", callData)
                        } catch (_: Exception) {}
                    }
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

        // Removed unused helpers detectAppPackageName/detectMainActivity
} 