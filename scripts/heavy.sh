#!/usr/bin/env bash
# Mutex wrapper for heavy commands on this memory-constrained machine.
#
#   scripts/heavy.sh <command...>
#
# Only one wrapped command runs at a time across all shells/agents. The lock is
# the directory .cache/heavy.lock (atomic mkdir) holding the owner's PID.
# Waits (polling every 3s, up to 25 min), steals the lock when the recorded
# owner is dead, releases on exit/INT/TERM, and exits with the command's code.
set -u

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/heavy.sh <command...>" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="${HEAVY_LOCK_DIR:-$ROOT/.cache/heavy.lock}"
PID_FILE="$LOCK_DIR/pid"
POLL_SECONDS="${HEAVY_POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${HEAVY_MAX_WAIT_SECONDS:-1500}"

mkdir -p "$(dirname "$LOCK_DIR")"

child=""
have_lock=0

release() {
  if [ "$have_lock" -eq 1 ] && [ "$(cat "$PID_FILE" 2>/dev/null)" = "$$" ]; then
    rm -rf "$LOCK_DIR"
  fi
  have_lock=0
}

on_signal() {
  local sig="$1" code="$2"
  if [ -n "$child" ] && kill -0 "$child" 2>/dev/null; then
    kill "-$sig" "$child" 2>/dev/null
    wait "$child" 2>/dev/null
  fi
  exit "$code" # EXIT trap releases the lock
}

trap release EXIT
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM
trap 'on_signal HUP 129' HUP

# Remove the lock only if it still belongs to the (dead or missing) owner we
# observed. The rename is atomic, so two waiters cannot both steal it.
steal() {
  local expected="$1" grave="$LOCK_DIR.stale.$$"
  mv "$LOCK_DIR" "$grave" 2>/dev/null || return 0
  if [ "$(cat "$grave/pid" 2>/dev/null)" = "$expected" ]; then
    rm -rf "$grave"
  else
    # Someone else acquired it between our check and the rename: give it back.
    mv "$grave" "$LOCK_DIR" 2>/dev/null || rm -rf "$grave"
  fi
}

waited=0
empty_polls=0
announced=0
while :; do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" >"$PID_FILE"
    have_lock=1
    break
  fi

  owner="$(cat "$PID_FILE" 2>/dev/null)"
  if [ -z "$owner" ]; then
    # Owner may be between mkdir and writing its PID; tolerate one poll.
    empty_polls=$((empty_polls + 1))
    if [ "$empty_polls" -ge 2 ]; then
      echo "heavy.sh: stealing lock with no owner PID" >&2
      steal ""
      empty_polls=0
      continue
    fi
  else
    empty_polls=0
    if ! kill -0 "$owner" 2>/dev/null; then
      echo "heavy.sh: stealing stale lock from dead PID $owner" >&2
      steal "$owner"
      continue
    fi
  fi

  if [ "$waited" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "heavy.sh: timed out after ${waited}s waiting for lock held by PID ${owner:-unknown}" >&2
    exit 75
  fi
  if [ "$announced" -eq 0 ]; then
    echo "heavy.sh: waiting for lock held by PID ${owner:-unknown}..." >&2
    announced=1
  fi
  sleep "$POLL_SECONDS"
  waited=$((waited + POLL_SECONDS))
done

# Run in the background (keeping stdin) so signal traps fire while it runs.
"$@" <&0 &
child=$!
wait "$child"
code=$?
child=""
exit "$code"
