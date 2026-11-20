import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import dgram from 'node:dgram'
import { SystemMonitor, parseMemory, parseCpu, parseProcess, parseEndpoint, parseSockets } from '../lib/monitor.js'

const memory = 'MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 400 kB\nSwapTotal: 200 kB\nSwapFree: 150 kB\n'
const stat = (pid, ticks = 100, start = 1, name = 'node (worker)') => {
  const fields = Array(22).fill('0')
  fields[0] = 'S'; fields[1] = '1'; fields[11] = String(ticks); fields[19] = String(start)
  return `${pid} (${name}) ${fields.join(' ')}`
}
const table = (...rows) => 'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n' + rows.join('\n') + '\n'
const socket = (local, state = '0A', inode = '123') => `0: ${local} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode}`
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'system-monitor-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const proc = join(root, 'proc'), registry = join(root, 'services.json')
  await mkdir(join(proc, 'net'), { recursive: true })
  await mkdir(join(proc, '42', 'fd'), { recursive: true })
  await writeFile(join(proc, '42', 'stat'), stat(42))
  await writeFile(join(proc, '42', 'status'), 'VmRSS: 10 kB\n')
  await writeFile(join(proc, 'meminfo'), memory)
  await writeFile(join(proc, 'stat'), 'cpu 100 0 100 800 0 0 0 0 50 0\n')
  let now = 1000
  return { root, proc, registry, monitor: new SystemMonitor({ proc, registry, diskPath: root, hz: 100, clock: () => now }), tick: value => { now = value } }
}
test('memory excludes reclaimable cache and CPU does not double-count guest time', () => {
  assert.deepEqual(parseMemory(memory), { total: 1024000, available: 409600, used: 614400, swapTotal: 204800, swapUsed: 51200 })
  assert.deepEqual(parseCpu('cpu 100 0 100 800 10 20 30 40 50 60\n'), { total: 1100, idle: 810 })
  assert.equal(parseProcess(stat(42), 'VmRSS: 10 kB').name, 'node (worker)')
})
test('CPU samples, cache coalescing and PID reuse keep measurements honest', async t => {
  const { proc, monitor, tick } = await fixture(t)
  assert.equal(monitor.resources(), monitor.resources())
  const first = await monitor.resources()
  assert.equal(first.cpu, null)
  assert.equal(first.processCpu, null)
  assert.equal(first.processes[0].cpu, null)
  await writeFile(join(proc, 'stat'), 'cpu 300 0 100 1000 0 0 0 0\n')
  await writeFile(join(proc, '42', 'stat'), stat(42, 300))
  tick(3000)
  const second = await monitor.resources()
  assert.equal(second.cpu, 50)
  assert.equal(second.processCpu, 100)
  assert.equal(second.processes[0].memory, 10240)
  assert.ok(second.disk.available > 0)
  assert.equal('ticks' in second.processes[0], false)
  tick(5000)
  await writeFile(join(proc, '42', 'stat'), stat(42, 900, 999))
  assert.equal((await monitor.resources()).processes[0].cpu, null, 'reused PID is a new process')
})
test('IPv4/IPv6 wildcard and loopback decoding; TCP connections are not listeners', () => {
  assert.deepEqual(parseEndpoint('0100007F:0BB8', false, 'LE'), { address: '127.0.0.1', port: 3000 })
  assert.deepEqual(parseEndpoint('00000000:0050', false, 'LE'), { address: '0.0.0.0', port: 80 })
  assert.deepEqual(parseEndpoint('00000000000000000000000001000000:01BB', true, 'LE'), { address: '::1', port: 443 })
  assert.deepEqual(parseEndpoint('00000000000000000000000000000000:0050', true, 'LE'), { address: '::', port: 80 })
  assert.equal(parseEndpoint('7F000001:0050', false, 'BE').address, '127.0.0.1')
  const entries = parseSockets(table(socket('0100007F:0BB8'), socket('0100007F:0BB9', '01')), 'TCP')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].port, 3000)
  assert.equal(parseSockets(table(socket('00000000:14E9', '07')), 'UDP')[0].port, 5353)
})
test('socket owners come from fd inodes; registered URLs stay separate and exclude credentials', async t => {
  const { proc, registry, monitor } = await fixture(t)
  await writeFile(join(proc, 'net', 'tcp'), table(socket('00000000:0BB8')))
  for (const file of ['tcp6', 'udp', 'udp6']) await writeFile(join(proc, 'net', file), table())
  await symlink('socket:[123]', join(proc, '42', 'fd', '5'))
  await symlink('socket:[123]', join(proc, '42', 'fd', '6'))
  await writeFile(registry, JSON.stringify([{ name: 'configured', url: 'https://user:secret@127.0.0.1/path?key=secret', argv: ['secret'] }]))
  const ports = await monitor.ports()
  assert.equal(ports.available, true)
  assert.equal(ports.partial, false)
  assert.deepEqual(ports.sockets[0].owners, [{ pid: 42, name: 'node (worker)' }])
  assert.deepEqual(ports.registered, [{ name: 'configured', address: '127.0.0.1', port: 443 }])
  assert.equal(JSON.stringify(ports).includes('secret'), false)
})
test('unavailable counters and socket tables do not become zero values or empty success', async t => {
  const { proc, monitor } = await fixture(t)
  await rm(join(proc, 'stat'))
  const resource = await monitor.resources()
  assert.equal(resource.cpu, null)
  assert.ok(resource.issues.some(issue => issue.area === 'cpu' && issue.code === 'ENOENT'))
  const ports = await monitor.ports()
  assert.equal(ports.available, false)
  assert.equal(ports.issues.length, 4)
  assert.deepEqual(ports.registered, [])
  assert.equal(ports.registryIssue, null)
})
test('real Linux TCP/UDP sockets map to the actual owner process', { skip: process.platform !== 'linux' }, async t => {
  const tcp = net.createServer(), udp = dgram.createSocket('udp4')
  await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve))
  await new Promise(resolve => udp.bind(0, '0.0.0.0', resolve))
  t.after(async () => { await new Promise(resolve => tcp.close(resolve)); udp.close() })
  const { root } = await fixture(t)
  const monitor = new SystemMonitor({ registry: join(root, 'absent'), hz: 100 })
  const ports = await monitor.ports()
  if (!ports.available && ports.issues.every(issue => issue.code === 'EACCES' || issue.code === 'EPERM')) { t.skip('OS restricts socket tables in this environment'); return }
  assert.equal(ports.available, true)
  for (const [protocol, address, port] of [['TCP', '127.0.0.1', tcp.address().port], ['UDP', '0.0.0.0', udp.address().port]]) {
    const found = ports.sockets.find(row => row.protocol === protocol && row.address === address && row.port === port)
    assert.ok(found, `${protocol} socket is listed`)
    assert.ok(found.owners.some(owner => owner.pid === process.pid), 'owner PID is confirmed')
  }
})
