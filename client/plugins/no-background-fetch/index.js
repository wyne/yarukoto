const { createRunOncePlugin, withInfoPlist } = require('@expo/config-plugins');

const pkg = require('../../package.json');

/**
 * Drops the `fetch` background mode that expo-task-manager declares.
 *
 * The task manager is here for Android's headless notification-action task
 * (see AGENTS.md); on iOS nothing schedules a background fetch. App Review
 * asks about every declared background mode and rejects ones the app doesn't
 * use (guideline 2.5.4), so the plist should only claim what is real.
 *
 * Runs after expo-task-manager's own plugin because that one is applied by
 * Expo itself, later in the chain than anything in app.config.js's list.
 */
function withNoBackgroundFetch(config) {
  return withInfoPlist(config, (modConfig) => {
    const modes = modConfig.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter((mode) => mode !== 'fetch');
      if (kept.length) modConfig.modResults.UIBackgroundModes = kept;
      else delete modConfig.modResults.UIBackgroundModes;
    }
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withNoBackgroundFetch, 'no-background-fetch', pkg.version);
