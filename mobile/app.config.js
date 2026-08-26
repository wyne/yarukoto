/**
 * Overrides app.json per build target.
 *
 * The app ships as three builds that must be able to live on the same device:
 * `production` (the standalone store build), `development` (the dev client, so
 * it can connect to the Metro server) and `preview` (a standalone build signed
 * locally, for trying a release build on a device without touching the store
 * copy). Each gets its own bundle id, display name and app icon — all cut from
 * the production icon, desaturated for dev and hue-shifted red for preview, so
 * they are easy to tell apart on the home screen.
 *
 * It also bakes `experiments.baseUrl` into the web export at build time: it
 * prefixes every bundled asset URL. The self-hosted server serves the app from
 * the domain root, so it must stay empty there — but GitHub Pages project sites
 * live under /<repo>/, where absolute asset paths would resolve to the domain
 * root and 404.
 *
 * Both are driven by the environment: APP_VARIANT (unset = production) picks the
 * native build, and EXPO_BASE_URL (unset = root, what Docker uses) picks the web
 * asset prefix. The Pages workflow sets EXPO_BASE_URL=/<repo>.
 */
// Everything that differs per variant. `production` is absent on purpose: it
// falls through to whatever app.json already declares.
const VARIANTS = {
  development: {
    suffix: '.dev',
    name: 'Yarukoto (dev)',
    icon: './assets/icon-dev.png',
    adaptiveForeground: './assets/android-icon-foreground-dev.png',
    // Sampled from the paper in the matching icon master, so the flat
    // background reads as a continuation of the inset foreground.
    adaptiveBackground: '#F1F1F1',
  },
  preview: {
    suffix: '.preview',
    name: 'Yarukoto (preview)',
    icon: './assets/icon-preview.png',
    adaptiveForeground: './assets/android-icon-foreground-preview.png',
    adaptiveBackground: '#EFF1EC',
  },
};

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT];

  return {
    ...config,
    experiments: {
      ...config.experiments,
      baseUrl: process.env.EXPO_BASE_URL ?? '',
    },
    name: variant?.name ?? config.name,
    icon: variant?.icon ?? config.icon,
    plugins: [
      ...(config.plugins ?? []),
      'expo-asset',
      // Must precede 'expo-notifications': mods run last-registered-first, so
      // registering the stripper first lets it delete `aps-environment` after
      // expo-notifications adds it. Listing expo-notifications explicitly also
      // pins its position, which autolinking otherwise decides for us.
      './plugins/local-notifications-only',
      'expo-notifications',
      './plugins/native-glass-keyboard-dismiss',
    ],
    ios: {
      ...config.ios,
      // The light/dark pair in app.json is production-only; a variant replaces it
      // with its single tinted icon.
      icon: variant?.icon ?? config.ios?.icon,
      bundleIdentifier: config.ios?.bundleIdentifier + (variant?.suffix ?? ''),
    },
    android: {
      ...config.android,
      package: config.android?.package + (variant?.suffix ?? ''),
      icon: variant?.icon ?? config.android?.icon,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor:
          variant?.adaptiveBackground ?? config.android?.adaptiveIcon?.backgroundColor,
        foregroundImage:
          variant?.adaptiveForeground ?? config.android?.adaptiveIcon?.foregroundImage,
      },
    },
  };
};
