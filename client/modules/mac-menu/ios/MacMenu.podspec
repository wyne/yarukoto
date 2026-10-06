Pod::Spec.new do |s|
  s.name           = 'MacMenu'
  s.version        = '1.0.0'
  s.summary        = 'The Mac menu bar: app commands and their keyboard shortcuts'
  s.description    = 'Adds New Task, Find and Settings to the Mac menu bar, reports them to JS, and puts undoing a completion under Edit > Undo.'
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
end
