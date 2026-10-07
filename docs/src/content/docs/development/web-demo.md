---
title: The web demo
description: How the sample-data demo is published to GitHub Pages.
---

`.github/workflows/pages.yml` builds the web client and deploys it to Pages on every push to
`main`. Enable it once under **Settings → Pages → Source → GitHub Actions**.

**It's a sample-data demo, not a usable instance.** Pages is HTTPS, and a self-hosted server on
plain HTTP is mixed content that browsers block — so "Connect" can't reach a local instance from
there. Visitors get "Explore with sample data", which runs entirely client-side.

The build-time subtlety: a Pages *project* site is served from `/<repo>/`, and the export
hard-codes absolute asset URLs. `client/app.config.js` reads `EXPO_BASE_URL` so the workflow can
set that prefix while the Docker build — which serves from the domain root — leaves it empty.
Setting it globally would break self-hosting. A user/org site or a custom domain needs no prefix.
The same value reaches the app itself as `process.env.EXPO_BASE_URL`, which is how the URL routing
knows what to strip off the front of the path.

The other one: Pages has no rewrite rules, so `/<repo>/today` is a request for a file that isn't
there. The workflow copies `index.html` to `404.html`, which is what Pages serves instead — the app
boots from it, reads the path and shows the right view. The self-hosted server does the same job
with a not-found handler.
