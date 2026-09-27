package dev.callx.preview.rn.device

import android.os.Build
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

/**
 * Test harness only: reports the FCM token and host log to the local call console
 * (`npm run call:console`), which reaches this device through `adb reverse`. Without the
 * console running, each report fails fast and is dropped.
 */
object ConsoleReporter {
    private const val ENDPOINT = "http://127.0.0.1:8787/api/device"

    fun start(app: String, token: () -> String?, events: () -> List<String>) {
        Executors.newSingleThreadScheduledExecutor().scheduleWithFixedDelay({
            val body = JSONObject().put("app", app).put("model", Build.MODEL)
                .put("token", token()).put("events", JSONArray(events())).toString().toByteArray()
            try {
                (URL(ENDPOINT).openConnection() as HttpURLConnection).run {
                    connectTimeout = 1000; readTimeout = 1000; requestMethod = "POST"; doOutput = true
                    setRequestProperty("content-type", "application/json")
                    outputStream.use { it.write(body) }
                    responseCode; disconnect()
                }
            } catch (_: Exception) {}
        }, 0, 1, TimeUnit.SECONDS)
    }
}
