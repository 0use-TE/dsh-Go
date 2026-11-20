import { ServiceError } from './paths.js'

export const API = '/local-services/v1'
const operations = new Set(['start', 'stop', 'restart', 'autostart', 'remove'])
const send = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', chunk => { bytes += chunk.length; if (bytes <= 4096) chunks.push(chunk) })
    req.on('error', reject)
    req.on('aborted', () => reject(new ServiceError('INVALID_REQUEST', '请求已中断。')))
    req.on('end', () => {
      if (bytes > 4096) return reject(new ServiceError('REQUEST_TOO_LARGE', '请求过长。'))
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error()
        resolve(body)
      } catch { reject(new ServiceError('INVALID_REQUEST', '无效的服务操作。')) }
    })
  })
}

export function webHandler(manager, { rejection, prompt, startupError = '' }) {
  return async (req, res) => {
    const denied = rejection(req)
    if (denied !== undefined) return send(res, denied, { error: { code: 'ACCESS_DENIED', message: '请重新连接 DSH 主机。' } })
    try {
      if (startupError) throw new ServiceError('MANAGER_UNAVAILABLE', startupError)
      const url = new URL(req.url, 'http://localhost')
      if (req.method === 'GET') {
        if (url.pathname === API + '/state') return send(res, 200, { services: await manager.list() })
        if (url.pathname === API + '/prompt') return send(res, 200, { prompt: prompt(url.searchParams.get('lang') === 'en') })
        if (url.pathname === API + '/logs') {
          const log = await manager.logs(url.searchParams.get('name'))
          return send(res, 200, { ...log, text: Array.from(log.text).slice(-2000).join('') })
        }
      } else if (req.method === 'POST' && url.pathname === API + '/action') {
        const body = await readBody(req)
        let failures = []
        if (body.op === 'start-all' || body.op === 'stop-all') {
          const op = body.op === 'start-all' ? 'start' : 'stop'
          failures = await manager.mutate(async () => {
            const names = [...manager.definitions.keys()]
            const results = await Promise.allSettled(names.map(name => manager[op](name)))
            return results.flatMap((result, index) => result.status === 'rejected'
              ? [{ name: names[index], code: result.reason.code ?? 'SERVICE_ERROR', message: result.reason.message }] : [])
          })
        } else {
          if (!operations.has(body.op)) throw new ServiceError('INVALID_OPERATION', '不支持的服务操作。')
          await manager.execute({ op: body.op, name: body.name, enabled: body.enabled })
        }
        return send(res, 200, { services: await manager.list(), failures })
      }
      return send(res, req.method === 'GET' || req.method === 'POST' ? 404 : 405, { error: { code: 'NOT_FOUND', message: '接口不存在。' } })
    } catch (error) {
      return send(res, error.code === 'MANAGER_UNAVAILABLE' ? 503 : error instanceof ServiceError ? 400 : 500,
        { error: { code: error.code ?? 'SERVICE_ERROR', message: error.message } })
    }
  }
}
