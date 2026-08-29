# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Backend/Mobile Compatibility

The full protocol is in the root `AGENTS.md`; the client half of it:

- Gate any UI that depends on backend storage with `supportsFeature(id)` from
  `useTasks()`, so a feature the connected server cannot keep is never offered.
- Strip that feature's fields in `pushDirty` before `POST /sync` when the server
  has not advertised the id.
- An unknown feature set — a failed `/health` probe, or a snapshot cached before
  the first probe — is neither: **hide the UI, but still send the field.** A row
  wrongly hidden reappears on the next probe; a field wrongly stripped is gone,
  because the upsert replaces the row. `supportsFeature` answers the UI question
  and reads unknown as no; `pushDirty` gets the full feature list when unknown.
- Never gate on the app's own version, and never on whether a pulled record
  happened to contain the field.

Local and sample mode have no server to negotiate with and are fully capable.
