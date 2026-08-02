#!/bin/bash
# External MQTT-recovery watchdog for bambuddy.
#
# Why external: after the printer drops off the LAN and returns, macOS leaves
# the long-running bambuddy process permanently unable to reach it (every
# connect gets EHOSTUNREACH) while any FRESH process connects instantly —
# verified 2026-08-03, evidence in 打印机管家/进度与证据.md. bambuddy's own
# in-process watchdog probes from inside the stuck process, so it misreads the
# printer as unreachable and never recovers. Only a process restart heals it.
# This script runs fresh each time (launchd StartInterval), so its probe tells
# the truth.
#
# Logic: bambuddy says disconnected AND a fresh probe reaches the printer's
# MQTT port on 2 consecutive runs (>=2 min stuck) → kickstart the service.
#
# NOTE: reads /api/v1/printers/ unauthenticated. When auth gets enabled this
# needs an API token — revisit then (flagged in HANDOFF).

STATE=/tmp/bambuddy_keepalive_strikes
LOG=/Users/ambrosiazheng/bambuddy/logs/keepalive.log
API=http://127.0.0.1:8140/api/v1

stamp() { date "+%Y-%m-%d %H:%M:%S"; }

# Service not answering at all → launchd KeepAlive owns that case.
STATUS=$(curl -s -m 5 "$API/printers/1/status" 2>/dev/null)
[ -z "$STATUS" ] && { echo 0 > "$STATE"; exit 0; }

CONNECTED=$(printf '%s' "$STATUS" | /usr/bin/python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("connected"))
except Exception: print("parse-error")' 2>/dev/null)

if [ "$CONNECTED" = "True" ]; then
  echo 0 > "$STATE"
  exit 0
fi

# Printer IP from the API (never logged wholesale — the payload carries the
# access code; extract the one field and drop the rest).
IP=$(curl -s -m 5 "$API/printers/" 2>/dev/null | /usr/bin/python3 -c 'import sys,json
try:
    p = json.load(sys.stdin)
    print(p[0]["ip_address"] if p else "")
except Exception: print("")' 2>/dev/null)
[ -z "$IP" ] && exit 0

if ! nc -z -G 3 "$IP" 8883 >/dev/null 2>&1; then
  # Printer genuinely off the network — restarting bambuddy fixes nothing.
  echo 0 > "$STATE"
  exit 0
fi

STRIKES=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$STRIKES" > "$STATE"
echo "$(stamp) disconnected while printer port answers — strike $STRIKES/2" >> "$LOG"

if [ "$STRIKES" -ge 2 ]; then
  echo "$(stamp) restarting bambuddy (stuck-process recovery)" >> "$LOG"
  echo 0 > "$STATE"
  launchctl kickstart -k "gui/$(id -u)/com.zhekou.bambuddy"
fi
