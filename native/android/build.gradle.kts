plugins {
    `java-library`
    `maven-publish`
    kotlin("jvm") version "2.2.20"
    id("com.android.library") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
}

allprojects {
    group = "dev.callx"
    version = providers.gradleProperty("callxNativeVersion").getOrElse("0.0.0-SNAPSHOT")
}

publishing {
    publications {
        create<MavenPublication>("nativeCore") {
            from(components["java"])
            artifactId = "callx-core"
        }
    }
    repositories {
        maven { name = "nativeDevelopment"; url = uri(layout.buildDirectory.dir("native-repository")) }
    }
}

kotlin { jvmToolchain(17) }
java { withSourcesJar() }

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    testImplementation(kotlin("test"))
}

tasks.test { useJUnitPlatform() }
