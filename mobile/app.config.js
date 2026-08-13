/**
 * Extends the static app.json.
 *
 * `experiments.baseUrl` is baked into the web export at build time: it prefixes
 * every bundled asset URL. The self-hosted server serves the app from the domain
 * root, so it must stay empty there — but GitHub Pages project sites live under
 * /<repo>/, where absolute asset paths would resolve to the domain root and 404.
 *
 * One build can't satisfy both, so it's driven by the environment: unset (the
 * default, and what Docker uses) means root, and the Pages workflow sets
 * EXPO_BASE_URL=/<repo>. A user/org site or a custom domain needs no value.
 */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.EXPO_BASE_URL ?? '',
  },
});
