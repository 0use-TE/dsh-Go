# Client prompt template

Prefer copying the prompt from the Services panel: it includes the plugin's absolute path. For this manual template, replace `<absolute-plugin-path>` with the `local-services` directory inside the current DSH host.

Register and start long-running web or background services using the local service manager. Entry: `node '<absolute-plugin-path>/bin/dsh-svc.mjs'`. Run `--help` first.

1. Use `start NAME --cwd ABSOLUTE_DIR [--url http://127.0.0.1:PORT] [--autostart] -- PROGRAM ARGS` to register and start in one operation.
2. Use foreground commands. Do not use `nohup`, `&`, daemon flags, `systemctl enable`, or a temporary terminal to keep services alive.
3. Check the actual process state with `list`, and inspect output with `logs NAME`. If a local HTTP URL is configured, report process and website readiness separately. An accepted start command does not prove that the website is ready.
4. Manage with `stop`, `restart`, `autostart NAME on|off`, and `remove`. Stop before changing configuration. Removal applies only to stopped services and also deletes retained plugin logs.
5. Autostart restores services on DSH engine / plugin load, not Android boot. Enable it only when requested. Manual stopping does not clear autostart; disable it to prevent restoration on the next load.
6. Report failures honestly. After a timeout or disconnect, check `list` before acting again. Do not infer plugin-managed service states from systemd.
7. Arguments and URLs are persisted; output is logged. Keep secrets in the program's private configuration files, out of arguments, URLs and logs.
8. Temporary builds, tests and one-shot commands can use the normal terminal. Do not register every short-lived command as a service.
