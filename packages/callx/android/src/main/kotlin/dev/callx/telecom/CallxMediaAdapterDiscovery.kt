package dev.callx.telecom

import android.content.Context
import android.content.pm.PackageManager
import kotlinx.coroutines.CoroutineScope

/** What an adapter factory receives when the core creates its adapter. */
class CallxAdapterContext(
    val context: Context,
    /** Application-lifetime scope for the adapter's own work. */
    val scope: CoroutineScope,
    val log: (String) -> Unit,
)

/**
 * Creates a media adapter. An adapter package declares its factory in its manifest, so installing
 * the package is enough (ADR-0009):
 *
 * ```xml
 * <meta-data android:name="dev.callx.media.livekit" android:value="dev.callx.livekit.LiveKitAdapterFactory" />
 * ```
 *
 * The key is `dev.callx.media.` plus the provider, so two adapters never collide in the merged
 * manifest. The factory needs a public no-argument constructor.
 */
interface CallxMediaAdapterFactory {
    fun create(context: CallxAdapterContext): CallxMediaAdapter
}

/** The outcome of looking for a media adapter. */
sealed interface CallxMediaAdapterResolution {
    /** No adapter is installed: the host brings its own media or uses the listener callbacks. */
    data object None : CallxMediaAdapterResolution
    data class Resolved(val adapter: CallxMediaAdapter, val source: String) : CallxMediaAdapterResolution
    /** More than one media adapter is installed; the core does not pick one. */
    data class Conflict(val sources: List<String>) : CallxMediaAdapterResolution
    /** An adapter is installed but cannot be used; calls still ring, without media. */
    data class Unavailable(val source: String, val reason: String) : CallxMediaAdapterResolution
}

object CallxMediaAdapters {
    const val META_DATA_PREFIX = "dev.callx.media."

    /** Finds the media adapter declared in the app's merged manifest and creates it. */
    fun discover(adapterContext: CallxAdapterContext): CallxMediaAdapterResolution {
        val context = adapterContext.context
        val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        val entries = info.metaData?.let { bundle -> bundle.keySet().associateWith { bundle.getString(it) } }.orEmpty()
        return resolve(entries,
            instantiate = { name -> Class.forName(name, true, context.classLoader).getDeclaredConstructor().newInstance() },
            create = { factory -> factory.create(adapterContext) })
    }

    /** Resolution without Android framework types. [instantiate] loads a class by name. */
    fun resolve(entries: Map<String, String?>, instantiate: (String) -> Any,
        create: (CallxMediaAdapterFactory) -> CallxMediaAdapter): CallxMediaAdapterResolution {
        val declared = entries.filterKeys { it.startsWith(META_DATA_PREFIX) }.toSortedMap()
        if (declared.isEmpty()) return CallxMediaAdapterResolution.None
        if (declared.size > 1) return CallxMediaAdapterResolution.Conflict(declared.keys.toList())
        val (key, className) = declared.entries.single()
        if (className.isNullOrBlank()) return CallxMediaAdapterResolution.Unavailable(key, "$key has no factory class name.")
        val factory = try {
            instantiate(className) as? CallxMediaAdapterFactory
                ?: return CallxMediaAdapterResolution.Unavailable(key, "$className is not a CallxMediaAdapterFactory.")
        } catch (error: Throwable) {
            return CallxMediaAdapterResolution.Unavailable(key, "$className could not be created: $error")
        }
        val adapter = try { create(factory) } catch (error: Throwable) {
            return CallxMediaAdapterResolution.Unavailable(key, "$className failed to create an adapter: $error")
        }
        if (adapter.apiVersion != CALLX_MEDIA_API_VERSION) {
            return CallxMediaAdapterResolution.Unavailable(key,
                "$className implements media adapter API ${adapter.apiVersion}; this Callx supports $CALLX_MEDIA_API_VERSION.")
        }
        return CallxMediaAdapterResolution.Resolved(adapter, key)
    }
}
