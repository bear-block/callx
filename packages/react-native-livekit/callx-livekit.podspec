Pod::Spec.new do |s|
  s.name         = 'callx-livekit'
  s.version      = '0.0.1'
  s.summary      = 'LiveKit media adapter for @bear-block/callx.'
  s.homepage     = 'https://github.com/bear-block/callx'
  s.license      = { :type => 'MIT', :file => 'LICENSE' }
  s.author       = { 'Bear Block' => 'opensource@bear-block.com' }
  s.source       = { :git => 'https://github.com/bear-block/callx.git', :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.platform     = :ios, '15.0'
  s.swift_version = '6.0'
  s.dependency 'React-Core'
  s.dependency 'callx-react-native'
  # LiveKit's current Swift SDK ships through Swift Package Manager only (CocoaPods trunk stops
  # at 2.0.x). React Native's helper links the package into the pod.
  spm_dependency(s,
    url: 'https://github.com/livekit/client-sdk-swift',
    requirement: { kind: 'exactVersion', version: '2.17.0' },
    products: ['LiveKit'])
end
