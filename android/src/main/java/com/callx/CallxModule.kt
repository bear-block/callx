package com.callx

import android.content.Intent
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import com.callx.NativeCallxSpec
 
import android.app.Application
import java.util.UUID
import android.provider.CallLog
import android.content.ContentValues
import android.net.Uri
import android.telephony.TelephonyManager
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

// Data classes
data class CallData(
    val callId: String,
    val callerName: String,
    val callerPhone: String,
    val callerAvatar: String?,
    val timestamp: Long = System.currentTimeMillis(),
    val hasVideo: Boolean = false,

)

data class TriggerConfig(
    val field: String,
    val value: String
)

data class FieldConfig(
    val field: String,
    val fallback: String? = null
)

data class AppConfig(
    val packageName: String = "",  // Will be auto-detected
    val mainActivity: String = "", // Will be auto-detected
    val showOverLockscreen: Boolean = true,
    val requireUnlock: Boolean = false,
    val supportsVideo: Boolean = false
)

data class NotificationConfig(
    val channelId: String,
    val channelName: String,
    val channelDescription: String,
    val importance: String,
    val sound: String
)

data class CallLoggingConfig(
    val enabledLogPhoneCall: Boolean = true
)

data class CallxConfiguration(
    val app: AppConfig = AppConfig(),
    val triggers: Map<String, TriggerConfig> = mapOf(
        "incoming" to TriggerConfig("data.type", "call.started"),
        "ended" to TriggerConfig("data.type", "call.ended"),
        "missed" to TriggerConfig("data.type", "call.missed"),
        "answered_elsewhere" to TriggerConfig("data.type", "call.answered_elsewhere")
    ),
    val fields: Map<String, FieldConfig> = mapOf(
        "callId" to FieldConfig("data.callId", null),
        "callerName" to FieldConfig("data.callerName", "Unknown Caller"),
        "callerPhone" to FieldConfig("data.callerPhone", "No Number"),
        "callerAvatar" to FieldConfig("data.callerAvatar", null),
        "hasVideo" to FieldConfig("data.hasVideo", "false")
    ),
    val notification: NotificationConfig = NotificationConfig(
        channelId = "callx_incoming_calls_v2",
        channelName = "Incoming Calls",
        channelDescription = "Incoming call notifications with ringtone",
        importance = "high",
        sound = "default"
    ),
    val callLogging: CallLoggingConfig = CallLoggingConfig()
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
    const val CHANNEL_ID = "callx_incoming_calls_v2"
    const val NOTIFICATION_ID = 1001
    private var moduleInstance: CallxModule? = null

    // Static methods for activity callbacks
    fun onCallAnswered(callId: String, callerName: String) {
      moduleInstance?.handleCallAnswered(callId, callerName)
    }

    // Static method for call declined callback
    fun onCallDeclined(callId: String, callerName: String) {
      moduleInstance?.handleCallDeclined(callId, callerName)
    }

    // Public access for Firebase service
    fun getInstance(): CallxModule? = moduleInstance
  }

  init {
    moduleInstance = this
    createNotificationChannel()
    // Load configuration from AndroidManifest <meta-data>; fallback to defaults
    loadConfigurationFromManifest()
    // Auto-setup Callx lifecycle (auto setup, no need to extend Application)
    try {
      CallxAutoSetup.initialize(reactApplicationContext as android.app.Application)
    } catch (e: Exception) {
      android.util.Log.w(NAME, "Auto-setup failed, manual setup required: ${e.message}")
    }
  }

  override fun getName(): String {
    return NAME
  }

  override fun initialize(config: ReadableMap?, promise: Promise) {
    try {
      // Only override assets config if JS provides triggers/fields/notification
      if (config != null && (config.hasKey("triggers") || config.hasKey("fields") || config.hasKey("notification"))) {
        configuration = parseConfiguration(config)
      }
      // Use configuration loaded from manifest in init()
      isInitialized = true

      // Flush any pending state saved while JS was not ready
      try {
        val pendingCall = CallxStorage.getAndClearPendingCall(reactApplicationContext)
        if (pendingCall != null) {
          currentCall = pendingCall
          showIncomingCallActivity(pendingCall)
          sendEventToJS("onIncomingCall", callDataToWritableMap(pendingCall))
        }

        val pendingAction = CallxStorage.getAndClearPendingAction(reactApplicationContext)
        if (pendingAction != null) {
          when (pendingAction.action) {
            "answer" -> handleCallAnswered(pendingAction.callData.callId, pendingAction.callData.callerName)
            "decline" -> handleCallDeclined(pendingAction.callData.callId, pendingAction.callData.callerName)
            "end" -> handleCallEnded(pendingAction.callData.callId, pendingAction.callData.callerName)
            "missed" -> handleMissedCall(pendingAction.callData)
            "answered_elsewhere" -> handleCallAnsweredElsewhere(pendingAction.callData.callId, pendingAction.callData.callerName)
          }
        }
      } catch (_: Exception) {
      }

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
            handleCallEnded(callData.callId, callData.callerName)
            sendEventToJS("onCallEnded", callDataToWritableMap(callData))
          }
          "missed" -> {
            handleMissedCall(callData)
            sendEventToJS("onCallMissed", callDataToWritableMap(callData))
          }
          "answered_elsewhere" -> {
            handleCallAnsweredElsewhere(callData.callId, callData.callerName)
            sendEventToJS("onCallAnsweredElsewhere", callDataToWritableMap(callData))
          }
          else -> {
            android.util.Log.w(NAME, "Unknown trigger type: $triggerType")
          }
        }
      } else {
        android.util.Log.w(NAME, "Could not extract call data from FCM")
      }
      
      promise.resolve(null)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "FCM handling error: ${e.message}", e)
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

  // Lock screen management methods
  override fun hideFromLockScreen(promise: Promise) {
    try {
      val currentActivity = reactApplicationContext.currentActivity
      if (currentActivity != null) {
        android.util.Log.d(NAME, "🔒 Hiding app from lock screen...")
        
        // Clear lock screen visibility flags
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          currentActivity.setShowWhenLocked(false)
          currentActivity.setTurnScreenOn(false)
        } else {
          @Suppress("DEPRECATION")
          currentActivity.window.clearFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
          )
        }
        
        // Move app to background (simulate home button press)
        moveAppToBackgroundInternal()
        
        android.util.Log.d(NAME, "✅ App successfully hidden from lock screen")
        promise.resolve(true)
      } else {
        promise.reject("NO_ACTIVITY", "No current activity available")
      }
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to hide app from lock screen: ${e.message}", e)
      promise.reject("HIDE_ERROR", "Failed to hide app from lock screen: ${e.message}", e)
    }
  }

  override fun moveAppToBackground(promise: Promise) {
    try {
      moveAppToBackgroundInternal()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("BACKGROUND_ERROR", "Failed to move app to background: ${e.message}", e)
    }
  }

  // FCM token retrieval
  override fun getFCMToken(promise: Promise) {
    try {
      com.google.firebase.messaging.FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          if (!task.isSuccessful) {
            promise.reject("FCM_TOKEN_ERROR", "Failed to get FCM token: ${task.exception?.message}", task.exception)
            return@addOnCompleteListener
          }

          // Get new FCM token
          val token = task.result
          android.util.Log.d(NAME, "FCM token retrieved: ${token?.take(20)}...")
          
          // Send event to JS
          sendEventToJS("onTokenUpdated", mapOf("token" to (token ?: "")))
          
          promise.resolve(token ?: "")
        }
    } catch (e: Exception) {
      promise.reject("FCM_TOKEN_ERROR", "Failed to get FCM token: ${e.message}", e)
    }
  }

  // VoIP token retrieval (not supported on Android)
  override fun getVoIPToken(promise: Promise) {
    try {
      // Android doesn't have VoIP tokens like iOS - return empty string
      android.util.Log.d(NAME, "VoIP tokens are not supported on Android")
      promise.resolve("")
    } catch (e: Exception) {
      promise.reject("VOIP_TOKEN_ERROR", "Failed to get VoIP token: ${e.message}", e)
    }
  }

















  override fun getConfiguration(promise: Promise) {
    try {
      val config = mapOf(
        "triggers" to configuration.triggers.mapValues { (_, trigger) ->
          mapOf(
            "field" to trigger.field,
            "value" to trigger.value
          )
        },
        "fields" to configuration.fields.mapValues { (_, field) ->
          mapOf(
            "field" to field.field,
            "fallback" to field.fallback
          )
        },
        // Notification config is hardcoded, not exposed via API
        "app" to mapOf(
          "supportsVideo" to configuration.app.supportsVideo
        ),
        "callLogging" to mapOf(
          "enabledLogPhoneCall" to configuration.callLogging.enabledLogPhoneCall
        )
      )
      promise.resolve(config)
    } catch (e: Exception) {
      promise.reject("GET_CONFIG_ERROR", "Failed to get configuration: ${e.message}", e)
    }
  }

  // Private helper methods
    private fun parseConfiguration(config: ReadableMap): CallxConfiguration {
    return try {
      var appConfig = AppConfig()
      val triggers = mutableMapOf<String, TriggerConfig>()
      val fields = mutableMapOf<String, FieldConfig>()
      var callLogging = CallLoggingConfig()
      
      // Parse app config
      config.getMap("app")?.let { appMap ->
        appConfig = AppConfig(
          packageName = appMap.getString("packageName") ?: "",
          mainActivity = appMap.getString("mainActivity") ?: "",
          showOverLockscreen = if (appMap.hasKey("showOverLockscreen")) appMap.getBoolean("showOverLockscreen") else true,
          requireUnlock = if (appMap.hasKey("requireUnlock")) appMap.getBoolean("requireUnlock") else false,
          supportsVideo = if (appMap.hasKey("supportsVideo")) appMap.getBoolean("supportsVideo") else false
        )
      }
      
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
      
      // Parse call logging config
      config.getMap("callLogging")?.let { callLoggingMap ->
        callLogging = CallLoggingConfig(
          enabledLogPhoneCall = if (callLoggingMap.hasKey("enabledLogPhoneCall")) callLoggingMap.getBoolean("enabledLogPhoneCall") else true
        )
      }
      
      CallxConfiguration(
        app = appConfig,
        triggers = triggers.ifEmpty { CallxConfiguration().triggers },
        fields = fields.ifEmpty { CallxConfiguration().fields },
        notification = NotificationConfig(
          channelId = "callx_incoming_calls_v2",
          channelName = "Incoming Calls",
          channelDescription = "Incoming call notifications with ringtone",
          importance = "high",
          sound = "default"
        ),
        callLogging = callLogging
      )
    } catch (e: Exception) {
      CallxConfiguration()
    }
  }

  private fun parseCallData(data: ReadableMap): CallData {
    return CallData(
      callId = data.getString("callId") ?: "",
      callerName = data.getString("callerName") ?: "Unknown Caller",
      callerPhone = data.getString("callerPhone") ?: "No Number",
      callerAvatar = data.getString("callerAvatar"),
      hasVideo = if (data.hasKey("hasVideo")) data.getBoolean("hasVideo") else false,

    )
  }

  private fun callDataToWritableMap(callData: CallData): WritableMap {
    val map = Arguments.createMap()
    map.putString("callId", callData.callId)
    map.putString("callerName", callData.callerName)
    map.putString("callerPhone", callData.callerPhone)
    callData.callerAvatar?.let { map.putString("callerAvatar", it) }
    map.putBoolean("hasVideo", callData.hasVideo)
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
      val callId = getFieldFromJson(fcmData, configuration.fields["callId"]) ?: generateUUID()
      val callerName = getFieldFromJson(fcmData, configuration.fields["callerName"]) ?: "Unknown Caller"
      val callerPhone = getFieldFromJson(fcmData, configuration.fields["callerPhone"]) ?: "No Number"
      val callerAvatar = getFieldFromJson(fcmData, configuration.fields["callerAvatar"])
      val hasVideo = getFieldFromJson(fcmData, configuration.fields["hasVideo"])?.toBoolean() ?: false
      
      CallData(
        callId = callId,
        callerName = callerName,
        callerPhone = callerPhone,
        callerAvatar = callerAvatar,
        hasVideo = hasVideo,
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
        configuration.notification.channelName,
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = configuration.notification.channelDescription
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

  // Public method for Firebase service to call
  fun showIncomingCallFromService(callData: CallData) {
    currentCall = callData
    showIncomingCallActivity(callData)
    // Notify JS layer if app is active
    try {
      sendEventToJS("onIncomingCall", callDataToWritableMap(callData))
    } catch (e: Exception) {
      // JS layer might not be available in background, ignore
      android.util.Log.d(NAME, "JS layer not available, skipping event")
    }
  }

  // Public notifications for service when app is already running
  fun notifyEndedFromService(callData: CallData) {
    try {
      sendEventToJS("onCallEnded", callDataToWritableMap(callData))
    } catch (_: Exception) {
      // ignore
    }
  }

  fun notifyMissedFromService(callData: CallData) {
    try {
      sendEventToJS("onCallMissed", callDataToWritableMap(callData))
    } catch (_: Exception) {
      // ignore
    }
  }

  fun notifyAnsweredElsewhereFromService(callData: CallData) {
    try {
      sendEventToJS("onCallAnsweredElsewhere", callDataToWritableMap(callData))
    } catch (_: Exception) {
      // ignore
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
      
      // Determine call type and icon
      val isVideoCall = callData.hasVideo
      val callTypeIcon = if (isVideoCall) android.R.drawable.ic_menu_camera else android.R.drawable.sym_call_incoming
      val callTypeText = if (isVideoCall) "Video call" else "Voice call"
      val callTypeEmoji = if (isVideoCall) "📹" else "📞"
      
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(callTypeIcon)
        .setContentTitle(callData.callerName)
        .setContentText("📱 ${callData.callerPhone}")
        .setSubText("$callTypeText • $currentTime")
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
            .bigText("$callTypeEmoji Incoming $callTypeText from ${callData.callerName}\n📱 ${callData.callerPhone}\n\n🔔 Tap to answer or use buttons below")
            .setBigContentTitle("Incoming $callTypeText")
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
        // Log call to phone history
        logCallToPhoneHistory(call, "incoming")
        
        handleAnswerCall(call)
        dismissIncomingCall()
        currentCall = null
      }
    }
  }

  // Handle call declined callback from activity
  private fun handleCallDeclined(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        // Log missed call to phone history
        logCallToPhoneHistory(call, "missed")
        
        handleDeclineCall(call)
        dismissIncomingCall()
        currentCall = null
        
        android.util.Log.d(NAME, "📞 Call declined: $callId")
      }
    }
  }

  // Handle call answered elsewhere (desktop, web, other device): close UI and emit JS event
  private fun handleCallAnsweredElsewhere(callId: String, callerName: String) {
    currentCall?.let { call ->
      if (call.callId == callId) {
        sendEventToJS("onCallAnsweredElsewhere", callDataToWritableMap(call))
        dismissIncomingCall()
        currentCall = null
        android.util.Log.d(NAME, "🤝 Call answered elsewhere (UI dismissed, event emitted): $callId")
      }
    }
  }

  private fun mapToWritableMap(map: Map<String, Any?>): WritableMap {
    val writableMap = Arguments.createMap()
    for ((key, value) in map) {
      when (value) {
        is String -> writableMap.putString(key, value)
        is Boolean -> writableMap.putBoolean(key, value)
        is Int -> writableMap.putInt(key, value)
        is Double -> writableMap.putDouble(key, value)
        is Long -> writableMap.putDouble(key, value.toDouble())
        null -> writableMap.putNull(key)
        else -> writableMap.putString(key, value.toString())
      }
    }
    return writableMap
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

  private fun sendEventToJS(eventName: String, data: Map<String, Any?>) {
    sendEventToJS(eventName, mapToWritableMap(data))
  }

  private fun handleCallEnded(callId: String, callerName: String) {
    val callData = currentCall ?: return
    sendEventToJS("onCallEnded", callDataToWritableMap(callData))
    android.util.Log.d(NAME, "📞 Call ended: $callId, reason: ended")
  }

  private fun handleMissedCall(callData: CallData) {
    sendEventToJS("onCallMissed", callDataToWritableMap(callData))
    android.util.Log.d(NAME, "📞 Call missed: ${callData.callId}")
  }

  private fun handleEndCall(callData: CallData) {
    sendEventToJS("onCallEnded", callDataToWritableMap(callData))
    android.util.Log.d(NAME, "📞 Call ended: ${callData.callId}")
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


  // Load configuration from AndroidManifest meta-data
  private fun loadConfigurationFromManifest() {
    try {
      val pm = reactApplicationContext.packageManager
      val appInfo = pm.getApplicationInfo(reactApplicationContext.packageName, android.content.pm.PackageManager.GET_META_DATA)
      val meta = appInfo.metaData
      if (meta == null) {
        configuration = CallxConfiguration()
        return
      }

      // Read triggers
      val triggers = mutableMapOf<String, TriggerConfig>()
      val triggerKeys = listOf("incoming", "ended", "missed", "answered_elsewhere")
      for (key in triggerKeys) {
        val field = meta.getString("callx.triggers.$key.field")
        val value = meta.getString("callx.triggers.$key.value")
        if (!field.isNullOrEmpty() && !value.isNullOrEmpty()) {
          triggers[key] = TriggerConfig(field, value)
        }
      }

      // Read fields
      val fields = mutableMapOf<String, FieldConfig>()
      val fieldKeys = listOf("callId", "callerName", "callerPhone", "callerAvatar", "hasVideo")
      for (key in fieldKeys) {
        val path = meta.getString("callx.fields.$key")
        val fallback = meta.getString("callx.fields.$key.fallback")
        if (!path.isNullOrEmpty()) {
          fields[key] = FieldConfig(path, fallback)
        }
      }

      configuration = CallxConfiguration(
        app = configuration.app,
        triggers = if (triggers.isNotEmpty()) triggers else CallxConfiguration().triggers,
        fields = if (fields.isNotEmpty()) fields else CallxConfiguration().fields,
        notification = configuration.notification,
        callLogging = configuration.callLogging
      )
      android.util.Log.i(NAME, "Configuration loaded from AndroidManifest meta-data")
    } catch (e: Exception) {
      android.util.Log.w(NAME, "Failed to load config from manifest: ${e.message}")
      configuration = CallxConfiguration()
    }
  }

  // Helper method to move app to background (simulate home button press)
  private fun moveAppToBackgroundInternal() {
    try {
      val context = reactApplicationContext
      val homeIntent = Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(homeIntent)
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to move app to background: ${e.message}", e)
    }
  }

  private fun generateUUID(): String {
    return UUID.randomUUID().toString()
  }

  // MARK: - Call Logging Methods

  private fun logCallToPhoneHistory(callData: CallData, callType: String) {
    try {
      // Check if call logging is enabled
      if (!configuration.callLogging.enabledLogPhoneCall) {
        android.util.Log.d(NAME, "📞 Call logging is disabled in configuration")
        return
      }

      // Check specific call type logging
      val shouldLog = true // Always log for phone calls

      if (!shouldLog) {
        android.util.Log.d(NAME, "📞 Call logging disabled for type: $callType")
        return
      }

      // Check for WRITE_CALL_LOG permission
      if (ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.WRITE_CALL_LOG
      ) != PackageManager.PERMISSION_GRANTED) {
        android.util.Log.w(NAME, "📞 Call logging requires WRITE_CALL_LOG permission")
        return
      }

      val values = ContentValues().apply {
        put(CallLog.Calls.NUMBER, callData.callerPhone)
        put(CallLog.Calls.TYPE, callType)
        put(CallLog.Calls.DATE, callData.timestamp)
        put(CallLog.Calls.DURATION, 0) // Duration not tracked in simplified version
        put(CallLog.Calls.NEW, 1)
        
        // Only log caller info if enabled
        // if (configuration.callLogging.logCallerInfo) { // This line is removed as per new CallLoggingConfig
        //   put(CallLog.Calls.CACHED_NAME, callData.callerName)
        //   put(CallLog.Calls.CACHED_NUMBER_TYPE, TelephonyManager.PHONE_TYPE_NONE)
        //   put(CallLog.Calls.CACHED_NUMBER_LABEL, "Callx")
        // }
      }

      val uri = reactApplicationContext.contentResolver.insert(CallLog.Calls.CONTENT_URI, values)
      if (uri != null) {
        android.util.Log.d(NAME, "📞 Call logged to phone history: $callType - ${callData.callerName}")
        // Store URI for later update when call ends
        currentCall?.let { call ->
          // You could store the URI in a map to update duration later
        }
      } else {
        android.util.Log.e(NAME, "📞 Failed to log call to phone history")
      }
    } catch (e: Exception) {
      android.util.Log.e(NAME, "📞 Error logging call to phone history", e)
    }
  }

  private fun getCallLogType(callType: String): Int {
    return when (callType) {
      "incoming" -> CallLog.Calls.INCOMING_TYPE
      "outgoing" -> CallLog.Calls.OUTGOING_TYPE
      "missed" -> CallLog.Calls.MISSED_TYPE
      "rejected" -> CallLog.Calls.REJECTED_TYPE
      "blocked" -> CallLog.Calls.BLOCKED_TYPE
      else -> CallLog.Calls.INCOMING_TYPE
    }
  }

      private fun detectAppPackageName(): String {
        return try {
            // Use application context to get the main app's package name
            val appContext = reactApplicationContext.applicationContext
            val appPackageName = appContext.packageName
            android.util.Log.d(NAME, "🔍 Auto-detected App Package: $appPackageName")
            appPackageName
        } catch (e: Exception) {
            android.util.Log.e(NAME, "❌ Error detecting App Package: ${e.message}")
            // Fallback to module package name if detection fails
            reactApplicationContext.packageName
        }
    }

    private fun detectMainActivity(): String {
        return try {
            val packageManager = reactApplicationContext.packageManager
            val appPackageName = detectAppPackageName()
            val launchIntent = packageManager.getLaunchIntentForPackage(appPackageName)

            if (launchIntent != null && launchIntent.component != null) {
                val fullClassName = launchIntent.component!!.className
                val activityName = fullClassName.substringAfterLast(".")
                android.util.Log.d(NAME, "🔍 Auto-detected MainActivity: $activityName for package: $appPackageName")
                activityName
            } else {
                android.util.Log.w(NAME, "⚠️ Could not detect MainActivity for package: $appPackageName, using default")
                "MainActivity"
            }
        } catch (e: Exception) {
            android.util.Log.e(NAME, "❌ Error detecting MainActivity: ${e.message}")
            "MainActivity"
        }
    }

}
