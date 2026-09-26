const { createRunOncePlugin, withPodfile, withPodfileProperties, withXcodeProject } = require('@expo/config-plugins');

const pkg = require('../../package.json');

/**
 * Makes the generated iOS project build for Mac Catalyst as well.
 *
 * Expo has no macOS target, but nothing in the app needs one: every dependency
 * compiles for Catalyst once four things in the generated project are set. Each
 * fix below is one of them, and each was a build failure without it.
 *
 * Only applied when MAC_CATALYST=1 (see app.config.js). Two of the fixes cost the
 * phone build something — Expo modules compiled from source instead of linked
 * prebuilt, and React Native's Catalyst patch rewriting library search paths —
 * and the phone build should not pay for a target it isn't producing.
 */

// Xcode maps a pod's iOS deployment target to a macOS one for Catalyst, and pods
// left on React Native's 15.1 default map below the oldest macOS it will build
// for. The app itself already requires 16.4, so raising the pods to match
// changes nothing on a phone.
const IOS_DEPLOYMENT_TARGET = '16.4';

// CocoaPods defaults every pod to macOS 10.15, which Xcode 27 rejects outright.
const MACOS_DEPLOYMENT_TARGET = '14.0';

const MARKER = '# mac-catalyst plugin';

/**
 * Expo's precompiled module xcframeworks ship device and simulator slices only,
 * so linking them fails for Catalyst. Turning them off compiles those modules
 * from source. React Native's own prebuilt core and Hermes do carry a Catalyst
 * slice, and stay prebuilt.
 */
function withSourceBuiltExpoModules(config) {
  return withPodfileProperties(config, (modConfig) => {
    modConfig.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false';
    return modConfig;
  });
}

/**
 * Turns on React Native's Catalyst patches and raises the pods' deployment
 * targets. Both have to run inside the Podfile's post_install: the pods project
 * doesn't exist until `pod install` generates it, long after prebuild is done.
 *
 * The edits anchor on text in Expo's Podfile template, and throw rather than
 * skip when it isn't there — a template change should fail the prebuild, not
 * quietly produce a project that won't build for the Mac.
 */
function withCatalystPodfile(config) {
  return withPodfile(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    const flag = ':mac_catalyst_enabled => false';
    if (!contents.includes(flag)) {
      throw new Error(`mac-catalyst: expected "${flag}" in the Podfile; Expo's template has changed.`);
    }
    contents = contents.replace(flag, ':mac_catalyst_enabled => true');

    // After react_native_post_install rather than before it, so nothing it does
    // to the pods' settings can undo these.
    const hook = /^([ \t]*)react_native_post_install\([\s\S]*?\n\1\)\n/m;
    const match = contents.match(hook);
    if (!match) {
      throw new Error('mac-catalyst: expected a react_native_post_install call in the Podfile; Expo\'s template has changed.');
    }
    const indent = match[1];
    contents = contents.replace(
      hook,
      `${match[0]}${indent}${MARKER}\n` +
        `${indent}installer.pods_project.targets.each do |target|\n` +
        `${indent}  target.build_configurations.each do |build_config|\n` +
        `${indent}    build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS_DEPLOYMENT_TARGET}'\n` +
        `${indent}    build_config.build_settings['MACOSX_DEPLOYMENT_TARGET'] = '${MACOS_DEPLOYMENT_TARGET}'\n` +
        `${indent}  end\n` +
        `${indent}end\n`
    );

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

/** Offers the Mac Catalyst destination on the app target itself. */
function withCatalystAppTarget(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();

    for (const { buildSettings } of Object.values(configurations)) {
      // Only the app target's configurations name a product bundle id; the
      // project-level ones don't, and are left alone.
      if (!buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) continue;
      buildSettings.SUPPORTS_MACCATALYST = 'YES';
    }

    return modConfig;
  });
}

function withMacCatalyst(config) {
  config = withSourceBuiltExpoModules(config);
  config = withCatalystPodfile(config);
  config = withCatalystAppTarget(config);
  return config;
}

module.exports = createRunOncePlugin(withMacCatalyst, 'mac-catalyst', pkg.version);
