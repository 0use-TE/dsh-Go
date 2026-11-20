import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SystemMonitor, parseMemory, parseCpu, parseProcess } from '../lib/monitor.js'

const memory = 'MemTotal: 1000 kB\nMemFree: 100 kB\nMemAvailable: 400 kB\nSwapTotal: 200 kB\nSwapFree: 150 kB\n'
const stat = (pid, ticks = 100, start = 1, name = 'node (worker)') => {
  const fields = Array(22).fill('0')
  fields[0] = 'S'; fields[1] = '1'; fields[11] = String(ticks); fields[19] = String(start)
  return `${pid} (${name}) ${fields.join(' ')}`
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'system-monitor-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const proc = join(root, 'proc')
  await mkdir(join(proc, '42'), { recursive: true })
  await writeFile(join(proc, '42', 'stat'), stat(42))
  await writeFile(join(proc, '42', 'status'), 'VmRSS: 10 kB\n')
  await writeFile(join(proc, 'meminfo'), memory)
  await writeFile(join(proc, 'stat'), 'cpu 100 0 100 800 0 0 0 0 50 0\n')
  let now = 1000
  return { proc, monitor: new SystemMonitor({ proc, diskPath: root, hz: 100, clock: () => now }), tick: value => { now = value } }
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
test('unavailable CPU stays unknown while other resources remain readable', async t => {
  const { proc, monitor } = await fixture(t)
  await rm(join(proc, 'stat'))
  const resource = await monitor.resources()
  assert.equal(resource.cpu, null)
  assert.ok(resource.issues.some(issue => issue.area === 'cpu' && issue.code === 'ENOENT'))
  assert.ok(resource.memory.total > 0)
  assert.ok(resource.disk.available > 0)
  assert.equal(resource.processes.length, 1)
})
