const {
  createRunOncePlugin,
  withAppDelegate,
  withPodfile,
  withPodfileProperties,
  withXcodeProject,
} = require('@expo/config-plugins');

const pkg = require('../../package.json');

/**
 * Makes the generated iOS project build for Mac Catalyst as well.
 *
 * Expo has no macOS target, but nothing in the app needs one: every dependency
 * but the few in EXCLUDED_MODULES compiles for Catalyst once four things in the
 * generated project are set. Each fix below is one of them, and each was a build
 * failure without it.
 *
 * It also hooks the app's own commands into the Mac menu bar; that one is a
 * feature rather than a build fix.
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

// Expo modules that don't compile for Catalyst, left out of the Mac build. Their
// JS must not load there either: anything importing one has to stay behind a
// check that is false on the Mac.
//
// expo-camera: its barcode scanner uses VisionKit's DataScannerViewController,
// which doesn't exist on the Mac. Only the QR scanner uses it, and that is
// already hidden there (CAN_SCAN in src/components/household/QrScanner.tsx).
const EXCLUDED_MODULES = ['expo-camera'];

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

    const expoModules = /^([ \t]*)use_expo_modules!\n/m;
    if (!expoModules.test(contents)) {
      throw new Error('mac-catalyst: expected a bare use_expo_modules! in the Podfile; Expo\'s template has changed.');
    }
    contents = contents.replace(
      expoModules,
      (_, indent) => `${indent}use_expo_modules!({ exclude: ${JSON.stringify(EXCLUDED_MODULES)} }) ${MARKER}\n`
    );

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
      // Developer ID distribution and notarization expect the hardened
      // runtime. Xcode adds it when Catalyst is enabled interactively, but this
      // project enables Catalyst from a config plugin instead.
      buildSettings.ENABLE_HARDENED_RUNTIME = 'YES';
    }

    return modConfig;
  });
}

const MENU_MARKER = '// mac-catalyst plugin: menu bar';

/**
 * Hands the menu bar to modules/mac-menu.
 *
 * Catalyst asks the app delegate to amend its default menu bar, through an
 * override no module can supply, and a menu command's action has to be answered
 * by something in the responder chain, which the delegate ends. So the delegate
 * gets both, each forwarding to MacMenuBar, where the menu is actually defined,
 * and a `canPerformAction` that lets MacMenuBar dim a command — which is also
 * what hands a plain key like Return back to a focused text field. The action's
 * name is the one MacMenuBar.action looks up.
 *
 * Anchored on Expo's template, and throws if that changes, like the Podfile edit.
 */
function withMenuBarAppDelegate(config) {
  return withAppDelegate(config, (modConfig) => {
    const appDelegate = modConfig.modResults;
    if (appDelegate.language !== 'swift') {
      throw new Error(`mac-catalyst: expected a Swift AppDelegate, found ${appDelegate.language}.`);
    }
    let contents = appDelegate.contents;
    if (contents.includes(MENU_MARKER)) return modConfig;

    const reactImport = /^import React\n/m;
    const classDecl = /^((?:public )?class AppDelegate: ExpoAppDelegate \{\n)/m;
    if (!reactImport.test(contents) || !classDecl.test(contents)) {
      throw new Error('mac-catalyst: expected `import React` and `class AppDelegate: ExpoAppDelegate {` in the AppDelegate; Expo\'s template has changed.');
    }
    // Expo 57's generated provider imports autolinked modules as `internal`.
    // Match that access level so Swift 6 does not reject the same module being
    // imported with two different implicit access levels in one target.
    contents = contents.replace(reactImport, (line) => `${line}internal import MacMenu\n`);
    contents = contents.replace(
      classDecl,
      `$1  ${MENU_MARKER}\n` +
        `  override func buildMenu(with builder: UIMenuBuilder) {\n` +
        `    super.buildMenu(with: builder)\n` +
        `    MacMenuBar.build(with: builder)\n` +
        `  }\n\n` +
        `  @objc func macMenuCommand(_ sender: UICommand) {\n` +
        `    MacMenuBar.perform(sender)\n` +
        `  }\n\n` +
        `  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {\n` +
        `    MacMenuBar.canPerform(action, withSender: sender)\n` +
        `      ?? super.canPerformAction(action, withSender: sender)\n` +
        `  }\n\n`
    );

    appDelegate.contents = contents;
    return modConfig;
  });
}

function withMacCatalyst(config) {
  config = withSourceBuiltExpoModules(config);
  config = withCatalystPodfile(config);
  config = withCatalystAppTarget(config);
  config = withMenuBarAppDelegate(config);
  return config;
}

module.exports = createRunOncePlugin(withMacCatalyst, 'mac-catalyst', pkg.version);
