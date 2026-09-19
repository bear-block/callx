Pod::Spec.new do |s|
  s.name         = 'callx-react-native'
  s.version      = '0.0.1'
  s.summary      = 'Native call coordination for React Native.'
  s.homepage     = 'https://github.com/bear-block/callx'
  s.license      = { :type => 'MIT', :file => 'LICENSE' }
  s.author       = { 'Bear Block' => 'opensource@bear-block.com' }
  s.source       = { :git => 'https://github.com/bear-block/callx.git', :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.platform     = :ios, '15.0'
  s.swift_version = '6.0'
  s.dependency 'React-Core'
end
