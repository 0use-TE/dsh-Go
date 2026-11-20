# Local Services

[中文](README.md)

A Web service panel and shared command interface for DSH Ha / dsh-Go. Manages explicitly registered services, without scanning processes or ports. No systemd, extra npm dependencies, or Flutter changes required. The frontend uses the host's React directly, without bundling.

## Features

- Register and start, stop, restart, inspect PID / exit details, and remove stopped services.
- Combined stdout / stderr logs with their own scrollbar, keeping the heading and navigation visible. Logs update every two seconds; the CLI also supports live viewing.
- Optional local HTTP / HTTPS readiness checks distinguish a running process from a responding website. Copy the configured URL.
- Persistent per-service engine / plugin autostart, disabled by default.
- Copy an AI prompt so the AI uses the same registration and management commands.
- Available in conversation details → Plugins. DSH Ha's existing independent-display switch can move it into its own workspace tab. Registers one Services Web tab and no duplicate native panel.
- Opens with a flat service list: one start/stop switch on each row's right. Below the name, an accent lightning icon with “Auto” or a muted play icon with “Manual” indicates autostart. Click the icon or text to toggle autostart directly, without entering details or starting/stopping the service. No separate Running badge. Refresh, Start all, Stop all and Settings are small icons at the top right.
- Click the name or the row's empty area to enter a separate service details view. Overview contains configuration, autostart, restart and removal; Logs displays output. The back arrow returns to the list. Autostart and start/stop controls operate independently without opening details. List items no longer expand inline.
- The gear replaces current content with prompt settings: Show prompt and Copy prompt only. Click the gear again or the back arrow to return to the previous list or details view.
- Uses DSH's locale service for Chinese and English, including live language changes. Body text and service names are 16px, secondary information 14px, and toolbar buttons 40px with 10px icon padding. Rows have horizontal content padding and a gap between hover backgrounds and separators.
- Icons and rows use the host's soft hover and pressed backgrounds, with a separate keyboard focus indicator. Details use capsule tabs and respect reduced motion preferences.
- Services with a configured Web URL show a compact host and port, such as `127.0.0.1:3000`. This is the registered access URL, not a detected bind address. Services without a URL omit it.
- Non-HTTP services can register repeatable `--listen tcp://0.0.0.0:2222` or `--listen udp://0.0.0.0:5353` addresses. The list prefers these, marking UDP explicitly, and falls back to the Web URL when none are registered. Addresses are configuration metadata, not proof of actual socket ownership.
- Both `start` and `register` accept `--listen`. Use `listen NAME ADDRESS...` to update only these records without changing the running PID, command, HTTP checks or autostart; use `listen NAME --clear` to clear them. Bare `HOST:PORT` means TCP, and IPv6 hosts require brackets. Old registrations remain compatible with no listener records.

## Install

Run these commands **inside the Ubuntu / Linux environment hosting the DSH engine**. A separate Termux SSH session is not the app's Ubuntu; enter the correct environment first. Linux, including Android PRoot, is supported; native Windows, iOS and HarmonyOS Node are not.

Copy this complete directory to the following location and keep it there:

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-services"
# Copy the plugin source into "$P" first, then:
node "$P/bin/dsh-svc.mjs" --help
dsh plugin --profile web add "$P"
```

Restart the engine once after installation or migration from the native version, then reopen the plugin tab. Frontend updates use DSH's existing client-module hot reload; without file watching, reload the view. Backend or entry changes require plugin reload or an engine restart. A global `dsh-svc` installation is optional; examples below use the full entry path.

## Have the AI manage services

Open Services, click the gear at the top right inside the plugin, tap Copy prompt, and add the text to the client's custom prompt. Tap Show prompt / Hide prompt to show or hide its content on the same settings page. The button supplies the installed plugin's absolute path. A [prompt template](AGENT-PROMPT.en.md) is also included. The plugin does not modify client prompts automatically.

For example, after creating a service in a project directory, have the AI run:

```sh
node "$P/bin/dsh-svc.mjs" start demo \
  --cwd /root/workspace/demo \
  --url http://127.0.0.1:8080 \
  --autostart -- node server.js
```

`start ... -- PROGRAM ARGS` saves the definition and starts it in one operation. Arguments after the final `--` are passed unchanged, without a shell. Commands must remain in the foreground, for example `node server.js`, `python3 -m http.server 8080`, or `npm run dev -- --host 127.0.0.1`. Do not add `&`, `nohup`, or daemon flags. A program's own use of a shell remains that program's responsibility.

Manage an existing registration by name:

```sh
node "$P/bin/dsh-svc.mjs" list
node "$P/bin/dsh-svc.mjs" stop demo
node "$P/bin/dsh-svc.mjs" start demo
node "$P/bin/dsh-svc.mjs" restart demo
node "$P/bin/dsh-svc.mjs" logs demo --follow
node "$P/bin/dsh-svc.mjs" autostart demo off
node "$P/bin/dsh-svc.mjs" listen sshd tcp://0.0.0.0:2222
node "$P/bin/dsh-svc.mjs" listen sshd --clear
node "$P/bin/dsh-svc.mjs" stop demo
node "$P/bin/dsh-svc.mjs" remove demo
```

To save without starting, use `register NAME --cwd DIR [--url URL] [--autostart] -- PROGRAM ARGS`. Stop before changing configuration, then use `register` or a complete `start` command. Starting an already running service does not duplicate it; changing a running command fails. Except for logs and help, output is JSON. Failures exit with status 1 and a `code` / `message`. After a timeout or disconnect, check the actual state with `list`.

## Autostart and lifecycle

This Ubuntu is a PRoot userland; the app's engine launch does not start systemd. `systemctl enable` does not configure this plugin. Use the service's foreground command and the plugin's autostart switch.

- Hide the panel, switch chats, or close a terminal: services keep running.
- Disable autostart: changes the next load, without stopping the current process.
- Manually stop: stops the current process without changing autostart.
- Normally unload / disable the plugin or stop the engine: the plugin stops its managed services.
- Start the engine and load the plugin again: services with autostart enabled are restored. Registration / restoration failures remain errors, rather than being presented as running.
- When a service exits, its exit state is retained. This version does not restart crashes, import systemd `.service` files, or adopt existing processes.

**This is not Android boot autostart.** Services need a running engine. Continued background operation is not guaranteed after Android kills the entire app / PRoot. Process-group cleanup is tested locally on Linux and on an Android PRoot device. Daemons that deliberately escape their process group are unsupported.

HTTP checks accept only `localhost`, `127.0.0.1`, or `[::1]` URLs without URL credentials, with a 600 ms timeout. Status 200–399 means ready. Redirects are not followed and URLs are not discovered automatically. Non-HTTP services still show their actual process state. A responding URL does not establish that the registered process owns that endpoint.

## Data and scope

- Definitions: `${DSH_HOME:-$HOME/.dsh}/dsh-go/services/services.json`, up to 50 services.
- Logs: `logs/NAME.log` and one rotated `.log.1` file below that directory, each at most 1 MiB. Removing a service deletes its definition and both logs.
- Panel: approximately the last 2000 characters. CLI: last 8000 bytes by default; `--bytes` accepts 1–32000, and `--follow` refreshes the latest tail once a second.
- Chats share the current host's service list. `--session ID` records provenance only; it does not restrict other chats' access.
- CLI requests use a local Unix socket with mode `0600`; no extra TCP management port.
- Services inherit the engine environment and run as its user, without privilege isolation. Arguments, directory and URL are persisted, and output is logged. Keep secrets out of arguments, URLs and logs; use the service's own private configuration files.
- `DSH_SVC_HOME` overrides the data directory; plugin and CLI must use the same value. Separate Termux services, system services and firewall management are outside this plugin's scope.

Uninstall: `dsh plugin --profile web remove local-services`. Data remains available for reinstalling. To delete it, first remove stopped registrations, then delete the plugin directory.

## Development checks

From the repository root, using Linux Node.js 22.19+:

```sh
node --test examples/plugins/local-services/test/*.test.js
node --check examples/plugins/local-services/lib/client.js
```

Tests create temporary directories and real child processes for HTTP, group stopping, manager-crash cleanup, autostart restoration, log rotation, CLI / RPC, Web authorization and bulk operations. Process management has been verified on an Android 15 / arm64 PRoot device. Browser checks also cover layout, start/stop, autostart, logs, prompts and bulk controls. The actual tablet layout still needs on-device inspection.

The Web entry registers in `sidebar.right.pane.tab` using the existing Web-plugin loader. Data and operations use the same-origin `/local-services/v1/` endpoints, authorized through the engine's `connection.requestRejection()`, without another listening port. The frontend cannot register arbitrary commands; registration still uses the local CLI. Each view retains its own list, details and settings screen, while service configuration remains shared on the host.

The service list shows autostart status; the corresponding service details let you change it. Changes persist immediately without starting or stopping the current service. Prompt settings contain no service configuration.
