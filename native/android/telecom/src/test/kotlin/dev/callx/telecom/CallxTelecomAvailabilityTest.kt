package dev.callx.telecom

import kotlin.test.Test
import kotlin.test.assertEquals

class CallxTelecomAvailabilityTest {
    @Test
    fun beforeApi33TheConnectionServiceFeatureIsChecked() {
        // FEATURE_TELECOM does not exist on Android 10–12, so checking it there disabled calls.
        assertEquals("android.software.connectionservice", CallxTelecomAvailability.requiredFeature(29))
        assertEquals("android.software.connectionservice", CallxTelecomAvailability.requiredFeature(32))
    }

    @Test
    fun fromApi33TheTelecomFeatureIsChecked() {
        assertEquals("android.software.telecom", CallxTelecomAvailability.requiredFeature(33))
        assertEquals("android.software.telecom", CallxTelecomAvailability.requiredFeature(36))
    }
}
