package dev.callx.telecom

import android.content.Context
import android.content.pm.PackageManager

/** Check before creating CallsManager: some Android devices have no Telecom service. */
object CallxTelecomAvailability {
    fun isSupported(context: Context): Boolean =
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELECOM)

    fun requireSupported(context: Context) {
        if (!isSupported(context)) throw UnsupportedOperationException("Telecom is unavailable on this device.")
    }
}
