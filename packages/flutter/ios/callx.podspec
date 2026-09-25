Pod::Spec.new do |s|
  s.name             = 'callx'
  # CocoaPods excludes prereleases from unconstrained dependency resolution.
  s.version          = '0.0.1'
  s.summary          = 'Native call coordination for Flutter.'
  s.homepage         = 'https://github.com/bear-block/callx'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.author           = { 'Bear Block' => 'opensource@bear-block.com' }
  s.source           = { :path => '.' }
  # Shared with Swift Package Manager: callx/Package.swift builds the same sources.
  s.source_files     = 'callx/Sources/callx/**/*.swift'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'
  s.swift_version = '6.0'
end
