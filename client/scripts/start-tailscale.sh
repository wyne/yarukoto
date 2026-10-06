#!/bin/bash
# Serves Metro to the tailnet over HTTPS, for running the dev client on a phone
# that is not on the same LAN.
#
# It has to be HTTPS. iOS refuses plaintext to a Tailscale address: the app sets
# both NSAllowsArbitraryLoads and NSAllowsLocalNetworking, and when a granular
# ATS key is present iOS ignores the blanket one — leaving only the local-network
# exemption, which covers RFC1918 but not Tailscale's 100.64.0.0/10 CGNAT range.
# A real certificate sidesteps the question entirely, and Tailscale issues one
# for the MagicDNS name.
#
# Port 8443 rather than 443 so this sits beside whatever else is already served
# at the root of the machine's tailnet name.
set -euo pipefail

TAILSCALE="${TAILSCALE:-/Applications/Tailscale.app/Contents/MacOS/Tailscale}"
PORT=8443

if [ ! -x "$TAILSCALE" ]; then
    echo "Tailscale CLI not found at $TAILSCALE. Set TAILSCALE=/path/to/tailscale." >&2
    exit 1
fi

HOST=$("$TAILSCALE" status --json | python3 -c "
import json, sys
print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))
")

# Idempotent — re-running only re-asserts the same mapping.
"$TAILSCALE" serve --bg --https=$PORT http://127.0.0.1:8081 >/dev/null

URL="https://$HOST:$PORT"
echo "Dev server: $URL"
echo "If the dev client doesn't pick it up, enter that URL manually."
echo "To stop serving afterwards: $TAILSCALE serve --https=$PORT off"
echo

# What the manifest advertises to the client, in place of the unroutable LAN IP.
export EXPO_PACKAGER_PROXY_URL="$URL"
export APP_VARIANT=development
exec npx expo start --dev-client
