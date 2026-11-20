import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createTestHost } from '../../../../sdk/plugin-kit/lib/testing.js'
import { apply, createPlugin, agentPrompt } from '../lib/index.js'
import { call } from '../lib/rpc.js'
import { setup, argv, eventually, alive } from './helpers.js'

const plugin = fileURLToPath(new URL('..', import.meta.url))
async function hostFor(t) {
  const { dir, socket } = await setup(t)
  let route
  const host = createTestHost({ dir: plugin, services: {
    webServer: { register(value) { route = value; return () => { route = null } } },
    connection: { requestRejection(req) { return req.headers.cookie === 'session=test' ? undefined : 401 } },
  } })
  const instance = await createPlugin(host.ctx, { dir, socket })
  assert.equal(route.path, '/local-services/v1')
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path !== route.path && !path.startsWith(route.path + '/')) { res.writeHead(404); res.end('{}'); return }
    return route.handler(req, res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    host.dispose()
    await instance.close()
  })
  const request = async (path, body, cookie = 'session=test') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/local-services/v1/` + path, {
      headers: { cookie, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    return { status: response.status, data: await response.json() }
  }
  return { ...instance, dir, socket, request, host }
}

test('Web entry registers one service tab and no duplicate native panel', () => {
  let entry
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { entry = value } } },
    document: { documentElement: { lang: 'en' } },
  })
  const browser = entry.factory(name => { assert.equal(name, 'react'); return { createElement() {} } })
  assert.ok(browser.inject.includes('locale'))
  let language = 'zh'
  const slots = [], tabs = []
  browser.apply({
    get: () => ({ resolveText: text => text[language] }),
    slots: { inject(_name, fn) { fn() }, register(value, component) { slots.push({ ...value, component }) } },
    inject(names, fn) { assert.equal(names[0], 'sidebarRightTabs'); fn({ effect: fn => fn(), get: () => ({ register: value => tabs.push(value) }) }) },
  })
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].id, 'local-services:services')
  assert.equal(tabs[0].title(), '服务管理')
  language = 'en'
  assert.equal(tabs[0].title(), 'Services')
  assert.equal(slots.filter(slot => slot.name === 'sidebar.right.pane.tab').length, 1)
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).dshGo, undefined)
})

test('Web API and CLI share state; auth is checked before reads and mutations', async t => {
  const { manager, dir, socket, request, host } = await hostFor(t)
  await call(socket, { op: 'register', name: 'web-demo', cwd: dir, argv: argv('idle') })
  assert.equal((await request('state', undefined, '')).status, 401)
  assert.equal((await request('action', { op: 'start', name: 'web-demo' }, '')).status, 401)
  assert.equal((await manager.list())[0].status, 'stopped')
  assert.equal((await request('state')).data.services[0].name, 'web-demo')
  const started = await request('action', { op: 'start', name: 'web-demo' })
  assert.equal(started.status, 200)
  const pid = started.data.services[0].pid
  assert.ok(pid)
  assert.equal((await call(socket, { op: 'list' }))[0].pid, pid)
  await request('action', { op: 'autostart', name: 'web-demo', enabled: true })
  assert.equal((await manager.list())[0].autoStart, true)
  await eventually(() => manager.logs('web-demo'), value => !!value.text)
  assert.ok((await request('logs?name=web-demo')).data.text)
  assert.equal((await request('action', { op: 'remove', name: 'web-demo' })).data.error.code, 'SERVICE_RUNNING')
  await request('action', { op: 'stop', name: 'web-demo' })
  assert.equal(await alive(pid), false)
  await request('action', { op: 'remove', name: 'web-demo' })
  assert.deepEqual((await request('state')).data.services, [])
  host.dispose()
})

test('bulk actions report individual failures and stop managed processes', async t => {
  const { manager, dir, request } = await hostFor(t)
  for (const name of ['one', 'two']) await manager.execute({ op: 'register', name, cwd: dir, argv: argv('ignore-term') })
  await manager.execute({ op: 'register', name: 'broken', cwd: dir, argv: ['/definitely-missing-command'] })
  const started = await request('action', { op: 'start-all' })
  assert.equal(started.status, 200)
  assert.deepEqual(started.data.failures.map(item => item.name), ['broken'])
  const pids = started.data.services.filter(row => row.status === 'running').map(row => row.pid)
  assert.equal(pids.length, 2)
  const stopped = await request('action', { op: 'stop-all' })
  assert.equal(stopped.status, 200)
  assert.deepEqual(stopped.data.failures, [])
  for (const pid of pids) assert.equal(await alive(pid), false)
})

test('Web prompt, validation and disposal preserve the existing service contract', async t => {
  const { request, manager, dir, close } = await hostFor(t)
  assert.match((await request('prompt?lang=en')).data.prompt, /engine\/plugin load/)
  assert.match((await request('prompt?lang=zh')).data.prompt, /随引擎/)
  assert.match(agentPrompt("/tmp/it's $(bad)/cli"), /'\/tmp\/it'"'"'s \$\(bad\)\/cli'/)
  for (const body of ['{', 'null', '[]', ' '.repeat(4097), { op: 'register' }]) {
    assert.equal((await request('action', body)).status, 400)
  }
  assert.equal((await request('missing')).status, 404)
  await manager.execute({ op: 'register', name: 'demo', cwd: dir, argv: argv('idle') })
  const invalid = await request('action', { op: 'autostart', name: 'demo', enabled: 'true' })
  assert.equal(invalid.data.error.code, 'INVALID_AUTOSTART')
  const started = await request('action', { op: 'start', name: 'demo' })
  await close()
  assert.equal(await alive(started.data.services[0].pid), false)
  const { dir: next, socket } = await setup(t)
  const host = createTestHost({ dir: plugin })
  assert.equal(await apply(host.ctx, { dir: next, socket }), undefined)
  host.dispose()
})
