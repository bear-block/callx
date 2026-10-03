pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven {
            url = uri("../../android/build/native-repository")
            content { includeGroup("dev.callx") }
        }
        google()
        mavenCentral()
    }
}
rootProject.name = "callx-native-consumer"
