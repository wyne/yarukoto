# Sourced by the scripts in this directory after they cd into client/.
#
# Without an install, `npx expo` doesn't fail: it falls back to whatever `expo`
# is on PATH, which on an older machine is the deprecated global expo-cli, and
# that fails much later with "Dependency map is invalid" or "module `expo` is
# not installed".
#
# client/ is an npm workspace, so its dependencies are installed into the repo
# root's node_modules and that is where `npx expo` looks. Check there, not in
# client/node_modules: a checkout from before the root workspace can still have
# a stale client/node_modules that would satisfy the check while npx misses it.
if [ ! -f ../node_modules/expo/package.json ]; then
  echo "Installing workspace dependencies (node_modules/expo is missing at the repo root)..."
  (cd .. && npm ci)
fi
