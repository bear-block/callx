package com.callx

import android.content.Context
import org.json.JSONObject

/**
 * Lightweight storage for pending incoming call state when JS/runtime isn't ready yet.
 */
object CallxStorage {
  private const val PREFS_NAME = "callx_prefs"
  private const val KEY_PENDING_CALL = "pending_call"
  private const val KEY_PENDING_ACTION = "pending_action"

  data class PendingAction(
    val action: String,
    val callData: CallData
  )

  fun savePendingCall(context: Context, callData: CallData) {
    try {
      val json = JSONObject().apply {
        put("callId", callData.callId)
        put("callerName", callData.callerName)
        put("callerPhone", callData.callerPhone)
        put("callerAvatar", callData.callerAvatar ?: JSONObject.NULL)
        put("hasVideo", callData.hasVideo)
        put("timestamp", callData.timestamp)
      }
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_PENDING_CALL, json.toString())
        .apply()
    } catch (_: Exception) {
    }
  }

  fun getAndClearPendingCall(context: Context): CallData? {
    return try {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val stored = prefs.getString(KEY_PENDING_CALL, null) ?: return null
      val json = JSONObject(stored)
      val call = CallData(
        callId = json.optString("callId", ""),
        callerName = json.optString("callerName", "Unknown Caller"),
        callerPhone = json.optString("callerPhone", "No Number"),
        callerAvatar = json.optString("callerAvatar").let { if (it == "null") null else it },
        timestamp = json.optLong("timestamp", System.currentTimeMillis()),
        hasVideo = json.optBoolean("hasVideo", false)
      )
      prefs.edit().remove(KEY_PENDING_CALL).apply()
      call
    } catch (_: Exception) {
      null
    }
  }

  fun savePendingAction(context: Context, action: String, callData: CallData) {
    try {
      val json = JSONObject().apply {
        put("action", action)
        put("callId", callData.callId)
        put("callerName", callData.callerName)
        put("callerPhone", callData.callerPhone)
        put("callerAvatar", callData.callerAvatar ?: JSONObject.NULL)
        put("hasVideo", callData.hasVideo)
        put("timestamp", callData.timestamp)
      }
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_PENDING_ACTION, json.toString())
        .apply()
    } catch (_: Exception) {
    }
  }

  fun getAndClearPendingAction(context: Context): PendingAction? {
    return try {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val stored = prefs.getString(KEY_PENDING_ACTION, null) ?: return null
      val json = JSONObject(stored)
      val action = json.optString("action", "")
      val call = CallData(
        callId = json.optString("callId", ""),
        callerName = json.optString("callerName", "Unknown Caller"),
        callerPhone = json.optString("callerPhone", "No Number"),
        callerAvatar = json.optString("callerAvatar").let { if (it == "null") null else it },
        timestamp = json.optLong("timestamp", System.currentTimeMillis()),
        hasVideo = json.optBoolean("hasVideo", false)
      )
      prefs.edit().remove(KEY_PENDING_ACTION).apply()
      PendingAction(action, call)
    } catch (_: Exception) {
      null
    }
  }
}


