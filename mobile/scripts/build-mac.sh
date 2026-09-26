#!/bin/bash
# Builds the app for Mac Catalyst: regenerates the iOS project with the
# mac-catalyst plugin applied, then compiles a Release build for the Mac.
#
#   npm run mac            # production identity
#   npm run mac -- --open  # ...and launch it
#   APP_VARIANT=preview npm run mac
#
# The result is unsigned and runs on this Mac only; see "Building the Mac app"
# in the README for signing and distribution.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

OPEN=0
[ "${1:-}" = "--open" ] && OPEN=1

# CocoaPods aborts on a Podfile path check without a UTF-8 locale, which a
# non-interactive shell may not have.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-$LANG}"

MAC_CATALYST=1 npx expo prebuild --platform ios --clean

# The workspace, and the scheme inside it, is named after the variant
# (Yarukoto, Yarukotopreview, ...), so find it rather than assume it.
WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
DERIVED=ios/build/catalyst

xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -destination 'platform=macOS,variant=Mac Catalyst' \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO \
    build

APP=$(ls -d "$DERIVED"/Build/Products/Release-maccatalyst/*.app | head -1)
echo
echo "Built $ROOT_DIR/$APP"

[ "$OPEN" = 1 ] && open "$APP"
exit 0
