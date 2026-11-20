import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { listen, call } from '../lib/rpc.js'
import { locations } from '../lib/paths.js'
import { parse } from '../bin/dsh-svc.mjs'
import { setup, argv, eventually } from './helpers.js'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../bin/dsh-svc.mjs', import.meta.url))

test('CLI preserves program arguments and rejects ambiguous configuration changes', () => {
  const request = parse(['start', 'demo', '--autostart', '--url', 'http://127.0.0.1:8080', '--', 'node', '-e', 'console.log("中文 $()")'], '/workspace')
  assert.deepEqual(request.argv, ['node', '-e', 'console.log("中文 $()")'])
  assert.equal(request.cwd, '/workspace')
  assert.equal(request.autoStart, true)
  assert.deepEqual(parse(['autostart', 'demo', 'off']), { op: 'autostart', name: 'demo', enabled: false })
  for (const args of [['start', 'demo', '--cwd', '/tmp'], ['register', 'demo'], ['logs', 'demo', '--bytes', '-1'], ['stop', 'demo', '--autostart'], ['start', 'demo', '--']]) {
    assert.throws(() => parse(args), { code: 'INVALID_ARGUMENT' })
  }
})

test('CLI and panel manager use the same registry and lifecycle; unavailable manager fails clearly', async t => {
  const { dir, manager } = await setup(t)
  const env = { ...process.env, DSH_SVC_HOME: dir }
  const { socket } = locations(env)
  const server = await listen(manager, socket)
  t.after(() => server.close())
  assert.equal((await stat(socket)).mode & 0o777, 0o600)
  const run = (...args) => exec(process.execPath, [cli, ...args], { env })
  const result = await run('start', 'demo', '--autostart', '--', ...argv('idle', '中文'))
  const started = JSON.parse(result.stdout)
  assert.ok(started.pid)
  assert.equal((await manager.list())[0].pid, started.pid)
  assert.equal(JSON.parse((await run('list')).stdout)[0].autoStart, true)
  await eventually(() => manager.logs('demo'), log => log.text.includes('中文'))
  assert.match((await run('logs', 'demo')).stdout, /中文/)
  await run('stop', 'demo')
  assert.equal((await manager.list())[0].status, 'stopped')
  await assert.rejects(run('remove', 'missing'), error => JSON.parse(error.stderr).code === 'NOT_FOUND')
  await assert.rejects(exec(process.execPath, [cli, 'list'], { env: { ...env, DSH_SVC_HOME: `${dir}/missing` } }), error => JSON.parse(error.stderr).code === 'MANAGER_UNAVAILABLE')
})

test('concurrent managers cannot replace a live socket', async t => {
  const { manager, socket } = await setup(t)
  const results = await Promise.allSettled([listen(manager, socket), listen(manager, socket)])
  const opened = results.filter(v => v.status === 'fulfilled')
  assert.equal(opened.length, 1)
  t.after(() => opened[0].value.close())
  assert.equal(results.find(v => v.status === 'rejected').reason.code, 'ALREADY_RUNNING')
  assert.deepEqual(await call(socket, { op: 'list' }), [])
})

test('a socket left by a killed process is recovered on the next load', async t => {
  const { manager, socket } = await setup(t)
  const child = spawn(process.execPath, ['--input-type=module', '-e', "import net from 'node:net'; net.createServer().listen(process.argv[1],()=>console.log('ready'))", socket], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject) })
  const ended = new Promise(resolve => child.once('close', resolve))
  child.kill('SIGKILL')
  await ended
  const server = await listen(manager, socket)
  t.after(() => server.close())
  assert.deepEqual(await call(socket, { op: 'list' }), [])
})

test('malformed and oversized RPC requests are rejected before execution', async t => {
  const { manager, socket } = await setup(t)
  const server = await listen(manager, socket)
  t.after(() => server.close())
  const raw = text => new Promise((resolve, reject) => {
    const client = net.createConnection(socket)
    let response = ''
    client.setEncoding('utf8')
    client.on('connect', () => client.end(text))
    client.on('data', data => { response += data })
    client.on('end', () => resolve(JSON.parse(response)))
    client.on('error', reject)
  })
  assert.equal((await raw('null\n')).code, 'INVALID_REQUEST')
  assert.equal((await raw('x'.repeat(33000) + '\n')).code, 'REQUEST_TOO_LARGE')
  assert.deepEqual(await manager.list(), [])
})
