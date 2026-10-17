#!/usr/bin/env bash
# Verify that a production tag, package version, and resolved Expo version all
# describe the same release before spending native build time.
set -euo pipefail
export EXPO_NO_TELEMETRY=1

TAG="${1:-}"
PACKAGE_VERSION="$(node -p "require('../package.json').version")"
EXPO_VERSION="$(../node_modules/.bin/expo config --type public --json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"

if [ -z "$TAG" ]; then
  echo "A release tag is required." >&2
  exit 1
fi

if [ "$TAG" != "v$PACKAGE_VERSION" ]; then
  echo "Tag $TAG does not match package.json version $PACKAGE_VERSION." >&2
  exit 1
fi

if [ "$EXPO_VERSION" != "$PACKAGE_VERSION" ]; then
  echo "Expo resolves version $EXPO_VERSION, not package.json version $PACKAGE_VERSION." >&2
  exit 1
fi

node -e "JSON.parse(require('fs').readFileSync('eas.json', 'utf8'))"
echo "Release preflight passed for $TAG."

