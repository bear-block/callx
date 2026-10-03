plugins {
    `maven-publish`
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    publishing { singleVariant("release") { withSourcesJar() } }
    namespace = "dev.callx.telecom"
    compileSdk = 36
    defaultConfig { minSdk = 29 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { jvmToolchain(17) }

dependencies {
    api(project(":"))
    api("androidx.core:core-telecom:1.0.1")
    implementation("androidx.core:core:1.13.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    testImplementation(kotlin("test"))
}

afterEvaluate {
    publishing {
        publications {
            create<MavenPublication>("nativeAndroid") {
                from(components["release"])
                artifactId = "callx-android"
            }
        }
        repositories {
            maven {
                name = "nativeDevelopment"
                url = uri(rootProject.layout.buildDirectory.dir("native-repository"))
            }
        }
    }
}
