import { fileURLToPath } from 'node:url'
import { locations, ServiceError } from './paths.js'
import { ServiceManager } from './manager.js'
import { listen } from './rpc.js'
import { API, webHandler } from './web.js'

export const name = 'local-services'
export function agentPrompt(cli = fileURLToPath(new URL('../bin/dsh-svc.mjs', import.meta.url)), en = false) {
  const command = `node '${cli.replaceAll("'", "'\"'\"'")}'`
  const network = en
    ? 'Record configured TCP/UDP listeners with --listen tcp://HOST:PORT or --listen udp://HOST:PORT (repeatable), including non-HTTP services such as SSH and Redis. For an existing service, listen NAME ADDRESS... updates this metadata without restarting it; listen NAME --clear removes it. Use --url only for local HTTP readiness, never invent an HTTP URL for a non-HTTP service.'
    : '按服务实际配置使用 --listen tcp://主机:端口 或 --listen udp://主机:端口 登记监听地址，可重复，包括 SSH、Redis 等非 HTTP 服务。已有服务使用 listen 名称 地址... 更新地址记录，不会重启服务；listen 名称 --clear 清空记录。--url 只用于本机 HTTP 就绪检测，不要给非 HTTP 服务编造 HTTP 地址。'
  return en
    ? `Use the registered service manager for long-running web or background services in this DSH host. CLI: ${command}. Run --help first. ${network} Start with: start NAME --cwd ABSOLUTE_DIR [--url http://127.0.0.1:PORT] [--autostart] -- PROGRAM ARGS. Registration and startup are one operation. Do not use nohup, &, daemon flags, systemctl enable, or a temporary terminal to host these services. Use list/logs/stop/restart/autostart/remove to manage them. Check actual process and HTTP states; report failures honestly. Before changing a running command, stop it. Keep secrets in the service's own private configuration files, not command arguments. Autostart means engine/plugin load, not Android boot. Only enable it when requested. Temporary build/test commands can still use the normal terminal.`
    : `在当前 DSH 主机中，需要持续运行的 Web／后台服务必须通过服务管理器登记并启动。命令入口：${command}。先运行 --help。${network}启动格式：start 名称 --cwd 绝对目录 [--url http://127.0.0.1:端口] [--autostart] -- 程序 参数。登记与启动是一步；不要用 nohup、&、后台化参数、systemctl enable 或临时终端承载这些服务。用 list、logs、stop、restart、autostart、remove 管理。根据实际进程和 HTTP 状态判断是否启动成功，失败要如实报告。修改运行中的命令前先停止。密钥放在服务自己的私有配置文件中，不写进命令参数。自启指随引擎／插件加载启动，不是 Android 开机；仅在用户要求时开启。临时构建和测试命令仍可用普通终端。`
}

export async function apply(ctx, options = {}) {
  // Cordis accepts only an effect disposer (or void), not a runtime object.
  await createPlugin(ctx, options)
}

export async function createPlugin(ctx, options = {}) {
  const paths = { ...locations(), ...options }
  const manager = new ServiceManager(paths)
  let server, startupError = ''
  try {
    if (process.platform !== 'linux') throw new ServiceError('UNSUPPORTED_PLATFORM', '服务管理当前支持 Android Ubuntu 和 Linux 主机。')
    await manager.load()
    server = await listen(manager, paths.socket)
    await manager.autostart()
  } catch (error) {
    startupError = `${error.code ?? 'LOAD_FAILED'}: ${error.message}`
    await manager.close()
  }
  ctx.inject(['webServer'], inner => {
    const handler = webHandler(manager, {
      rejection: req => {
        const connection = inner.get('connection')
        return connection === undefined ? 503 : connection.requestRejection(req)
      },
      prompt: en => agentPrompt(undefined, en),
      startupError,
    })
    inner.effect(() => inner.get('webServer').register({ kind: 'prefix', path: API, handler }))
  })
  let closing
  const close = () => closing ??= (async () => {
    const closed = server?.close()
    await manager.close()
    await closed
  })()
  ctx.effect(() => () => close().catch(error => ctx.logger.error('local-services cleanup failed', error.code)))
  return { manager, close }
}
