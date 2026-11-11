#!/bin/sh
# Prints the Railway start command for the LobeHub service: the official image runs
# railway-start.cjs, unpacked from an inline base64 blob (no build, no extra image).
set -eu
cd "$(dirname "$0")/.."
B64=$(base64 -w0 railway-start.cjs)
printf "/bin/sh -c 'echo %s | base64 -d > /tmp/railway-start.cjs && exec /bin/node /tmp/railway-start.cjs'\n" "$B64"
