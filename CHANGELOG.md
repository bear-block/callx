# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
