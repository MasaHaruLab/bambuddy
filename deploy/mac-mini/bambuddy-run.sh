#!/bin/bash
# launchd wrapper: start bambuddy through `ssh localhost` so the server runs as
# a child of sshd instead of the launchd GUI agent.
#
# Why: macOS Local Network privacy silently denies LAN access to this
# LaunchAgent's own children (every printer connect gets EHOSTUNREACH), while
# sshd-spawned processes are allowed — verified 2026-08-03 on this machine,
# evidence in 打印机管家/进度与证据.md. There is no supported CLI to grant the
# permission headlessly, so the service rides the sshd exemption instead.
#
# launchd sees this script as the service: the ssh client stays in the
# foreground as long as the remote uvicorn lives, so KeepAlive restart
# semantics still work.
#
# The server command itself lives in bambuddy-remote.sh — NOT inlined here —
# because the ssh client's argv would otherwise contain the server command
# line, and the remote script's own cleanup pkill (same host!) would match and
# kill the ssh session it rode in on.
#
# No -tt: under launchd stdin is /dev/null, a forced TTY reads EOF at once and
# hangs up the remote process. Without a TTY the ssh client just waits on the
# remote; a killed ssh client leaves an orphan uvicorn, which the remote
# script's pkill reaps on the next start.

exec /usr/bin/ssh -n -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 localhost \
  'bash "$HOME/bambuddy/bin/bambuddy-remote.sh"'
