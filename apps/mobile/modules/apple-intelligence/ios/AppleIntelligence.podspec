Pod::Spec.new do |s|
  s.name           = 'AppleIntelligence'
  s.version        = '1.0.0'
  s.summary        = 'On-device receipt, expense and insight intelligence via Apple FoundationModels and Vision'
  s.description    = 'Local Expo module. Everything runs on-device: Vision OCR, FoundationModels guided generation. No network access.'
  s.author         = 'SettleUp'
  s.homepage       = 'https://github.com/settleup'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '27.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'FoundationModels', 'Vision', 'CoreImage', 'ImageIO'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
