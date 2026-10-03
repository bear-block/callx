package dev.callx.consumer

import android.content.Context
import dev.callx.core.BridgeRuntime
import dev.callx.core.CallCoordinator
import dev.callx.core.CoordinatorCheckpointCodec
import androidx.core.telecom.CallsManager
import dev.callx.telecom.CallxBootstrap
import dev.callx.telecom.CallxBootstrapConfig
import kotlinx.coroutines.CoroutineScope

/** Compile-only consumer: accessing these types verifies transitive API dependencies. */
class NativeHost(context: Context) {
    private val pipeline = CallxBootstrap.start(context,
        CallxBootstrapConfig(discoverMedia = false), install = {})
    val runtime: BridgeRuntime = pipeline.runtime
    val scope: CoroutineScope = CallxBootstrap.scope
    val telecomCapability = CallsManager.CAPABILITY_BASELINE
    val encodedEmptyCheckpoint = CoordinatorCheckpointCodec.encode(CallCoordinator().checkpoint())
}
