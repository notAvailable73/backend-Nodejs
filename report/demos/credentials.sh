#!/usr/bin/env bash
# CM-PRE-01: register and log in, then look at what the response bodies and
# the server log reveal.
set -u
source "$(dirname "$0")/lib.sh"

USER_JSON='{"name":"Demo User","email":"demo@example.com","password":"secret123"}'
LOGIN_JSON='{"email":"demo@example.com","password":"secret123"}'

start_server
request "curl -X POST $URL/api/auth/register -d '$USER_JSON'" \
    -X POST -H 'content-type: application/json' -d "$USER_JSON" "$URL/api/auth/register"
request "curl -X POST $URL/api/auth/login -d '$LOGIN_JSON'" \
    -X POST -H 'content-type: application/json' -d "$LOGIN_JSON" "$URL/api/auth/login"
stop_server
show_server_log
