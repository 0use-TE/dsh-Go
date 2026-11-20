import { SystemMonitor } from './monitor.js'

export const name = 'system-monitor'
export const API = '/system-monitor/v1'
export function handler(monitor, rejection) {
  const send = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(JSON.stringify(data))
  }
  return async (req, res) => {
    const denied = rejection(req)
    if (denied !== undefined) return send(res, denied, { error: { code: 'ACCESS_DENIED', message: 'Please reconnect to DSH.' } })
    if (req.method !== 'GET') return send(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } })
    const path = new URL(req.url, 'http://localhost').pathname
    try {
      if (path === API + '/resources') return send(res, 200, await monitor.resources())
      return send(res, 404, { error: { code: 'NOT_FOUND' } })
    } catch (error) { return send(res, 500, { error: { code: error.code ?? 'MONITOR_FAILED', message: 'Unable to read host metrics.' } }) }
  }
}
export async function apply(ctx) {
  if (process.platform !== 'linux') throw Error('system-monitor requires Linux or Android PRoot')
  const monitor = new SystemMonitor()
  await monitor.initialize()
  ctx.inject(['webServer'], inner => inner.effect(() => inner.get('webServer').register({ kind: 'prefix', path: API,
    handler: handler(monitor, req => {
      const connection = inner.get('connection')
      return connection === undefined ? 503 : connection.requestRejection(req)
    }),
  })))
}
