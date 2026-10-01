package dev.callx.telecom

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/** Check before creating CallsManager: some Android devices have no Telecom service. */
object CallxTelecomAvailability {
    /**
     * The system feature that means Telecom can host self-managed calls. `FEATURE_TELECOM` only
     * exists from API 33; earlier devices declare `FEATURE_CONNECTION_SERVICE` instead, and never
     * declare the newer one.
     */
    fun requiredFeature(sdkInt: Int): String =
        if (sdkInt >= Build.VERSION_CODES.TIRAMISU) PackageManager.FEATURE_TELECOM
        else PackageManager.FEATURE_CONNECTION_SERVICE

    fun isSupported(context: Context): Boolean =
        context.packageManager.hasSystemFeature(requiredFeature(Build.VERSION.SDK_INT))

    fun requireSupported(context: Context) {
        if (!isSupported(context)) throw UnsupportedOperationException("Telecom is unavailable on this device.")
    }
}
