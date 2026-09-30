pluginManagement { repositories { gradlePluginPortal(); mavenCentral(); google() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral(); google()
        // LiveKit's AudioSwitch fork, a dependency of the LiveKit adapter.
        maven("https://jitpack.io") { content { includeGroup("com.github.davidliu") } }
    }
}
rootProject.name = "callx-core"
include(":telecom")
// Canonical adapter sources, vendored into the adapter packages by native:sync.
include(":livekit")
project(":livekit").projectDir = file("../../adapters/livekit/native/android")
