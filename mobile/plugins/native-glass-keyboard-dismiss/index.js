const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withAppDelegate, withDangerousMod, withInfoPlist, withXcodeProject } = require('@expo/config-plugins');

const pkg = require('../../package.json');

const NATIVE_FILES = [
  'NativeGlassKeyboardDismissButton.swift',
  'NativeGlassKeyboardDismissButtonManager.m',
  'SceneDelegate.swift',
];

function copyNativeFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectName = modConfig.modRequest.projectName;
      const iosProjectRoot = modConfig.modRequest.platformProjectRoot;
      const sourceRoot = path.join(__dirname, 'ios');
      const destinationRoot = path.join(iosProjectRoot, projectName);

      fs.mkdirSync(destinationRoot, { recursive: true });

      for (const file of NATIVE_FILES) {
        fs.copyFileSync(path.join(sourceRoot, file), path.join(destinationRoot, file));
      }

      return modConfig;
    },
  ]);
}

function hasFileReference(project, fileName) {
  const fileReferences = project.pbxFileReferenceSection();
  return Object.values(fileReferences).some(
    (entry) => entry && typeof entry === 'object' && path.basename(entry.path ?? '') === fileName
  );
}

function findGroupKeyByName(project, groupName) {
  const groups = project.hash.project.objects.PBXGroup;
  return Object.entries(groups).find(([, entry]) => entry === groupName)?.[0]
    ?? Object.entries(groups).find(([, entry]) => entry && typeof entry === 'object' && entry.name === groupName)?.[0]
    ?? null;
}

function addNativeFilesToXcodeProject(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const target = project.getFirstTarget().uuid;
    const appGroupKey = findGroupKeyByName(project, projectName);

    for (const file of NATIVE_FILES) {
      if (hasFileReference(project, file)) continue;
      project.addSourceFile(`${projectName}/${file}`, { target }, appGroupKey);
    }

    return modConfig;
  });
}

function withSceneLifecycleInfoPlist(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };

    return modConfig;
  });
}

function withSceneLifecycleAppDelegate(config) {
  return withAppDelegate(config, (modConfig) => {
    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      /#if os\(iOS\) \|\| os\(tvOS\)\n\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s+factory\.startReactNative\(\n\s+withModuleName: "main",\n\s+in: window,\n\s+launchOptions: launchOptions\)\n#endif/,
      `#if os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`
    );

    return modConfig;
  });
}

function withNativeGlassKeyboardDismiss(config) {
  config = withSceneLifecycleInfoPlist(config);
  config = withSceneLifecycleAppDelegate(config);
  config = copyNativeFiles(config);
  config = addNativeFilesToXcodeProject(config);
  return config;
}

module.exports = createRunOncePlugin(
  withNativeGlassKeyboardDismiss,
  'native-glass-keyboard-dismiss',
  pkg.version
);
