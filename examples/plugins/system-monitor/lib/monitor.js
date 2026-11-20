import { readFile, readdir, readlink, statfs } from 'node:fs/promises'
import { homedir, availableParallelism, endianness } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const transient = new Set(['ENOENT', 'ESRCH', 'EACCES', 'EPERM'])
const codeOf = error => error.code ?? 'READ_FAILED'
export function parseMemory(text) {
  const fields = Object.fromEntries([...text.matchAll(/^(\w+):\s+(\d+)\s+kB/gm)].map(([, name, value]) => [name, Number(value) * 1024]))
  if (!fields.MemTotal || fields.MemAvailable === undefined) throw Error('Invalid memory counters')
  return { total: fields.MemTotal, available: fields.MemAvailable, used: fields.MemTotal - fields.MemAvailable,
    swapTotal: fields.SwapTotal ?? 0, swapUsed: (fields.SwapTotal ?? 0) - (fields.SwapFree ?? 0) }
}
export function parseCpu(text) {
  const fields = text.match(/^cpu\s+(.+)$/m)?.[1].trim().split(/\s+/).map(Number)
  if (!fields || fields.length < 4) throw Error('Invalid CPU counters')
  // guest counters are already included in user/nice; do not count them twice.
  return { total: fields.slice(0, 8).reduce((a, b) => a + b, 0), idle: fields[3] + (fields[4] ?? 0) }
}
export function parseProcess(text, status) {
  const end = text.lastIndexOf(')')
  const fields = text.slice(end + 2).trim().split(/\s+/)
  return { pid: Number(text.slice(0, text.indexOf(' '))), name: text.slice(text.indexOf('(') + 1, end),
    state: fields[0], ppid: Number(fields[1]), ticks: Number(fields[11]) + Number(fields[12]), start: fields[19],
    memory: Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1] ?? 0) * 1024 }
}
export function parseEndpoint(raw, ipv6, byteOrder = endianness()) {
  const [hex, port] = raw.split(':')
  const decode = value => {
    const bytes = Buffer.from(value, 'hex')
    return byteOrder === 'LE' ? bytes.reverse() : bytes
  }
  const address = ipv6
    ? new URL('http://[' + hex.match(/.{8}/g).map(word => decode(word).toString('hex').match(/.{4}/g).join(':')).join(':') + ']').hostname.slice(1, -1)
    : [...decode(hex)].join('.')
  return { address, port: parseInt(port, 16) }
}
export function parseSockets(text, protocol, ipv6 = false) {
  return text.trim().split('\n').slice(1).flatMap(line => {
    const fields = line.trim().split(/\s+/)
    if (protocol === 'TCP' && fields[3] !== '0A') return []
    const local = parseEndpoint(fields[1], ipv6)
    if (local.port === 0) return []
    return [{ protocol, ...local, inode: fields[9], owners: [] }]
  })
}
export class SystemMonitor {
  constructor({ proc = '/proc', diskPath = homedir(), registry = join(process.env.DSH_SVC_HOME || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-go', 'services'), 'services.json'), clock = () => performance.now(), hz } = {}) {
    Object.assign(this, { proc, diskPath, registry, clock, hz })
    this.previousProcesses = new Map()
    this.cache = new Map()
  }
  async initialize() {
    if (this.hz !== undefined) return
    try { this.hz = Number((await exec('getconf', ['CLK_TCK'], { timeout: 2000 })).stdout.trim()) }
    catch (error) { this.hz = null; this.hzError = codeOf(error) }
  }
  cached(key, duration, read) {
    const old = this.cache.get(key)
    if (old && (old.pending || this.clock() - old.time < duration)) return old.value
    const item = { pending: true, time: this.clock() }
    item.value = read().then(value => { item.pending = false; item.time = this.clock(); return value }, error => { this.cache.delete(key); throw error })
    this.cache.set(key, item)
    return item.value
  }
  async processes() {
    const pids = (await readdir(this.proc)).filter(name => /^\d+$/.test(name))
    const rows = []
    let hidden = 0
    for (let offset = 0; offset < pids.length; offset += 16) await Promise.all(pids.slice(offset, offset + 16).map(async pid => {
      try {
        const [stat, status] = await Promise.all([readFile(join(this.proc, pid, 'stat'), 'utf8'), readFile(join(this.proc, pid, 'status'), 'utf8')])
        rows.push(parseProcess(stat, status))
      } catch (error) {
        if (!transient.has(error.code)) throw error
        if (error.code === 'EACCES' || error.code === 'EPERM') hidden++
      }
    }))
    return { rows, hidden }
  }
  resources() { return this.cached('resources', 1000, () => this.readResources()) }
  async readResources() {
    const issues = []
    const read = async (area, task) => {
      try { return await task() } catch (error) { issues.push({ area, code: codeOf(error) }); return null }
    }
    const [memory, cpu, disk, processes] = await Promise.all([
      read('memory', async () => parseMemory(await readFile(join(this.proc, 'meminfo'), 'utf8'))),
      read('cpu', async () => parseCpu(await readFile(join(this.proc, 'stat'), 'utf8'))),
      read('disk', async () => { const fs = await statfs(this.diskPath); return { path: this.diskPath, total: fs.blocks * fs.bsize, used: (fs.blocks - fs.bfree) * fs.bsize, available: fs.bavail * fs.bsize } }),
      read('processes', () => this.processes()),
    ])
    const now = this.clock(), elapsed = this.previousTime === undefined ? null : (now - this.previousTime) / 1000
    let cpuPercent = null
    if (cpu && this.previousCpu && cpu.total > this.previousCpu.total) cpuPercent = 100 * (1 - (cpu.idle - this.previousCpu.idle) / (cpu.total - this.previousCpu.total))
    const rows = (processes?.rows ?? []).map(row => {
      const old = this.previousProcesses.get(row.pid)
      const cpu = elapsed > 0 && this.hz > 0 && old?.start === row.start ? Math.max(0, (row.ticks - old.ticks) / this.hz / elapsed * 100) : null
      return { ...row, cpu }
    })
    this.previousCpu = cpu
    this.previousTime = now
    this.previousProcesses = new Map(rows.map(row => [row.pid, row]))
    const processCpu = processes && elapsed > 0 && this.hz > 0 ? rows.reduce((sum, row) => sum + (row.cpu ?? 0), 0) : null
    if (this.hzError) issues.push({ area: 'processCpu', code: this.hzError })
    return { sampledAt: new Date().toISOString(), cores: availableParallelism(), cpu: cpuPercent, processCpu, memory, disk,
      processes: rows.map(({ ticks, start, ...row }) => row), hidden: processes?.hidden ?? 0, issues }
  }
  ports() { return this.cached('ports', 5000, () => this.readPorts()) }
  async readPorts() {
    const issues = [], sockets = []
    let tables = 0
    for (const [file, protocol, ipv6] of [['tcp', 'TCP', false], ['tcp6', 'TCP', true], ['udp', 'UDP', false], ['udp6', 'UDP', true]]) {
      try { sockets.push(...parseSockets(await readFile(join(this.proc, 'net', file), 'utf8'), protocol, ipv6)); tables++ }
      catch (error) { issues.push({ area: file, code: codeOf(error) }) }
    }
    let hidden = 0
    if (sockets.length) {
      const { rows, hidden: unreadable } = await this.processes()
      hidden += unreadable
      const inodes = new Map()
      for (const socket of sockets) {
        if (!inodes.has(socket.inode)) inodes.set(socket.inode, [])
        inodes.get(socket.inode).push(socket)
      }
      for (const row of rows) {
        try {
          const path = join(this.proc, String(row.pid), 'fd')
          const owned = new Set()
          for (const fd of await readdir(path)) {
            try { const inode = (await readlink(join(path, fd))).match(/^socket:\[(\d+)\]$/)?.[1]; if (inode && inodes.has(inode)) owned.add(inode) }
            catch (error) { if (!transient.has(error.code)) throw error }
          }
          for (const inode of owned) for (const socket of inodes.get(inode)) socket.owners.push({ pid: row.pid, name: row.name })
        } catch (error) { if (!transient.has(error.code)) throw error; if (error.code === 'EACCES' || error.code === 'EPERM') hidden++ }
      }
    }
    let registered = [], registryIssue = null
    try {
      const definitions = JSON.parse(await readFile(this.registry, 'utf8'))
      registered = definitions.filter(service => service.url).map(service => {
        const url = new URL(service.url)
        return { name: service.name, address: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) }
      })
    } catch (error) { if (error.code !== 'ENOENT') registryIssue = codeOf(error) }
    sockets.sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol) || a.address.localeCompare(b.address))
    return { sampledAt: new Date().toISOString(), available: tables > 0, partial: tables > 0 && issues.some(issue => issue.code !== 'ENOENT'),
      sockets: sockets.map(({ inode, ...socket }) => socket), hidden, registered, registryIssue, issues }
  }
}
