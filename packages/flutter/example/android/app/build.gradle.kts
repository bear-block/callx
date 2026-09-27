plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Device trials need Firebase. The build takes google-services.json from packages/secrets/
// (or this directory); without it the example still builds and runs, but it cannot receive
// FCM invitations. Both locations are ignored by Git.
val sharedGoogleServices = rootProject.file("../../../secrets/google-services.json")
if (sharedGoogleServices.exists()) sharedGoogleServices.copyTo(file("google-services.json"), overwrite = true)
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "dev.callx.preview.callx_flutter_example"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // Must match the Android app registered in the Firebase project.
        applicationId = "dev.bearblock.callx"
        minSdk = 29
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    // The host code configures the Callx runtime natively, so it compiles against these directly.
    implementation("androidx.core:core-telecom:1.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
}
