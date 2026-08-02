#!/bin/bash
# Remote half of the bambuddy launchd wrapper — executed via `ssh localhost`.
#
# Kept in a file so the ssh client's argv carries only this path: with the
# command inlined, the client argv contained the literal server command line,
# and the pkill below matched and killed its own ssh session (both live on the
# same host). The bracket trick protects this script's bash; the file split
# protects the ssh client.

pkill -f "[u]vicorn backend.app.main" 2>/dev/null
sleep 1
cd "$HOME/bambuddy" || exit 1
PATH="$HOME/bin:$PATH" PYTHONUNBUFFERED=1 \
  exec .venv/bin/python -u -m uvicorn backend.app.main:app \
    --host 0.0.0.0 --port 8140
