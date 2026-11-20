import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fork } from 'node:child_process'
import { stat, readFile, writeFile, mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ServiceManager } from '../lib/manager.js'
import { setup, argv, eventually, alive } from './helpers.js'

test('registration persists; start is idempotent; arguments never pass through a shell', async t => {
  const { dir, manager } = await setup(t)
  const literal = '$(touch should-not-exist); & `echo nope` 中文'
  const request = { op: 'start', name: 'web', cwd: dir, argv: argv('idle', literal) }
  const first = await manager.execute(request)
  assert.equal((await manager.execute(request)).pid, first.pid)
  assert.equal((await manager.execute({ op: 'start', name: 'web' })).pid, first.pid)
  const log = await eventually(() => manager.logs('web'), v => v.text.includes('中文'))
  assert.equal(JSON.parse(log.text).args[0], literal)
  await assert.rejects(manager.execute({ ...request, argv: argv('changed') }), { code: 'SERVICE_RUNNING' })
  await assert.rejects(manager.execute({ op: 'remove', name: 'web' }), { code: 'SERVICE_RUNNING' })
  await manager.execute({ op: 'stop', name: 'web' })
  assert.equal(await alive(first.pid), false)
  assert.equal((await manager.list())[0].status, 'stopped')
  assert.equal((await stat(join(dir, 'services.json'))).mode & 0o777, 0o600)
  assert.equal(JSON.parse(await readFile(join(dir, 'services.json')))[0].autoStart, false)
  await manager.execute({ op: 'remove', name: 'web' })
  assert.deepEqual(await manager.list(), [])
})

test('actual exit codes and failed spawn remain visible; failed services can be restarted', async t => {
  const { dir, manager } = await setup(t)
  for (const code of [0, 7]) {
    await manager.execute({ op: 'start', name: `exit-${code}`, cwd: dir, argv: argv('exit', String(code)) })
    const services = await eventually(() => manager.list(), rows => rows.find(v => v.name === `exit-${code}`)?.pid === null)
    const service = services.find(v => v.name === `exit-${code}`)
    assert.equal(service.exitCode, code)
    assert.equal(service.status, code === 0 ? 'exited' : 'failed')
    assert.match((await manager.logs(service.name)).text, /normal output[\s\S]*error output/)
  }
  await assert.rejects(manager.execute({ op: 'start', name: 'bad', cwd: dir, argv: ['/no-such-program'] }), { code: 'START_FAILED' })
  await eventually(() => manager.list(), rows => rows.find(v => v.name === 'bad')?.pid === null)
  assert.match((await manager.list()).find(v => v.name === 'bad').error, /ENOENT/)
  await manager.execute({ op: 'stop', name: 'bad' })
  await manager.execute({ op: 'start', name: 'bad', cwd: dir, argv: argv('idle') })
  assert.equal((await manager.list()).find(v => v.name === 'bad').status, 'running')
})

test('TCP/UDP listeners are metadata, persist, and can change without restarting a running service', async t => {
  const { manager, dir } = await setup(t)
  const started = await manager.execute({ op: 'start', name: 'non-http', cwd: dir, argv: argv('idle'), listen: ['0.0.0.0:2222', 'udp://[::]:5353'] })
  assert.deepEqual(started.listen, ['tcp://0.0.0.0:2222', 'udp://[::]:5353'])
  assert.equal(started.url, '')
  const changed = await manager.execute({ op: 'listen', name: 'non-http', listen: ['tcp://127.0.0.1:6379'] })
  assert.equal(changed.pid, started.pid)
  assert.equal(changed.startedAt, started.startedAt)
  assert.equal(changed.status, 'running')
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'services.json'), 'utf8'))[0].listen, ['tcp://127.0.0.1:6379'])
  for (const listen of [null, '127.0.0.1:22', ['http://127.0.0.1:22'], ['tcp://user:secret@localhost:22'], ['tcp://127.0.0.1:0'], ['tcp://127.0.0.1:65536'], ['udp://localhost:5353/path']]) {
    await assert.rejects(manager.execute({ op: 'listen', name: 'non-http', listen }), { code: 'INVALID_LISTEN' })
  }
  const save = manager.save
  manager.save = async () => { throw Object.assign(Error('write failed'), { code: 'EIO' }) }
  await assert.rejects(manager.execute({ op: 'listen', name: 'non-http', listen: [] }), { code: 'EIO' })
  assert.deepEqual(manager.get('non-http').listen, ['tcp://127.0.0.1:6379'])
  manager.save = save
  assert.equal((await manager.execute({ op: 'listen', name: 'non-http', listen: [] })).pid, started.pid)
  assert.equal(await alive(started.pid), true)
})

test('stop reaps the command and its SIGTERM-ignoring descendants', async t => {
  const { dir, manager } = await setup(t)
  const service = await manager.execute({ op: 'start', name: 'tree', cwd: dir, argv: argv('tree') })
  const log = await eventually(() => manager.logs('tree'), v => v.text.includes('child'))
  const child = JSON.parse(log.text).child
  assert.equal(await alive(child), true)
  await manager.execute({ op: 'stop', name: 'tree' })
  await eventually(() => alive(child), value => !value)
  assert.equal(await alive(service.pid), false)
})

test('a manager crash disconnects workers and cleans up service process groups', async t => {
  const { dir, manager } = await setup(t)
  const parent = fork(new URL('./crash-fixture.mjs', import.meta.url), [dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  t.after(() => parent.kill('SIGKILL'))
  const { pid } = await new Promise((resolve, reject) => { parent.once('message', resolve); parent.once('error', reject); parent.once('exit', () => reject(Error('manager fixture exited early'))) })
  await manager.load()
  const log = await eventually(() => manager.logs('crash'), v => v.text.includes('child'))
  const child = JSON.parse(log.text).child
  parent.kill('SIGKILL')
  await eventually(() => alive(pid), value => !value)
  await eventually(() => alive(child), value => !value)
})

test('only explicitly enabled services restart on manager load', async t => {
  const { dir, manager } = await setup(t)
  for (const name of ['auto', 'manual']) await manager.execute({ op: 'register', name, cwd: dir, argv: argv('idle') })
  await manager.execute({ op: 'autostart', name: 'auto', enabled: true })
  await manager.autostart()
  const first = (await manager.list()).find(v => v.name === 'auto').pid
  assert.ok(first)
  assert.equal((await manager.list()).find(v => v.name === 'manual').pid, null)
  await manager.close()
  const restored = new ServiceManager({ dir })
  t.after(() => restored.close())
  await restored.load()
  assert.ok((await restored.list()).every(v => v.status === 'stopped'))
  await restored.autostart()
  const rows = await restored.list()
  assert.ok(rows.find(v => v.name === 'auto').pid)
  assert.notEqual(rows.find(v => v.name === 'auto').pid, first)
  assert.equal(rows.find(v => v.name === 'manual').status, 'stopped')
  await restored.execute({ op: 'autostart', name: 'auto', enabled: false })
  assert.equal(JSON.parse(await readFile(join(dir, 'services.json'))).find(v => v.name === 'auto').autoStart, false)
  await restored.close()
})

test('HTTP readiness is independent of process state and does not retain streaming connections', async t => {
  const { dir, manager } = await setup(t)
  const service = await manager.execute({ op: 'start', name: 'stream', cwd: dir, argv: argv('server') })
  const log = await eventually(() => manager.logs('stream'), v => v.text.includes('port'))
  const port = JSON.parse(log.text).port
  // Store the URL while stopped, then exercise a known listening endpoint.
  await manager.execute({ op: 'register', name: 'probe', cwd: dir, argv: argv('idle'), url: `http://127.0.0.1:${port}` })
  await manager.execute({ op: 'start', name: 'probe' })
  assert.equal((await manager.list()).find(v => v.name === 'probe').health, 'ready')
  await manager.execute({ op: 'stop', name: 'stream' })
  assert.equal(await alive(service.pid), false)
  const row = (await manager.list()).find(v => v.name === 'probe')
  assert.equal(row.status, 'running')
  assert.equal(row.health, 'unreachable')
})

test('log output is rotated and reads return a bounded tail', async t => {
  const { dir, manager } = await setup(t)
  await manager.execute({ op: 'start', name: 'loud', cwd: dir, argv: argv('logs') })
  await eventually(() => manager.list(), rows => rows[0].pid === null)
  const log = await manager.logs('loud', 80)
  assert.ok(Buffer.byteLength(log.text) <= 80)
  assert.equal(log.truncated, true)
  assert.match(log.text, /TAIL-END-中文/)
  for (const suffix of ['', '.1']) assert.ok((await stat(join(dir, 'logs', `loud.log${suffix}`))).size <= 1024 * 1024)
})

test('invalid registrations and registry write failures do not create phantom services', async t => {
  const { dir, manager } = await setup(t)
  const base = { op: 'register', name: 'valid', cwd: dir, argv: argv('idle') }
  for (const [change, code] of [[{ name: '../escape' }, 'INVALID_NAME'], [{ cwd: 'relative' }, 'INVALID_CWD'], [{ argv: ['echo', '\0'] }, 'INVALID_COMMAND'], [{ url: 'https://example.com' }, 'INVALID_URL'], [{ autoStart: 'yes' }, 'INVALID_AUTOSTART']]) {
    await assert.rejects(manager.execute({ ...base, ...change }), { code })
  }
  const save = manager.save
  manager.save = async () => { throw Object.assign(Error('disk full'), { code: 'ENOSPC' }) }
  await assert.rejects(manager.execute(base), { code: 'ENOSPC' })
  assert.deepEqual(await manager.list(), [])
  manager.save = save
  await manager.execute(base)
  const corrupt = new ServiceManager({ dir })
  await writeFile(join(dir, 'services.json'), 'not JSON')
  await assert.rejects(corrupt.load(), SyntaxError)
})

test('failed log deletion retains the registration so removal can be retried', async t => {
  const { dir, manager } = await setup(t)
  await manager.execute({ op: 'register', name: 'demo', cwd: dir, argv: argv('idle') })
  const blocked = join(dir, 'logs', 'demo.log.1')
  await mkdir(blocked)
  await assert.rejects(manager.execute({ op: 'remove', name: 'demo' }), { code: 'EISDIR' })
  assert.equal((await manager.list())[0].name, 'demo')
  await rmdir(blocked)
  await manager.execute({ op: 'remove', name: 'demo' })
  assert.deepEqual(await manager.list(), [])
})
