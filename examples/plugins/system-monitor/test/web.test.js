import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { handler, API } from '../lib/index.js'

test('read-only API checks host authentication before collecting any data', async t => {
  const calls = []
  const monitor = { resources: async () => { calls.push('resources'); return { cpu: null } }, ports: async () => { calls.push('ports'); return { available: false } } }
  const server = createServer(handler(monitor, req => req.headers.cookie === 'session=test' ? undefined : 401))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const request = (path, cookie = 'session=test', method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}${API}/${path}`, { headers: { cookie }, method })
  assert.equal((await request('resources', '')).status, 401)
  assert.deepEqual(calls, [])
  assert.deepEqual(await (await request('resources')).json(), { cpu: null })
  assert.equal((await request('ports')).status, 200)
  assert.equal((await request('ports', 'session=test', 'POST')).status, 405)
  assert.equal((await request('missing')).status, 404)
  monitor.resources = async () => { throw Object.assign(Error('private path must not be sent'), { code: 'EIO' }) }
  const failed = await request('resources')
  assert.equal(failed.status, 500)
  assert.equal((await failed.text()).includes('private path'), false)
})
test('one standard Web tab, host locale and no duplicate native contribution', () => {
  let entry
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { entry = value } } } })
  const plugin = entry.factory(() => ({})), tabs = [], slots = []
  plugin.apply({ get: () => ({ resolveText: text => text.zh }),
    inject(_names, callback) { callback({ effect: fn => fn(), get: () => ({ register: value => tabs.push(value) }) }) },
    slots: { inject(_name, fn) { fn() }, register(value) { slots.push(value) } },
  })
  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].title(), '系统监控')
  assert.equal(slots.filter(slot => slot.name === 'sidebar.right.pane.tab').length, 1)
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).dshGo, undefined)
})
