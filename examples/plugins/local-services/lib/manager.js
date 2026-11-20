import { fork } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, readFile, writeFile, rename, stat, open, unlink } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'
import { locations, ServiceError } from './paths.js'

const fail = (code, message) => { throw new ServiceError(code, message) }
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/
const MAX_SERVICES = 50
const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url))
export function serviceName(value) {
  if (typeof value !== 'string' || !NAME.test(value)) fail('INVALID_NAME', '名称须为 1–64 位字母、数字、点、横线或下划线。')
  return value
}
function webAddress(raw) {
  if (!raw) return ''
  let url
  try { url = new URL(raw) } catch { fail('INVALID_URL', '请输入完整的本机 HTTP／HTTPS 地址。') }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    fail('INVALID_URL', '就绪检测仅支持不含凭据的本机 HTTP／HTTPS 地址。')
  }
  return url.href
}
function listenAddresses(values) {
  if (!Array.isArray(values)) fail('INVALID_LISTEN', '监听地址须为数组。')
  return values.map(raw => {
    let url
    try { if (typeof raw !== 'string') throw Error(); url = new URL(raw.includes('://') ? raw : 'tcp://' + raw) }
    catch { fail('INVALID_LISTEN', '监听地址格式为 tcp://主机:端口 或 udp://主机:端口。') }
    if (!['tcp:', 'udp:'].includes(url.protocol) || !url.hostname || !url.port || Number(url.port) < 1 || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      fail('INVALID_LISTEN', '请提供不含凭据或路径的 TCP／UDP 主机与端口。')
    }
    return url.protocol + '//' + url.host
  })
}
function definition(input, old) {
  const name = serviceName(input.name)
  const argv = input.argv ?? old?.argv
  const cwd = input.cwd ?? old?.cwd
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > 128 || argv.some(v => typeof v !== 'string' || v.includes('\0')) || !argv[0]) fail('INVALID_COMMAND', '请提供可执行文件和参数列表。')
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) fail('INVALID_CWD', '工作目录必须是绝对路径。')
  if (input.autoStart !== undefined && typeof input.autoStart !== 'boolean') fail('INVALID_AUTOSTART', '自启选项必须是布尔值。')
  if (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || input.sessionId.length > 256)) fail('INVALID_SESSION', '对话标识无效。')
  return { name, argv, cwd, url: webAddress(input.url ?? old?.url), listen: listenAddresses(input.listen === undefined ? old?.listen ?? [] : input.listen), autoStart: input.autoStart ?? old?.autoStart ?? false,
    sessionId: input.sessionId ?? old?.sessionId ?? '', createdAt: old?.createdAt ?? new Date().toISOString() }
}

function probe(url) {
  return new Promise((resolve) => {
    const request = (url.startsWith('https:') ? https : http).get(url, { agent: false }, (response) => {
      clearTimeout(timer)
      resolve({ health: response.statusCode >= 200 && response.statusCode < 400 ? 'ready' : 'http-error', httpStatus: response.statusCode })
      response.destroy() // Headers are enough, including for streaming endpoints.
    })
    const timer = setTimeout(() => request.destroy(), 600)
    request.once('error', () => { clearTimeout(timer); resolve({ health: 'unreachable', httpStatus: null }) })
  })
}

export class ServiceManager extends EventEmitter {
  constructor({ dir = locations().dir } = {}) {
    super()
    this.dir = dir
    this.definitions = new Map()
    this.runs = new Map()
    this.queue = Promise.resolve()
    this.closed = false
  }
  async load() {
    await mkdir(join(this.dir, 'logs'), { recursive: true, mode: 0o700 })
    let saved
    try { saved = JSON.parse(await readFile(join(this.dir, 'services.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return; throw error }
    if (!Array.isArray(saved)) fail('INVALID_REGISTRY', '服务记录格式错误，请检查 services.json。')
    if (saved.length > MAX_SERVICES) fail('SERVICE_LIMIT', '面板最多支持 50 个服务，请减少 services.json 中的记录。')
    for (const entry of saved) {
      const def = definition(entry, entry)
      if (this.definitions.has(def.name)) fail('INVALID_REGISTRY', '服务记录包含重复名称。')
      this.definitions.set(def.name, def)
    }
  }
  async save() {
    const path = join(this.dir, 'services.json')
    await writeFile(`${path}.tmp`, JSON.stringify([...this.definitions.values()], null, 2) + '\n', { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }
  mutate(action) {
    const result = this.queue.then(() => {
      if (this.closed) fail('MANAGER_CLOSED', '服务管理器已关闭。')
      return action()
    })
    this.queue = result.catch(() => {})
    return result
  }
  get(name) {
    const def = this.definitions.get(serviceName(name))
    if (!def) fail('NOT_FOUND', '服务未注册。')
    return def
  }
  async register(input) {
    const old = this.definitions.get(serviceName(input.name))
    if (!old && this.definitions.size >= MAX_SERVICES) fail('SERVICE_LIMIT', '面板最多支持 50 个服务，请先移除不用的记录。')
    const run = this.runs.get(input.name)
    if (run?.worker) fail('SERVICE_RUNNING', '请先停止服务，再修改启动配置。')
    const def = definition(input, old)
    if (!(await stat(def.cwd)).isDirectory()) fail('INVALID_CWD', '工作目录不是文件夹。')
    this.definitions.set(def.name, def)
    try { await this.save() }
    catch (error) { if (old) this.definitions.set(old.name, old); else this.definitions.delete(def.name); throw error }
    this.emit('change')
    return def
  }
  async start(name) {
    const def = this.get(name)
    if (this.runs.get(name)?.worker) return this.describe(def)
    const log = join(this.dir, 'logs', `${name}.log`)
    // Keep the previous bounded tail across runs, and cap retained output to
    // two files. Rotation during a run is handled by the worker below.
    const worker = fork(workerPath, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] })
    const run = { worker, status: 'starting', pid: null, startedAt: new Date().toISOString(), exitCode: null, signal: null, error: '' }
    this.runs.set(name, run)
    run.done = new Promise((resolve) => worker.once('close', () => {
      run.worker = null
      run.pid = null
      run.status = run.stopping ? 'stopped' : run.error ? 'failed' : run.exitCode === 0 ? 'exited' : 'failed'
      this.emit('change')
      resolve()
    }))
    worker.once('error', (error) => { run.error = error.message; run.status = 'failed'; this.emit('change') })
    await new Promise((resolve, reject) => {
      worker.on('message', (message) => {
        if (message.type === 'started') { run.pid = message.pid; run.status = 'running'; this.emit('change'); resolve() }
        if (message.type === 'failed') { run.error = `${message.code ?? 'START_FAILED'}: ${message.message}`; run.status = 'failed'; reject(new ServiceError('START_FAILED', run.error)) }
        if (message.type === 'exited') { run.exitCode = message.code; run.signal = message.signal }
      })
      worker.once('error', reject)
      worker.once('close', () => reject(new ServiceError('START_FAILED', run.error || '启动进程提前退出。')))
      worker.send({ op: 'start', argv: def.argv, cwd: def.cwd, log }, (error) => { if (error) reject(error) })
    })
    return this.describe(def)
  }
  async stop(name) {
    const def = this.get(name), run = this.runs.get(name)
    if (run?.worker) {
      run.stopping = true
      run.status = 'stopping'
      this.emit('change')
      if (run.worker.connected) run.worker.send({ op: 'stop' }, () => {})
      await run.done
    }
    return this.describe(def)
  }
  describe(def) {
    const run = this.runs.get(def.name)
    return { ...def, status: run?.status ?? 'stopped', pid: run?.pid ?? null, startedAt: run?.startedAt ?? null,
      exitCode: run?.exitCode ?? null, signal: run?.signal ?? null, error: run?.error ?? '', health: 'unchecked', httpStatus: null }
  }
  async list() {
    return Promise.all([...this.definitions.values()].map(async def => {
      const run = this.runs.get(def.name), data = this.describe(def)
      if (data.status === 'running' && def.url) Object.assign(data, await probe(def.url))
      // A process may exit while its HTTP check is in flight.
      if (this.runs.get(def.name) !== run || run?.status !== 'running') Object.assign(data, this.describe(def))
      return data
    }))
  }
  async logs(name, bytes = 8000) {
    this.get(name)
    const path = join(this.dir, 'logs', `${name}.log`)
    let file
    try {
      file = await open(path, 'r')
      const size = (await file.stat()).size
      const count = Math.min(size, Math.max(1, Math.min(Number(bytes) || 8000, 32000)))
      const buffer = Buffer.alloc(count)
      await file.read(buffer, 0, count, Math.max(0, size - count))
      return { name, text: buffer.toString('utf8'), truncated: size > count }
    } catch (error) { if (error.code === 'ENOENT') return { name, text: '', truncated: false }; throw error }
    finally { await file?.close() }
  }
  async execute(request) {
    if (request.op === 'list') return this.list()
    if (request.op === 'logs') return this.logs(request.name, request.bytes)
    return this.mutate(async () => {
      switch (request.op) {
        case 'register': return this.register(request)
        case 'start': {
          if (request.argv) {
            const existing = this.definitions.get(request.name)
            if (this.runs.get(request.name)?.worker) {
              if (JSON.stringify(definition(request, existing)) !== JSON.stringify(existing)) fail('SERVICE_RUNNING', '服务正在运行，修改配置前请先停止。')
            } else await this.register(request)
          }
          return this.start(request.name)
        }
        case 'stop': return this.stop(request.name)
        case 'restart': await this.stop(request.name); return this.start(request.name)
        case 'autostart': {
          const def = this.get(request.name)
          if (typeof request.enabled !== 'boolean') fail('INVALID_AUTOSTART', '自启选项必须是布尔值。')
          const next = { ...def, autoStart: request.enabled }
          this.definitions.set(def.name, next)
          try { await this.save() } catch (error) { this.definitions.set(def.name, def); throw error }
          this.emit('change')
          return next
        }
        case 'listen': {
          const def = this.get(request.name)
          const next = { ...def, listen: listenAddresses(request.listen) }
          this.definitions.set(def.name, next)
          try { await this.save() } catch (error) { this.definitions.set(def.name, def); throw error }
          this.emit('change')
          return this.describe(next)
        }
        case 'remove': {
          const def = this.get(request.name)
          if (this.runs.get(def.name)?.worker) fail('SERVICE_RUNNING', '请先停止服务，再移除记录。')
          // Keep the registration on deletion errors so the user can fix the
          // file problem and retry the same operation.
          for (const suffix of ['', '.1']) await unlink(join(this.dir, 'logs', `${def.name}.log${suffix}`)).catch(error => { if (error.code !== 'ENOENT') throw error })
          this.definitions.delete(def.name)
          try { await this.save() } catch (error) { this.definitions.set(def.name, def); throw error }
          this.runs.delete(def.name)
          this.emit('change')
          return { removed: def.name }
        }
        default: fail('UNKNOWN_OPERATION', '不支持的服务操作。')
      }
    })
  }
  async autostart() {
    for (const def of this.definitions.values()) {
      if (!def.autoStart) continue
      try { await this.mutate(() => this.start(def.name)) }
      catch (error) { this.emit('startupFailure', { name: def.name, code: error.code, message: error.message }) }
    }
  }
  async close() {
    this.closed = true
    await this.queue
    await Promise.all([...this.definitions.keys()].map(name => this.stop(name)))
    this.removeAllListeners()
  }
}
