import { createHash } from 'node:crypto'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'

export function locations(env = process.env) {
  const home = resolve(env.DSH_HOME || join(homedir(), '.dsh'))
  const dir = resolve(env.DSH_SVC_HOME || join(home, 'dsh-go', 'services'))
  const id = createHash('sha256').update(dir).digest('hex').slice(0, 12)
  return { dir, socket: join(tmpdir(), `dsh-svc-${userInfo().uid}-${id}.sock`) }
}

export class ServiceError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
