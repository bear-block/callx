package dev.callx.livekit

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Where and as whom a call's media connects. */
data class LiveKitCredentials(val url: String, val token: String)

/** Resolves room credentials for a call, natively: the answer path never waits for Dart or JavaScript. */
fun interface LiveKitCredentialProvider {
    suspend fun credentials(callId: String): LiveKitCredentials
}

/**
 * The backend contract of the HTTP credential source: `POST tokenUrl` with the configured
 * headers and `{"callId": "..."}`; the backend authenticates the user, checks call membership
 * and answers `{"url": "wss://...", "token": "..."}`.
 */
object LiveKitTokenEndpoint {
    fun requestBody(callId: String): String = JSONObject().put("callId", callId).toString()

    fun parse(status: Int, body: String): LiveKitCredentials {
        if (status !in 200..299) throw IllegalStateException("Token endpoint answered $status.")
        val json = try { JSONObject(body) } catch (error: Exception) {
            throw IllegalStateException("Token endpoint answered invalid JSON.", error)
        }
        val url = json.optString("url"); val token = json.optString("token")
        if (url.isEmpty() || token.isEmpty()) throw IllegalStateException("Token endpoint answer lacks url or token.")
        return LiveKitCredentials(url, token)
    }

    suspend fun fetch(tokenUrl: String, headers: Map<String, String>, callId: String): LiveKitCredentials =
        withContext(Dispatchers.IO) {
            val connection = URL(tokenUrl).openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 5_000; connection.readTimeout = 5_000
                connection.requestMethod = "POST"; connection.doOutput = true
                connection.setRequestProperty("content-type", "application/json")
                headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }
                connection.outputStream.use { it.write(requestBody(callId).toByteArray()) }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                parse(status, stream?.bufferedReader()?.readText().orEmpty())
            } finally { connection.disconnect() }
        }
}

/**
 * The persisted HTTP credential source. The URL lives in private preferences; headers, which
 * usually carry a session token, are encrypted with an Android Keystore key.
 */
internal class LiveKitConfigStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("dev.callx.livekit", Context.MODE_PRIVATE)

    fun save(tokenUrl: String, headers: Map<String, String>) {
        val sealed = seal(JSONObject(headers).toString())
        preferences.edit().putString(KEY_URL, tokenUrl).putString(KEY_HEADERS, sealed).apply()
    }

    fun clear() { preferences.edit().clear().apply() }

    /** Null when not configured. Headers that cannot be decrypted (a restored backup) are dropped. */
    fun load(): Pair<String, Map<String, String>>? {
        val url = preferences.getString(KEY_URL, null) ?: return null
        val headers = preferences.getString(KEY_HEADERS, null)?.let { sealed ->
            runCatching { JSONObject(open(sealed)) }.getOrNull()?.let { json ->
                json.keys().asSequence().associateWith { json.getString(it) }
            }
        }.orEmpty()
        return url to headers
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build())
        }.generateKey()
    }

    private fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(plain.toByteArray())
        return Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    private fun open(sealed: String): String {
        val bytes = Base64.decode(sealed, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
        }
        return String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES))
    }

    private companion object {
        const val KEY_URL = "tokenUrl"; const val KEY_HEADERS = "headers"
        const val KEYSTORE = "AndroidKeyStore"; const val ALIAS = "dev.callx.livekit.headers"
        const val TRANSFORMATION = "AES/GCM/NoPadding"; const val IV_BYTES = 12
    }
}
