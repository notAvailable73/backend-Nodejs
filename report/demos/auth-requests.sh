#!/usr/bin/env bash
# CM-COR-01: send unauthenticated requests to a protected route and check
# whether the server survives them.
set -u
source "$(dirname "$0")/lib.sh"

start_server
request "curl $URL/api/auth/profile" "$URL/api/auth/profile"
request "curl --cookie token=not-a-jwt $URL/api/auth/profile" --cookie token=not-a-jwt "$URL/api/auth/profile"
check_alive
show_server_log
