#!/bin/bash
# Builds, Developer ID-signs, notarizes, staples, and packages Yarukoto for
# direct download outside the Mac App Store.
#
#   npm run mac:release
#   MAC_VERSION=1.0.1 MAC_BUILD_NUMBER=2026092701 npm run mac:release
#
# Prerequisites:
#   - Developer ID Application identity in the login keychain
#   - `notarytool` keychain profile (default: yarukoto-notary)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-$LANG}"

TEAM_ID="${APPLE_TEAM_ID:-NMBVD647S6}"
NOTARY_PROFILE="${NOTARY_PROFILE:-yarukoto-notary}"
MAC_VERSION="${MAC_VERSION:-$(node -p "require('./app.json').expo.version")}"
MAC_BUILD_NUMBER="${MAC_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"
IDENTITY="Developer ID Application: Justin Wyne ($TEAM_ID)"

if ! security find-identity -v -p codesigning | grep -Fq "$IDENTITY"; then
  echo "Missing signing identity: $IDENTITY" >&2
  echo "Create or download it in Xcode > Settings > Apple Accounts > Manage Certificates." >&2
  exit 1
fi

echo "Preparing Yarukoto $MAC_VERSION ($MAC_BUILD_NUMBER) for Mac Catalyst..."
if [ "${SKIP_PREBUILD:-0}" != "1" ]; then
  MAC_CATALYST=1 \
  MAC_VERSION="$MAC_VERSION" \
  MAC_BUILD_NUMBER="$MAC_BUILD_NUMBER" \
    npx expo prebuild --platform ios --clean
fi

WORKSPACE=$(find ios -maxdepth 1 -name '*.xcworkspace' -type d -print -quit)
if [ -z "$WORKSPACE" ]; then
  echo "Expo prebuild did not create an Xcode workspace." >&2
  exit 1
fi
SCHEME=$(basename "$WORKSPACE" .xcworkspace)

RELEASE_ROOT="dist/macos/$MAC_VERSION-$MAC_BUILD_NUMBER"
ARCHIVE_PATH="$RELEASE_ROOT/$SCHEME.xcarchive"
PACKAGE_DIR="$RELEASE_ROOT/package"
DOWNLOAD_DMG="$RELEASE_ROOT/$SCHEME-$MAC_VERSION.dmg"

mkdir -p "$RELEASE_ROOT" "$PACKAGE_DIR"

if [ "${SKIP_ARCHIVE:-0}" != "1" ]; then
  xcodebuild \
    -quiet \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -destination 'generic/platform=macOS,variant=Mac Catalyst' \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    archive
fi

APP=$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -type d -print -quit)
if [ -z "$APP" ]; then
  echo "The archive does not contain a Mac application." >&2
  exit 1
fi

# Keep the final app outside the archive so stapling and packaging do not alter
# Xcode's archival copy.
if [ -d "$PACKAGE_DIR/$(basename "$APP")" ]; then
  rm -rf "$PACKAGE_DIR/$(basename "$APP")"
fi
ditto "$APP" "$PACKAGE_DIR/$(basename "$APP")"
APP="$PACKAGE_DIR/$(basename "$APP")"

# Some React Native prebuilt Catalyst frameworks currently contain both a flat
# framework and a second, fully copied Versions hierarchy. Xcode 27 considers
# that bundle ambiguous when codesigning it. Convert those copies into the
# standard macOS framework symlink layout. The app links to Versions/A, so that
# directory must remain present at runtime.
while IFS= read -r -d '' FRAMEWORK; do
  FRAMEWORK_NAME=$(basename "$FRAMEWORK" .framework)
  if [ -f "$FRAMEWORK/$FRAMEWORK_NAME" ] && \
     [ ! -L "$FRAMEWORK/$FRAMEWORK_NAME" ] && \
     [ -f "$FRAMEWORK/Versions/A/$FRAMEWORK_NAME" ]; then
    while IFS= read -r -d '' RESOURCE_BUNDLE; do
      mv "$RESOURCE_BUNDLE" "$FRAMEWORK/Versions/A/Resources/"
    done < <(find "$FRAMEWORK" -maxdepth 1 -type d -name '*.bundle' -print0)
    rm -f "$FRAMEWORK/$FRAMEWORK_NAME"
    rm -rf "$FRAMEWORK/Resources" "$FRAMEWORK/Versions/Current"
    ln -s A "$FRAMEWORK/Versions/Current"
    ln -s "Versions/Current/$FRAMEWORK_NAME" "$FRAMEWORK/$FRAMEWORK_NAME"
    ln -s Versions/Current/Resources "$FRAMEWORK/Resources"
  fi
done < <(find "$APP/Contents" -depth -type d -name '*.framework' -print0)

# Sign from the inside out. Letting CocoaPods sign while embedding frameworks
# fails on the React framework above; explicit post-build signing also keeps the
# exact Developer ID workflow visible and reproducible.
while IFS= read -r -d '' ITEM; do
  codesign --force --timestamp --options runtime --sign "$IDENTITY" "$ITEM"
done < <(find "$APP/Contents" -depth -type f -name '*.dylib' -print0)

# A few React Native dependency frameworks contain nested resource bundles.
# Codesign treats them as subcomponents, so they must be signed before their
# containing framework even though they have no executable of their own.
while IFS= read -r -d '' ITEM; do
  codesign --force --timestamp --options runtime --sign "$IDENTITY" "$ITEM"
done < <(find "$APP/Contents" -depth -type d \
  \( -name '*.bundle' -o -name '*.appex' -o -name '*.xpc' \) -print0)

while IFS= read -r -d '' ITEM; do
  codesign --force --timestamp --options runtime --sign "$IDENTITY" "$ITEM"
done < <(find "$APP/Contents" -depth -type d -name '*.framework' -print0)

ENTITLEMENTS="ios/$SCHEME/$SCHEME.entitlements"
if [ ! -f "$ENTITLEMENTS" ]; then
  echo "Missing generated Catalyst entitlements: $ENTITLEMENTS" >&2
  exit 1
fi
codesign --force --timestamp --options runtime \
  --entitlements "$ENTITLEMENTS" \
  --sign "$IDENTITY" \
  "$APP"

codesign --verify --deep --strict --verbose=2 "$APP"

# A signed disk image is the most reliable website download for Catalyst. In
# particular, Xcode 27's stapler corrupts this Catalyst app when asked to attach
# a ticket directly to the .app. Stapling the signed DMG gives Gatekeeper the
# same offline proof while leaving the inner app's signature untouched.
hdiutil create \
  -volname "$SCHEME" \
  -srcfolder "$APP" \
  -ov \
  -format UDZO \
  "$DOWNLOAD_DMG"
codesign --force --timestamp --sign "$IDENTITY" "$DOWNLOAD_DMG"
xcrun notarytool submit "$DOWNLOAD_DMG" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait
xcrun stapler staple "$DOWNLOAD_DMG"
xcrun stapler validate "$DOWNLOAD_DMG"
spctl --assess --type execute --verbose=4 "$APP"
hdiutil verify "$DOWNLOAD_DMG"

shasum -a 256 "$DOWNLOAD_DMG" > "$DOWNLOAD_DMG.sha256"

echo
echo "Release ready:"
echo "  $ROOT_DIR/$DOWNLOAD_DMG"
echo "  $ROOT_DIR/$DOWNLOAD_DMG.sha256"
