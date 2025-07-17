# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-beta.7] - 2024-12-19

### Fixed

- Corrected callID handling in FCM message processing
- Fixed field mapping for callId in callx.json configuration
- Improved FCM service message handling logic
- Updated example callx.json to match library defaults

### Changed

- Streamlined README documentation for better clarity
- Removed redundant content and improved structure
- Updated configuration examples to be more concise

## [0.1.0-beta.6] - 2024-12-19

### Added

- **REQUIRED:** Enforced CallxReactActivity inheritance for both Expo and React Native CLI
- Added verification in CallxModule to ensure MainActivity extends CallxReactActivity
- Enhanced Expo plugin to automatically modify MainActivity.kt
- Added clear error messages with setup instructions when inheritance is missing
- Updated plugin to throw errors for missing MainActivity instead of warnings

### Changed

- **BREAKING:** MainActivity must now extend CallxReactActivity (no longer optional)
- Updated README to mark CallxReactActivity inheritance as REQUIRED
- Enhanced Expo plugin configuration in package.json
- Improved error handling with detailed setup instructions
- Updated setup comparison to reflect mandatory inheritance

### Fixed

- Expo plugin configuration for proper discovery by Expo CLI
- Added app.plugin export in package.json exports
- Added expo configuration section in package.json
- Fixed plugin discovery issues in Expo projects

## [0.1.0-beta.1] - 2024-12-19

### Added

- **Initial beta release** of Callx React Native library
- **Native incoming call UI** for Android with full-screen lock screen support
- **Firebase Cloud Messaging (FCM) integration** for push notification handling
- **Three handling modes**: native (recommended), custom, and hybrid
- **Expo plugin support** for automatic configuration
- **React Native CLI support** with manual setup guide
- **Customizable FCM mapping** via `callx.json` configuration file
- **Comprehensive API** for call management (answer, decline, end, etc.)
- **Lock screen management** utilities
- **TypeScript support** with full type definitions
- **Professional documentation** with quick start guides for both CLI and Expo

### Features

- Beautiful native call UI with gradient backgrounds and circular buttons
- Automatic notification channel creation for incoming calls
- Support for caller avatar, name, and phone number display
- Background call handling with proper Android lifecycle management
- Customizable notification sounds and importance levels
- Integration with existing VoIP or call handling logic

### Technical

- Built with React Native Turbo Modules for optimal performance
- Kotlin-based Android implementation
- Comprehensive error handling and fallback mechanisms
- Modular architecture supporting multiple handling modes
- Extensive configuration options for different use cases

### Documentation

- Complete README with quick start guides
- API reference with all available methods
- Troubleshooting and FAQ section
- Configuration examples for different scenarios
- Build configuration guide for advanced usage

### Developer Experience

- Zero-config setup for Expo projects
- Minimal manual configuration for React Native CLI
- Clear error messages and debugging information
- Support for both development and production environments
