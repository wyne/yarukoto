Pod::Spec.new do |s|
  s.name           = 'MacStatusItem'
  s.version        = '1.0.0'
  s.summary        = 'The Mac menu bar extra, open at login, and running with the window closed'
  s.description    = 'Puts Yarukoto in the Mac menu bar with today\'s tasks, registers it as a login item, and keeps it running in the menu bar when its window is closed.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.public_header_files = "YKMacAppKit.h"
end
