# Shared helpers for the demo scripts. Each demo runs inside a checkout of the
# project and prints a transcript: "$ command" followed by what it printed.
# Expects PORT, MONGODB_URI and JWT_SECRET in the environment.

URL="http://127.0.0.1:${PORT:-5055}"
SERVER_LOG=$(mktemp)

start_server() {
    echo "\$ node src/server.js &"
    node src/server.js >"$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    for _ in $(seq 50); do
        curl -s -o /dev/null "$URL/" && return
        kill -0 "$SERVER_PID" 2>/dev/null || return
        sleep 0.2
    done
}

# request <shown command> <curl arguments...>
request() {
    local shown=$1
    shift
    echo
    echo "\$ $shown"
    local body
    body=$(curl -sS -m 3 -w '\n%{http_code}' "$@" 2>&1)
    local status=${body##*$'\n'}
    body=${body%$'\n'*}
    if [ "$status" = "000" ]; then
        echo "$body"
        echo "[no HTTP response]"
    else
        node -e 'try { console.log(JSON.stringify(JSON.parse(process.argv[1]), null, 2)) } catch { console.log(process.argv[1]) }' "$body"
        echo "[HTTP $status]"
    fi
}

check_alive() {
    echo
    echo "\$ kill -0 \$SERVER_PID   # is the server process still running?"
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "yes, still running"
        kill "$SERVER_PID"
        wait "$SERVER_PID" 2>/dev/null
    else
        wait "$SERVER_PID"
        echo "no, it exited with code $?"
    fi
}

# Server output, keeping only the first few stack frames of any trace
show_server_log() {
    echo
    echo "--- server output ---"
    awk '/^ +at / { if (++frames > 4) next } { print }' "$SERVER_LOG"
}

stop_server() {
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
}
