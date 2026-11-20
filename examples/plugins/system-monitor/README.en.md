# System monitor

[中文](README.md)

One Web plugin tab for DSH Ha / dsh-Go, showing resources, processes and sockets readable from the current Ubuntu / Linux environment. No APK changes, extra npm dependencies or background collector. Uses host theme and Chinese / English locale settings.

## Features and scope

- Resources refresh every two seconds: CPU, memory, storage and up to 12 visible processes, sorted by CPU or RSS memory. No process termination controls.
- System CPU uses consecutive `/proc/stat` samples. When restricted, Ubuntu CPU sums CPU-time differences for visible processes, with 100% per fully utilized core; multi-core workloads can exceed 100%. The first sample remains pending. Process start times distinguish reused PIDs.
- Memory comes from device `/proc/meminfo`, with usage calculated as `MemTotal - MemAvailable`. Reclaimable cache is not all counted as used. Storage uses `statfs` for the filesystem containing the Ubuntu home directory; filesystem capacity is not Ubuntu's own file usage.
- Ports refresh every five seconds: readable TCP listeners, bound UDP sockets, IPv4 / IPv6 addresses and owner PID / name confirmed through process file descriptors. No full command lines, environment variables, credentials, remote port scans or firewall changes.
- Android PRoot does not grant actual system root privileges. Restricted `/proc/stat`, `/proc/net/*` or process access is clearly reported, never presented as zero usage or an empty socket table. Coverage is the current Ubuntu-visible environment, not necessarily Termux or other Android apps.
- When Services is installed, registered addresses from the same `DSH_HOME` / `DSH_SVC_HOME` appear separately as unconfirmed listeners. System monitor also works independently, without a running Services plugin or any service start/stop actions.
- Read-only endpoints use existing DSH authentication / origin checks. Concurrent requests coalesce, with one-second resource and five-second socket caches. No periodic collection while the UI is closed.

## Install

Copy the complete plugin directory inside the Ubuntu / Linux environment that actually hosts DSH, then run:

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/system-monitor"
dsh plugin --profile web add "$P"
```

Reload the plugin or restart the engine once after first installation. Find the panel under conversation details → Plugins, or use DSH Ha's existing independent-display switch. Frontend updates use host client hot reload; backend collector updates require plugin reload or an engine restart.

## Validation

```sh
npm run check
npm test
```

Tests cover counters, PID reuse, IPv4 / IPv6, listener filtering, socket owners, restricted reads and authentication boundaries. Device capabilities depend on actual OS access.
