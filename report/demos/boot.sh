#!/usr/bin/env bash
# CM-ADA-01: start the server under the current Node.js release.
set -u

echo "\$ node --version"
node --version
echo
echo "\$ node src/server.js"
timeout 6 node src/server.js 2>&1 | awk '/^ +at / { if (++frames > 6) next } { print }'
code=${PIPESTATUS[0]}
if [ "$code" -eq 124 ]; then
    echo "[still running after 6 s, stopped by the demo]"
else
    echo "[exited with code $code]"
fi
