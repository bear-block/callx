package com.callx

import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

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
      if (config != null) {
        configuration = parseConfiguration(config)
      }
      isInitialized = true
      promise.resolve(null)
    } catch (e: Exception) {
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

  override fun handleFcmMessage(data: ReadableMap, promise: Promise) {
    try {
      val fcmData = readableMapToJson(data)
      val callData = extractCallDataFromFcm(fcmData)
      
      if (callData != null) {
        val triggerType = detectTriggerType(fcmData)
        
        when (triggerType) {
          "incoming" -> {
            currentCall = callData
            showIncomingCallActivity(callData)
            sendEventToJS("onIncomingCall", callDataToWritableMap(callData))
          }
          "ended" -> {
            currentCall = null
            dismissIncomingCall()
            sendEventToJS("onCallEnded", callDataToWritableMap(callData))
          }
          "missed" -> {
            currentCall = null
            sendEventToJS("onCallMissed", callDataToWritableMap(callData))
          }
        }
      }
      
      promise.resolve(null)
    } catch (e: Exception) {
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

  // Legacy testing method - kept for backward compatibility
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  // Private helper methods
  private fun parseConfiguration(config: ReadableMap): CallxConfiguration {
    return try {
      val triggers = mutableMapOf<String, TriggerConfig>()
      val fields = mutableMapOf<String, FieldConfig>()
      
      // Parse triggers
      config.getMap("triggers")?.let { triggersMap ->
        val iterator = triggersMap.keySetIterator()
        while (iterator.hasNextKey()) {
          val triggerName = iterator.nextKey()
          triggersMap.getMap(triggerName)?.let { triggerData ->
            val field = triggerData.getString("field") ?: ""
            val value = triggerData.getString("value") ?: ""
            triggers[triggerName] = TriggerConfig(field, value)
          }
        }
      }
      
      // Parse fields
      config.getMap("fields")?.let { fieldsMap ->
        val iterator = fieldsMap.keySetIterator()
        while (iterator.hasNextKey()) {
          val fieldName = iterator.nextKey()
          fieldsMap.getMap(fieldName)?.let { fieldData ->
            val field = fieldData.getString("field") ?: ""
            val fallback = fieldData.getString("fallback")
            fields[fieldName] = FieldConfig(field, fallback)
          }
        }
      }
      
      CallxConfiguration(
        triggers = triggers.ifEmpty { CallxConfiguration().triggers },
        fields = fields.ifEmpty { CallxConfiguration().fields },
        notification = NotificationConfig()
      )
    } catch (e: Exception) {
      CallxConfiguration()
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
    return try {
      val callId = getFieldFromJson(fcmData, configuration.fields["callId"]) ?: "unknown-call"
      val callerName = getFieldFromJson(fcmData, configuration.fields["callerName"]) ?: "Unknown Caller"
      val callerPhone = getFieldFromJson(fcmData, configuration.fields["callerPhone"]) ?: "No Number"
      val callerAvatar = getFieldFromJson(fcmData, configuration.fields["callerAvatar"])
      
      CallData(
        callId = callId,
        callerName = callerName,
        callerPhone = callerPhone,
        callerAvatar = callerAvatar,
        timestamp = System.currentTimeMillis()
      )
    } catch (e: Exception) {
      null
    }
  }

  private fun detectTriggerType(fcmData: JSONObject): String? {
    return try {
      for ((triggerName, triggerConfig) in configuration.triggers) {
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

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ringtoneUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
      
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Incoming Calls",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming call notifications"
        setShowBadge(true)
        lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 1000, 1000, 1000, 1000)
        setSound(ringtoneUri, null)
        setBypassDnd(true)
      }
      
      notificationManager.createNotificationChannel(channel)
    }
  }

  private fun showIncomingCallActivity(callData: CallData) {
    try {
      val context = reactApplicationContext
      
      // Create caller avatar
      val callerAvatarBitmap = try {
        createDefaultAvatarBitmap(context, callData.callerName)
      } catch (e: Exception) {
        null
      }
      
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
      
      // Create answer intent that launches main app
      val answerIntent = createAnswerIntent(context, callData.callId)
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
      
      // Build notification
      val ringtoneUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE)
      val currentTime = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
      
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle(callData.callerName)
        .setContentText("📱 ${callData.callerPhone}")
        .setSubText("Incoming call • $currentTime")
        .setLargeIcon(callerAvatarBitmap)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setAutoCancel(false)
        .setOngoing(true)
        .setTimeoutAfter(60000)
        .setFullScreenIntent(fullScreenPendingIntent, true)
        .setContentIntent(fullScreenPendingIntent)
        .addAction(android.R.drawable.ic_menu_call, "Answer", answerPendingIntent)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setColorized(true)
        .setColor(0xFF2196F3.toInt()) // Blue accent for action buttons
        .setStyle(
          NotificationCompat.BigTextStyle()
            .bigText("📞 Incoming call from ${callData.callerName}\n📱 ${callData.callerPhone}\n\n🔔 Tap to answer or use buttons below")
            .setBigContentTitle("Incoming Call")
            .setSummaryText("Callx • $currentTime")
        )
        .setSound(ringtoneUri)
        .setVibrate(longArrayOf(0, 1000, 1000, 1000, 1000))
        .setDefaults(0)
        .setSilent(false)
        .build()
      
      // Add looping flags  
      notification.flags = notification.flags or 
        android.app.Notification.FLAG_INSISTENT or
        android.app.Notification.FLAG_NO_CLEAR or
        android.app.Notification.FLAG_ONGOING_EVENT
      
      notificationManager.notify(NOTIFICATION_ID, notification)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to show incoming call notification", e)
    }
  }

  private fun dismissIncomingCall() {
    try {
      notificationManager.cancel(NOTIFICATION_ID)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to dismiss notification", e)
    }
  }

  private fun handleAnswerCall(callData: CallData) {
    sendEventToJS("onCallAnswered", callDataToWritableMap(callData))
  }

  private fun handleDeclineCall(callData: CallData) {
    sendEventToJS("onCallDeclined", callDataToWritableMap(callData))
  }

  // Event callbacks from activity
  private fun handleCallAnswered(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        handleAnswerCall(call)
        dismissIncomingCall()
        currentCall = null
      }
    }
  }

  private fun handleCallDeclined(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        handleDeclineCall(call)
        dismissIncomingCall()
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

  // Create intent to answer call and launch main app
  private fun createAnswerIntent(context: Context, callId: String): Intent {
    // Always go through IncomingCallActivity to properly dismiss notification
    return Intent(context, IncomingCallActivity::class.java).apply {
      putExtra("action", "answer")
      putExtra("launch_app", true) // Special flag to launch app after answer
      putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
  }

  // Create a beautiful default avatar with caller initials
  private fun createDefaultAvatarBitmap(context: Context, callerName: String): android.graphics.Bitmap {
    val size = 128 // Avatar size in pixels
    val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    
    // Get initials from caller name
    val initials = getInitials(callerName)
    
    // Background colors for avatar (Material Design colors)
    val backgroundColors = listOf(
      0xFF1976D2.toInt(), // Blue
      0xFF388E3C.toInt(), // Green  
      0xFF7B1FA2.toInt(), // Purple
      0xFFD32F2F.toInt(), // Red
      0xFFF57C00.toInt(), // Orange
      0xFF5D4037.toInt(), // Brown
      0xFF455A64.toInt()  // Blue Grey
    )
    
    // Pick color based on name hash for consistency
    val colorIndex = Math.abs(callerName.hashCode()) % backgroundColors.size
    val backgroundColor = backgroundColors[colorIndex]
    
    // Draw circular background
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
    paint.color = backgroundColor
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    
    // Draw initials text
    paint.color = android.graphics.Color.WHITE
    paint.textSize = size * 0.4f // 40% of avatar size
    paint.textAlign = android.graphics.Paint.Align.CENTER
    paint.typeface = android.graphics.Typeface.DEFAULT_BOLD
    
    // Calculate text position (center vertically)
    val textMetrics = paint.fontMetrics
    val textHeight = textMetrics.descent - textMetrics.ascent
    val textY = size / 2f + textHeight / 2f - textMetrics.descent
    
    canvas.drawText(initials, size / 2f, textY, paint)
    
    return bitmap
  }
  
  // Extract initials from name (max 2 characters)
  private fun getInitials(name: String): String {
    return try {
      val cleanName = name.trim()
      if (cleanName.isEmpty()) return "?"
      
      val words = cleanName.split(" ").filter { it.isNotEmpty() }
      when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(2).uppercase()
        else -> "${words[0].first()}${words[1].first()}".uppercase()
      }
    } catch (e: Exception) {
      "?"
    }
  }


}
