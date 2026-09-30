Pod::Spec.new do |s|
  s.name             = 'callx'
  # One version for every package (npm run release:version). CocoaPods excludes prereleases
  # from unconstrained resolution, so the pod carries only the release part.
  s.version          = File.read(File.join(__dir__, '..', 'pubspec.yaml'))[/^version:\s*(\S+)/, 1].split('-').first
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
