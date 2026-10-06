const { createRunOncePlugin, withEntitlementsPlist } = require('@expo/config-plugins');

const pkg = require('../../package.json');

/**
 * Strips the `aps-environment` entitlement that expo-notifications adds.
 *
 * Yarukoto only schedules *local* notifications (due-date reminders), which
 * need no entitlement and no Apple Developer capability. But the
 * expo-notifications config plugin stamps `aps-environment` unconditionally —
 * it can't tell local-only usage from remote push. Xcode then demands a
 * provisioning profile carrying the Push Notifications capability, and the
 * App Store build fails to sign:
 *
 *   Provisioning profile "..." doesn't include the aps-environment entitlement.
 *
 * Rather than enable a push capability we never use, drop the entitlement.
 *
 * ORDERING IS LOAD-BEARING. Mods are a LIFO chain: the *last* plugin
 * registered runs *first*, so the plugin registered *earliest* gets the final
 * word on the entitlements plist. This plugin must therefore come BEFORE
 * 'expo-notifications' in the plugins array — otherwise expo-notifications
 * re-adds the key after we delete it. See app.config.js.
 */
function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    delete modConfig.modResults['aps-environment'];
    return modConfig;
  });
}

module.exports = createRunOncePlugin(
  withLocalNotificationsOnly,
  'local-notifications-only',
  pkg.version
);
