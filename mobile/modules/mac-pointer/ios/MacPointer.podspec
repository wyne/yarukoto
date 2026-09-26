Pod::Spec.new do |s|
  s.name           = 'MacPointer'
  s.version        = '1.0.0'
  s.summary        = 'Mouse and trackpad input for the Mac build: hover and right-click'
  s.description    = 'Turns on React Native pointer events on the Mac, and reports right-clicks; neither reaches JS by default.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # For RCTSetDispatchW3CPointerEvents.
  s.dependency 'React-Core'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
