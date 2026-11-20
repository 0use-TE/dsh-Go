# System monitor

[中文](README.md)

One Web resource panel for DSH Ha / dsh-Go, showing CPU, memory, storage and processes readable from the current Ubuntu / Linux environment. No APK changes, extra npm dependencies or background collector. Uses host theme and Chinese / English locale settings.

## Features and scope

- The panel directly displays CPU, memory, storage and Processes, refreshing every two seconds. Click CPU or memory column headings to sort up to 12 processes. No process termination controls.
- System CPU uses consecutive `/proc/stat` samples. When restricted, it sums CPU-time differences for visible processes, with 100% per fully utilized core; multi-core workloads can exceed 100%. The first sample shows a dash; scope is available in a tooltip. Process start times distinguish reused PIDs.
- Memory comes from device `/proc/meminfo`, with usage calculated as `MemTotal - MemAvailable`. Reclaimable cache is not all counted as used. Storage uses `statfs` for the filesystem containing the Ubuntu home directory; filesystem capacity is not Ubuntu's own file usage.
- No Ports tab, refresh-frequency labels or auxiliary scope notes. PID and metric meanings are tooltips. Body text and process rows are 16px; major values are 24px. No socket collection or service registry reads.
- Android PRoot does not grant actual system root privileges. Unavailable measurements remain unknown, never zero usage. Coverage is the current Ubuntu-visible environment, not necessarily Termux or other Android apps. No command lines, environment variables or credentials are read.
- Read-only requests use existing DSH authentication / origin checks and coalesce with a one-second cache. No periodic collection while the UI is closed.

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

Tests cover counters, PID reuse, caching, restricted reads and authentication boundaries. Device capabilities depend on actual OS access.
