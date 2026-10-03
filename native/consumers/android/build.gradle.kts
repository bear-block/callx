plugins {
    id("com.android.library") version "8.11.1"
    id("org.jetbrains.kotlin.android") version "2.2.20"
}
android {
    namespace = "dev.callx.consumer"
    compileSdk = 36
    defaultConfig { minSdk = 29 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { jvmToolchain(17) }
dependencies {
    // Deliberately no project dependency, Flutter, React Native or media provider.
    implementation("dev.callx:callx-android:${providers.gradleProperty("callxNativeVersion").getOrElse("0.0.0-SNAPSHOT")}")
}
