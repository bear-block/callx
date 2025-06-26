package com.callx

import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import org.json.JSONException

// Data classes
data class CallData(
    val callId: String,
    val callerName: String,
    val callerPhone: String,
    val callerAvatar: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

data class TriggerConfig(
    val field: String,
    val value: String
)

data class FieldConfig(
    val field: String,
    val fallback: String? = null
)

data class NotificationConfig(
    val channelId: String = "callx_incoming_calls",
    val channelName: String = "Incoming Calls",
    val channelDescription: String = "Notifications for incoming calls",
    val importance: String = "high",
    val sound: String = "default"
)

data class CallxConfiguration(
    val triggers: Map<String, TriggerConfig> = mapOf(
        "incoming" to TriggerConfig("data.type", "call.started"),
        "ended" to TriggerConfig("data.type", "call.ended"),
        "missed" to TriggerConfig("data.type", "call.missed")
    ),
    val fields: Map<String, FieldConfig> = mapOf(
        "callId" to FieldConfig("data.callId", "unknown-call"),
        "callerName" to FieldConfig("data.callerName", "Unknown Caller"),
        "callerPhone" to FieldConfig("data.callerPhone", "No Number"),
        "callerAvatar" to FieldConfig("data.callerAvatar", null)
    ),
    val notification: NotificationConfig = NotificationConfig()
)

@ReactModule(name = CallxModule.NAME)
class CallxModule(reactContext: ReactApplicationContext) :
  NativeCallxSpec(reactContext) {

  private var configuration: CallxConfiguration = CallxConfiguration()
  private var currentCall: CallData? = null
  private var isInitialized: Boolean = false
  private val notificationManager: NotificationManager by lazy {
    reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  }

  companion object {
    const val NAME = "Callx"
    const val CHANNEL_ID = "callx_incoming_calls"
    const val NOTIFICATION_ID = 1001
    private var moduleInstance: CallxModule? = null

    // Static methods for activity callbacks
    fun onCallAnswered(callId: String, callerName: String) {
      moduleInstance?.handleCallAnswered(callId, callerName)
    }

    fun onCallDeclined(callId: String, callerName: String) {
      moduleInstance?.handleCallDeclined(callId, callerName)
    }
  }

  init {
    moduleInstance = this
    createNotificationChannel()
  }

  override fun getName(): String {
    return NAME
  }

  // Configuration methods
  override fun initialize(config: ReadableMap?, promise: Promise) {
    try {
      android.util.Log.d(NAME, "🚀 Initializing Callx with config: $config")
      if (config != null) {
        configuration = parseConfiguration(config)
        android.util.Log.d(NAME, "🔧 Configuration loaded:")
        android.util.Log.d(NAME, "   - Triggers: ${configuration.triggers}")
        android.util.Log.d(NAME, "   - Fields: ${configuration.fields}")
      }
      isInitialized = true
      android.util.Log.d(NAME, "✅ Callx initialized successfully")
      promise.resolve(null)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "❌ Initialization failed", e)
      promise.reject("INITIALIZATION_ERROR", "Failed to initialize Callx: ${e.message}", e)
    }
  }

  // Call management methods
  override fun showIncomingCall(callData: ReadableMap, promise: Promise) {
    try {
      if (!isInitialized) {
        promise.reject("NOT_INITIALIZED", "Callx is not initialized. Call initialize() first.")
        return
      }

      val call = parseCallData(callData)
      currentCall = call
      
      // Show incoming call activity
      showIncomingCallActivity(call)
      
      // Send event to JS
      sendEventToJS("onIncomingCall", callDataToWritableMap(call))
      
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SHOW_CALL_ERROR", "Failed to show incoming call: ${e.message}", e)
    }
  }

  override fun endCall(callId: String, promise: Promise) {
    try {
      if (currentCall?.callId == callId) {
        currentCall = null
        // TODO: Dismiss notification/activity
        dismissIncomingCall()
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("END_CALL_ERROR", "Failed to end call: ${e.message}", e)
    }
  }

  override fun answerCall(callId: String, promise: Promise) {
    try {
      if (currentCall?.callId == callId) {
        handleAnswerCall(currentCall!!)
        currentCall = null
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ANSWER_CALL_ERROR", "Failed to answer call: ${e.message}", e)
    }
  }

  override fun declineCall(callId: String, promise: Promise) {
    try {
      if (currentCall?.callId == callId) {
        handleDeclineCall(currentCall!!)
        currentCall = null
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("DECLINE_CALL_ERROR", "Failed to decline call: ${e.message}", e)
    }
  }

  // FCM handling - changed parameter type to Object
  override fun handleFcmMessage(data: ReadableMap, promise: Promise) {
    try {
      android.util.Log.d(NAME, "🔥 handleFcmMessage called with data: $data")
      
      val fcmData = readableMapToJson(data)
      android.util.Log.d(NAME, "📊 FCM JSON data: $fcmData")
      
      val callData = extractCallDataFromFcm(fcmData)
      android.util.Log.d(NAME, "📞 Extracted call data: $callData")
      
      if (callData != null) {
        val triggerType = detectTriggerType(fcmData)
        android.util.Log.d(NAME, "🎯 Detected trigger type: $triggerType")
        
        when (triggerType) {
          "incoming" -> {
            android.util.Log.d(NAME, "📲 Processing incoming call trigger")
            currentCall = callData
            showIncomingCallActivity(callData)
            sendEventToJS("onIncomingCall", callDataToWritableMap(callData))
          }
          "ended" -> {
            android.util.Log.d(NAME, "📵 Processing call ended trigger")
            currentCall = null
            dismissIncomingCall()
            sendEventToJS("onCallEnded", callDataToWritableMap(callData))
          }
          "missed" -> {
            android.util.Log.d(NAME, "📵 Processing call missed trigger")
            currentCall = null
            sendEventToJS("onCallMissed", callDataToWritableMap(callData))
          }
          null -> {
            android.util.Log.w(NAME, "⚠️ No trigger detected for FCM data")
          }
          else -> {
            android.util.Log.w(NAME, "⚠️ Unknown trigger type: $triggerType")
          }
        }
      } else {
        android.util.Log.w(NAME, "⚠️ Could not extract call data from FCM")
      }
      
      promise.resolve(null)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "❌ FCM handle error", e)
      promise.reject("FCM_HANDLE_ERROR", "Failed to handle FCM message: ${e.message}", e)
    }
  }

  // Configuration setters
  override fun setFieldMapping(field: String, path: String, fallback: String?, promise: Promise) {
    try {
      val newFields = configuration.fields.toMutableMap()
      newFields[field] = FieldConfig(path, fallback)
      configuration = configuration.copy(fields = newFields)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_FIELD_ERROR", "Failed to set field mapping: ${e.message}", e)
    }
  }

  override fun setTrigger(trigger: String, field: String, value: String, promise: Promise) {
    try {
      val newTriggers = configuration.triggers.toMutableMap()
      newTriggers[trigger] = TriggerConfig(field, value)
      configuration = configuration.copy(triggers = newTriggers)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_TRIGGER_ERROR", "Failed to set trigger: ${e.message}", e)
    }
  }

  // Status methods
  override fun getCurrentCall(promise: Promise) {
    try {
      val result = currentCall?.let { callDataToWritableMap(it) }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("GET_CALL_ERROR", "Failed to get current call: ${e.message}", e)
    }
  }

  override fun isCallActive(promise: Promise) {
    try {
      promise.resolve(currentCall != null)
    } catch (e: Exception) {
      promise.reject("IS_ACTIVE_ERROR", "Failed to check call status: ${e.message}", e)
    }
  }

  // Legacy method for testing
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  // Private helper methods
  private fun parseConfiguration(config: ReadableMap): CallxConfiguration {
    try {
      android.util.Log.d(NAME, "🔧 Parsing configuration from ReadableMap")
      
      // Parse triggers
      val triggers = mutableMapOf<String, TriggerConfig>()
      if (config.hasKey("triggers") && config.getMap("triggers") != null) {
        val triggersMap = config.getMap("triggers")!!
        val iterator = triggersMap.keySetIterator()
        while (iterator.hasNextKey()) {
          val triggerName = iterator.nextKey()
          val triggerData = triggersMap.getMap(triggerName)
          if (triggerData != null) {
            val field = triggerData.getString("field") ?: ""
            val value = triggerData.getString("value") ?: ""
            triggers[triggerName] = TriggerConfig(field, value)
            android.util.Log.d(NAME, "   - Trigger '$triggerName': field='$field', value='$value'")
          }
        }
      }
      
      // Parse fields
      val fields = mutableMapOf<String, FieldConfig>()
      if (config.hasKey("fields") && config.getMap("fields") != null) {
        val fieldsMap = config.getMap("fields")!!
        val iterator = fieldsMap.keySetIterator()
        while (iterator.hasNextKey()) {
          val fieldName = iterator.nextKey()
          val fieldData = fieldsMap.getMap(fieldName)
          if (fieldData != null) {
            val field = fieldData.getString("field") ?: ""
            val fallback = fieldData.getString("fallback")
            fields[fieldName] = FieldConfig(field, fallback)
            android.util.Log.d(NAME, "   - Field '$fieldName': field='$field', fallback='$fallback'")
          }
        }
      }
      
      // Parse notification config (use defaults for now)
      val notification = NotificationConfig()
      
      val result = CallxConfiguration(
        triggers = triggers.ifEmpty { CallxConfiguration().triggers },
        fields = fields.ifEmpty { CallxConfiguration().fields },
        notification = notification
      )
      
      android.util.Log.d(NAME, "✅ Configuration parsed successfully")
      return result
    } catch (e: Exception) {
      android.util.Log.e(NAME, "❌ Error parsing configuration, using defaults", e)
      return CallxConfiguration()
    }
  }

  private fun parseCallData(data: ReadableMap): CallData {
    return CallData(
      callId = data.getString("callId") ?: "unknown-call",
      callerName = data.getString("callerName") ?: "Unknown Caller",
      callerPhone = data.getString("callerPhone") ?: "No Number",
      callerAvatar = data.getString("callerAvatar"),
      timestamp = if (data.hasKey("timestamp")) data.getDouble("timestamp").toLong() else System.currentTimeMillis()
    )
  }

  private fun callDataToWritableMap(callData: CallData): WritableMap {
    val map = Arguments.createMap()
    map.putString("callId", callData.callId)
    map.putString("callerName", callData.callerName)
    map.putString("callerPhone", callData.callerPhone)
    callData.callerAvatar?.let { map.putString("callerAvatar", it) }
    map.putDouble("timestamp", callData.timestamp.toDouble())
    return map
  }

  private fun readableMapToJson(readableMap: ReadableMap): JSONObject {
    val json = JSONObject()
    try {
      val iterator = readableMap.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        val value = readableMap.getType(key)
        when (value) {
          com.facebook.react.bridge.ReadableType.String -> {
            json.put(key, readableMap.getString(key))
          }
          com.facebook.react.bridge.ReadableType.Number -> {
            json.put(key, readableMap.getDouble(key))
          }
          com.facebook.react.bridge.ReadableType.Boolean -> {
            json.put(key, readableMap.getBoolean(key))
          }
          com.facebook.react.bridge.ReadableType.Map -> {
            readableMap.getMap(key)?.let { nestedMap ->
              json.put(key, readableMapToJson(nestedMap))
            }
          }
          else -> {
            // Skip arrays and null for now
          }
        }
      }
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Error converting ReadableMap to JSON", e)
    }
    return json
  }

  private fun extractCallDataFromFcm(fcmData: JSONObject): CallData? {
    try {
      // Extract call data using field configuration
      val callId = getFieldFromJson(fcmData, configuration.fields["callId"]) ?: "unknown-call"
      val callerName = getFieldFromJson(fcmData, configuration.fields["callerName"]) ?: "Unknown Caller"
      val callerPhone = getFieldFromJson(fcmData, configuration.fields["callerPhone"]) ?: "No Number"
      val callerAvatar = getFieldFromJson(fcmData, configuration.fields["callerAvatar"])
      
      return CallData(
        callId = callId,
        callerName = callerName,
        callerPhone = callerPhone,
        callerAvatar = callerAvatar,
        timestamp = System.currentTimeMillis()
      )
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Error extracting call data from FCM", e)
      return null
    }
  }

  private fun detectTriggerType(fcmData: JSONObject): String? {
    try {
      android.util.Log.d(NAME, "🔍 Detecting trigger type from FCM data")
      for ((triggerName, triggerConfig) in configuration.triggers) {
        val fieldValue = getFieldFromJson(fcmData, FieldConfig(triggerConfig.field))
        android.util.Log.d(NAME, "🎯 Checking trigger '$triggerName': field='${triggerConfig.field}', expected='${triggerConfig.value}', actual='$fieldValue'")
        if (fieldValue == triggerConfig.value) {
          android.util.Log.d(NAME, "✅ Trigger matched: $triggerName")
          return triggerName
        }
      }
      android.util.Log.w(NAME, "⚠️ No triggers matched")
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Error detecting trigger type", e)
    }
    return null
  }

  private fun getFieldFromJson(json: JSONObject, fieldConfig: FieldConfig?): String? {
    if (fieldConfig == null) return null
    
    try {
      android.util.Log.d(NAME, "🔍 Getting field '${fieldConfig.field}' from JSON: $json")
      
      val fieldPath = fieldConfig.field.split(".")
      var current: Any? = json
      
      for (pathSegment in fieldPath) {
        android.util.Log.d(NAME, "🔍 Processing path segment: '$pathSegment', current type: ${current?.javaClass?.simpleName}")
        when (current) {
          is JSONObject -> {
            android.util.Log.d(NAME, "🔍 JSON has keys: ${current.keys().asSequence().toList()}")
            current = if (current.has(pathSegment)) {
              val value = current.get(pathSegment)
              android.util.Log.d(NAME, "🔍 Found '$pathSegment' = $value")
              value
            } else {
              android.util.Log.d(NAME, "🔍 '$pathSegment' not found in JSON")
              null
            }
          }
          else -> {
            android.util.Log.d(NAME, "🔍 Current is not JSONObject, breaking")
            current = null
            break
          }
        }
      }
      
      val result = current?.toString() ?: fieldConfig.fallback
      android.util.Log.d(NAME, "🔍 Final result for '${fieldConfig.field}': '$result'")
      return result
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Error getting field from JSON: ${fieldConfig.field}", e)
      return fieldConfig.fallback
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        configuration.notification.channelName,
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = configuration.notification.channelDescription
        setShowBadge(true)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
      }
      notificationManager.createNotificationChannel(channel)
      android.util.Log.d(NAME, "Notification channel created: $CHANNEL_ID")
    }
  }

  private fun showIncomingCallActivity(callData: CallData) {
    try {
      val context = reactApplicationContext
      
      // Create full screen intent
      val fullScreenIntent = IncomingCallActivity.createIntent(
        context,
        callData.callId,
        callData.callerName,
        callData.callerPhone,
        callData.callerAvatar
      )
      
      val fullScreenPendingIntent = PendingIntent.getActivity(
        context,
        0,
        fullScreenIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Create answer intent
      val answerIntent = Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("action", "answer")
        putExtra(IncomingCallActivity.EXTRA_CALL_ID, callData.callId)
      }
      val answerPendingIntent = PendingIntent.getActivity(
        context,
        1,
        answerIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Create decline intent
      val declineIntent = Intent(context, IncomingCallActivity::class.java).apply {
        putExtra("action", "decline")
        putExtra(IncomingCallActivity.EXTRA_CALL_ID, callData.callId)
      }
      val declinePendingIntent = PendingIntent.getActivity(
        context,
        2,
        declineIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      
      // Build notification with full screen intent
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_call)
        .setContentTitle("Incoming call")
        .setContentText("${callData.callerName} is calling")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setAutoCancel(true)
        .setOngoing(true)
        .setFullScreenIntent(fullScreenPendingIntent, true)
        .setContentIntent(fullScreenPendingIntent)
        .addAction(android.R.drawable.ic_menu_call, "Answer", answerPendingIntent)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .build()
      
      // Show notification
      notificationManager.notify(NOTIFICATION_ID, notification)
      
      android.util.Log.d(NAME, "Full screen notification shown for: ${callData.callerName}")
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to show incoming call notification", e)
    }
  }

  private fun dismissIncomingCall() {
    try {
      notificationManager.cancel(NOTIFICATION_ID)
      android.util.Log.d(NAME, "Incoming call notification dismissed")
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to dismiss notification", e)
    }
  }

  private fun handleAnswerCall(callData: CallData) {
    android.util.Log.d(NAME, "Call answered: ${callData.callId}")
    sendEventToJS("onCallAnswered", callDataToWritableMap(callData))
  }

  private fun handleDeclineCall(callData: CallData) {
    android.util.Log.d(NAME, "Call declined: ${callData.callId}")
    sendEventToJS("onCallDeclined", callDataToWritableMap(callData))
  }

  // Event callbacks from activity
  private fun handleCallAnswered(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        handleAnswerCall(call)
        currentCall = null
      }
    }
  }

  private fun handleCallDeclined(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        handleDeclineCall(call)
        currentCall = null
      }
    }
  }

  private fun sendEventToJS(eventName: String, data: WritableMap?) {
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, data)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to send event to JS: $eventName", e)
    }
  }
}
