package dev.callx.reactnative

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

/** Registers Callx as a TurboModule, and the CallxVideoView component. */
class CallxPackage : BaseReactPackage() {
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(CallxVideoViewManager())

    override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
        if (name == NativeCallxSpec.NAME) CallxModule(context) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(NativeCallxSpec.NAME to ReactModuleInfo(NativeCallxSpec.NAME, CallxModule::class.java.name,
            canOverrideExistingModule = false, needsEagerInit = false, isCxxModule = false, isTurboModule = true))
    }
}
