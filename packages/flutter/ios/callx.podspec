Pod::Spec.new do |s|
  s.name             = 'callx'
  # CocoaPods excludes prereleases from unconstrained dependency resolution.
  s.version          = '0.0.1'
  s.summary          = 'Native call coordination for Flutter.'
  s.homepage         = 'https://github.com/bear-block/callx'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.author           = { 'Bear Block' => 'opensource@bear-block.com' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*', 'CallxCore/**/*'
  s.dependency 'Flutter'
  s.platform = :ios, '15.0'
  s.swift_version = '6.0'
end
