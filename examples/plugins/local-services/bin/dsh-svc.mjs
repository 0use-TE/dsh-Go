#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { locations, ServiceError } from '../lib/paths.js'
import { call } from '../lib/rpc.js'

export const HELP = `dsh-svc — registered services in the current DSH host

  start NAME [--cwd DIR] [--url http://127.0.0.1:PORT] [--autostart] [--session ID] -- PROGRAM [ARGS...]
  start NAME                         Start an existing service
  register NAME --cwd DIR -- PROGRAM [ARGS...]
  list                               Show actual process and HTTP states
  stop NAME | restart NAME
  logs NAME [--bytes 8000] [--follow]
  autostart NAME on|off               Start on the next engine/plugin load
  remove NAME                        Remove a stopped registration and its logs

Always use foreground commands. Do not add nohup, &, or a daemon flag.
Changes use the running plugin; run this command inside the DSH environment.
Output is JSON, except logs. Arguments after -- are passed unchanged, without a shell.
`

export function parse(args, cwd = process.cwd()) {
  const [op, ...rest] = args
  if (!op || ['help', '--help', '-h'].includes(op)) return { help: true }
  if (op === 'list' && rest.length === 0) return { op }
  if (!['start', 'register', 'stop', 'restart', 'logs', 'autostart', 'remove'].includes(op)) throw new ServiceError('INVALID_ARGUMENT', '不支持的命令，请运行 dsh-svc --help。')
  const name = rest.shift()
  if (!name || name.startsWith('-')) throw new ServiceError('INVALID_ARGUMENT', '请提供服务名称。')
  const request = { op, name }
  if (op === 'autostart') {
    if (rest.length !== 1 || !['on', 'off'].includes(rest[0])) throw new ServiceError('INVALID_ARGUMENT', '用法：autostart NAME on|off')
    return { ...request, enabled: rest[0] === 'on' }
  }
  while (rest.length) {
    const option = rest.shift()
    if (option === '--' && ['start', 'register'].includes(op)) { request.argv = rest.splice(0); request.cwd ??= cwd; break }
    if (option === '--autostart' && ['start', 'register'].includes(op)) { request.autoStart = true; continue }
    if (option === '--follow' && op === 'logs') { request.follow = true; continue }
    const key = { '--cwd': 'cwd', '--url': 'url', '--session': 'sessionId', '--bytes': 'bytes' }[option]
    const permitted = op === 'logs' ? key === 'bytes' : ['start', 'register'].includes(op) && ['cwd', 'url', 'sessionId'].includes(key)
    if (!key || !permitted || !rest.length) throw new ServiceError('INVALID_ARGUMENT', `参数无效：${option}`)
    request[key] = rest.shift()
  }
  if (request.argv && request.argv.length === 0) throw new ServiceError('INVALID_ARGUMENT', '-- 后面必须有启动程序。')
  if (op === 'register' && !request.argv) throw new ServiceError('INVALID_ARGUMENT', 'register 必须提供启动程序。')
  if (op === 'start' && !request.argv && ['cwd', 'url', 'sessionId', 'autoStart'].some(key => key in request)) throw new ServiceError('INVALID_ARGUMENT', '修改配置时请提供 -- PROGRAM ARGS；运行中的服务须先停止。')
  if (request.bytes !== undefined && (!/^\d+$/.test(request.bytes) || Number(request.bytes) < 1 || Number(request.bytes) > 32000)) throw new ServiceError('INVALID_ARGUMENT', '--bytes 范围为 1–32000。')
  return request
}

export async function main(args = process.argv.slice(2)) {
  const request = parse(args)
  if (request.help) { process.stdout.write(HELP); return }
  const { socket } = locations()
  if (request.follow) {
    let previous = ''
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      while (!controller.signal.aborted) {
        const { text } = await call(socket, request)
        if (text !== previous) {
          // A bounded snapshot, rather than byte offsets which break on rotation.
          process.stdout.write('\x1b[2J\x1b[H' + text)
          previous = text
        }
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() }
          const timer = setTimeout(done, 1000)
          controller.signal.addEventListener('abort', done, { once: true })
          if (controller.signal.aborted) done()
        })
      }
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
  } else {
    const result = await call(socket, request)
    process.stdout.write(request.op === 'logs' ? result.text : JSON.stringify(result, null, 2) + '\n')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(JSON.stringify({ ok: false, code: error.code ?? 'SERVICE_ERROR', message: error.message }) + '\n'); process.exitCode = 1 })
}
