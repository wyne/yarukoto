Pod::Spec.new do |s|
  s.name           = 'NotificationActions'
  s.version        = '1.0.0'
  s.summary        = 'Native handling for task reminder notification actions'
  s.description    = 'Catches Done/Snooze taps before the JS bundle exists, so they survive a killed app.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # For NotificationCenterManager: expo-notifications owns the
  # UNUserNotificationCenter delegate, so the handler registers with it rather
  # than displacing it.
  s.dependency 'ExpoNotifications'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
