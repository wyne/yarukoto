# Yarukoto docs

The documentation site for docs.yarukotoapp.com, built with [Starlight](https://starlight.astro.build).
Pages are Markdown in `src/content/docs/`; the sidebar order is in `astro.config.mjs`.

```bash
cd docs
npm install
npm run dev       # http://localhost:4321, reloads as you edit
npm run build     # static site in dist/, with the search index
npm run preview   # serve dist/ to check the production build
```
