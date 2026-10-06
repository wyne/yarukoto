# Yarukoto docs

The documentation site for docs.yarukotoapp.com, built with [Starlight](https://starlight.astro.build).
Pages are Markdown in `src/content/docs/`; the sidebar order is in `astro.config.mjs`.

```bash
npm install
npm run dev --workspace yarukoto-docs       # http://localhost:4321, reloads as you edit
npm run build --workspace yarukoto-docs     # static site in docs/dist/, with the search index
npm run preview --workspace yarukoto-docs   # serve docs/dist/ to check the production build
```
