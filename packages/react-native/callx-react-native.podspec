require 'json'

Pod::Spec.new do |s|
  s.name         = 'callx-react-native'
  # One version for every package (npm run release:version). CocoaPods excludes prereleases
  # from unconstrained resolution, so the pod carries only the release part.
  s.version      = JSON.parse(File.read(File.join(__dir__, 'package.json')))['version'].split('-').first
  s.summary      = 'Native call coordination for React Native.'
  s.homepage     = 'https://github.com/bear-block/callx'
  s.license      = { :type => 'MIT', :file => 'LICENSE' }
  s.author       = { 'Bear Block' => 'opensource@bear-block.com' }
  s.source       = { :git => 'https://github.com/bear-block/callx.git', :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.platform     = :ios, '15.0'
  s.swift_version = '6.0'
  # TurboModule: codegen headers (CallxSpec) and the React Native module dependencies.
  install_modules_dependencies(s)
end
