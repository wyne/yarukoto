/**
 * Overrides app.json per build target.
 *
 * The app ships as two builds that must be able to live on the same device:
 * `production` (the standalone store build) and `development` (the dev client,
 * so it can connect to the Metro server). Each gets its own bundle id, display
 * name and app icon — the development icon is the production one desaturated,
 * so the two are easy to tell apart on the home screen.
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
module.exports = ({ config }) => {
  const development = process.env.APP_VARIANT === 'development';

  return {
    ...config,
    experiments: {
      ...config.experiments,
      baseUrl: process.env.EXPO_BASE_URL ?? '',
    },
    name: development ? 'Yarukoto (dev)' : config.name,
    icon: development ? './assets/icon-dev.png' : config.icon,
    plugins: [
      ...(config.plugins ?? []),
      './plugins/native-glass-keyboard-dismiss',
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: development ? 'com.wyne.yarukoto.dev' : config.ios?.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: development ? 'com.wyne.yarukoto.dev' : config.android?.package,
      icon: development ? './assets/icon-dev.png' : config.android?.icon,
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        backgroundColor: development ? '#E4E4E4' : config.android?.adaptiveIcon?.backgroundColor,
        foregroundImage: development
          ? './assets/android-icon-foreground-dev.png'
          : config.android?.adaptiveIcon?.foregroundImage,
        backgroundImage: development
          ? './assets/android-icon-background-dev.png'
          : config.android?.adaptiveIcon?.backgroundImage,
      },
    },
  };
};
