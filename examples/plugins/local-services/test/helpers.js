import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ServiceManager } from '../lib/manager.js'

export const fixture = fileURLToPath(new URL('./service-fixture.mjs', import.meta.url))
export const argv = (...args) => [process.execPath, fixture, ...args]
export async function eventually(read, accept = Boolean) {
  const deadline = Date.now() + 6000
  let value
  do {
    value = await read()
    if (accept(value)) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  } while (Date.now() < deadline)
  assert.fail(`Condition not reached: ${JSON.stringify(value)}`)
}
export async function alive(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0] !== 'Z'
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return false; throw error }
}
export async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-svc-test-'))
  const manager = new ServiceManager({ dir })
  await manager.load()
  t.after(async () => { await manager.close(); await rm(dir, { recursive: true, force: true }) })
  return { dir, manager, socket: join(dir, 'rpc.sock') }
}
