package com.callx

import android.content.Intent
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

  companion object {
    const val NAME = "Callx"
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

  // Legacy method for testing
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  // Private helper methods
  private fun parseConfiguration(config: ReadableMap): CallxConfiguration {
    // Basic parsing - we'll improve this later
    return CallxConfiguration()
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
    // Basic implementation - convert ReadableMap to JSONObject
    val json = JSONObject()
    // TODO: Implement proper conversion
    return json
  }

  private fun extractCallDataFromFcm(fcmData: JSONObject): CallData? {
    // TODO: Extract call data using field configuration
    return null
  }

  private fun detectTriggerType(fcmData: JSONObject): String? {
    // TODO: Detect trigger type based on configuration
    return null
  }

  private fun showIncomingCallActivity(callData: CallData) {
    try {
      val context = reactApplicationContext
      val intent = IncomingCallActivity.createIntent(
        context,
        callData.callId,
        callData.callerName,
        callData.callerPhone,
        callData.callerAvatar
      )
      context.startActivity(intent)
      
      android.util.Log.d(NAME, "Showing incoming call activity for: ${callData.callerName}")
    } catch (e: Exception) {
      android.util.Log.e(NAME, "Failed to show incoming call activity", e)
    }
  }

  private fun dismissIncomingCall() {
    // TODO: Dismiss notification/activity
    android.util.Log.d(NAME, "Dismissing incoming call")
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
