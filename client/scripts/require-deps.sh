# Sourced by the scripts in this directory after they cd into client/.
#
# Without a local install, `npx expo` doesn't fail: it falls back to whatever
# `expo` is on PATH, which on an older machine is the deprecated global
# expo-cli, and that fails much later with "module `expo` is not installed".
# A fresh checkout (or the mobile/ -> client/ rename, which left node_modules
# behind) hits this, so install from the lockfile before anything calls expo.
if [ ! -f node_modules/expo/package.json ]; then
  echo "Installing client dependencies (node_modules/expo is missing)..."
  npm ci
fi
