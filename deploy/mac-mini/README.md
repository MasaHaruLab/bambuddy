# Mac mini deployment (launchd, no Docker / no Homebrew / no sudo)

Resident service for a headless Mac mini (macOS 15). Files here are the live
copies of what runs on the mini; installation is:

```
cp bambuddy-run.sh bambuddy-remote.sh bambuddy-keepalive.sh ~/bambuddy/bin/
chmod +x ~/bambuddy/bin/*.sh
cp com.zhekou.bambuddy*.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.zhekou.bambuddy.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.zhekou.bambuddy-keepalive.plist
```

## Why the ssh-localhost wrapper

macOS Local Network privacy silently denies LAN access to processes spawned by
a LaunchAgent (every printer connect fails with `EHOSTUNREACH` / errno 65),
and there is no supported CLI to grant the permission on a headless machine.
Children of sshd are allowed, so `bambuddy-run.sh` starts the real server
through `ssh localhost` (requires the machine's own key in its
`authorized_keys`). launchd supervises the ssh client; KeepAlive still works.

## Why the external keepalive watchdog

A long-running process on this machine can drop into a *permanent*
`EHOSTUNREACH` state toward a LAN peer after a network hiccup — new connect()
calls fail forever while a fresh process connects instantly, and established
TCP sessions keep working. bambuddy's in-process recovery watchdog probes from
inside the poisoned process, so it misdiagnoses the printer as offline and
never recovers. `bambuddy-keepalive.sh` runs fresh every 60 s (launchd
StartInterval): if bambuddy reports disconnected while a fresh probe reaches
the printer's MQTT port twice in a row, it kickstarts the service.

## Traps encoded in these scripts (do not simplify them away)

- `pkill -f` self-match, twice over: the pattern is written `[u]vicorn` so it
  cannot match its own argv, and the server command lives in
  `bambuddy-remote.sh` as a file because inlining it put the string into the
  local ssh client's argv — on localhost the remote pkill then killed its own
  ssh session.
- No `-tt` on ssh: under launchd stdin is /dev/null; a forced TTY reads EOF
  immediately and hangs up the remote server.
- `PATH` must include `~/bin` (static ffmpeg lives there; bambuddy only
  searches PATH plus a fixed list that does not include it). Handled inside
  `bambuddy-remote.sh`.
- The keepalive script reads the printer IP from the API but extracts only
  that one field — the payload also carries the access code and must never be
  logged wholesale. When auth is enabled the watchdog needs an API token
  (flagged in the project HANDOFF).
