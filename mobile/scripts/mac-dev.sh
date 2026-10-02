#!/bin/bash
# Runs the Mac app in development: the dev client, built Debug for Mac Catalyst,
# connected to Metro so JS edits reload without rebuilding.
#
#   npm run mac:dev                 # build the dev client, launch it, serve JS
#   npm run mac:dev -- --no-build   # launch the last build, serve JS
#
# Only a native change (a module's Swift, a new native dependency, a config
# plugin) needs the build; for JS, --no-build skips it. Like `npm run mac`, the
# build regenerates mobile/ios with prebuild --clean.
#
# Metro runs in this terminal, as `npm run start:dev` does; the app is opened
# once it is listening, pointed straight at it rather than at the launcher.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BUILD=1
for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

export APP_VARIANT=development

[ "$BUILD" = 1 ] && scripts/build-mac.sh --debug

APP=$(ls -d ios/build/catalyst/Build/Products/Debug-maccatalyst/*.app 2>/dev/null | head -1 || true)
if [ -z "$APP" ]; then
    echo "No Mac dev build yet. Run npm run mac:dev without --no-build first." >&2
    exit 1
fi

PORT=8081
# The dev client's own scheme (exp+<slug>). Opened with -a, so the link reaches
# this build and not another variant that registers the same scheme.
URL="exp+yarukoto://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT"
(
    until curl -sf "http://localhost:$PORT/status" >/dev/null; do sleep 1; done
    open -a "$ROOT_DIR/$APP" "$URL"
) &

exec npx expo start --dev-client --port "$PORT"
