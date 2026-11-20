import net from 'node:net'
import { chmod, unlink } from 'node:fs/promises'
import { ServiceError } from './paths.js'

const LIMIT = 32 * 1024
export async function listen(manager, path) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0), received = false
    socket.setTimeout(5000, () => socket.destroy())
    socket.on('error', () => {}) // Client disconnect does not cancel an accepted operation.
    socket.on('data', async (chunk) => {
      if (received) return
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > LIMIT) { received = true; socket.end(JSON.stringify({ ok: false, code: 'REQUEST_TOO_LARGE', message: '服务命令过长。' }) + '\n'); return }
      const end = buffer.indexOf(10)
      if (end < 0) return
      received = true
      try {
        const request = JSON.parse(buffer.subarray(0, end).toString('utf8'))
        if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ServiceError('INVALID_REQUEST', '服务命令格式错误。')
        const value = await manager.execute(request)
        socket.end(JSON.stringify({ ok: true, value }) + '\n')
      } catch (error) {
        socket.end(JSON.stringify({ ok: false, code: error.code ?? 'SERVICE_ERROR', message: error.message }) + '\n')
      }
    })
  })
  const bind = () => new Promise((resolve, reject) => {
    const failed = (error) => { server.removeListener('listening', ready); reject(error) }
    const ready = () => { server.removeListener('error', failed); resolve() }
    server.once('error', failed)
    server.once('listening', ready)
    server.listen(path)
  })
  try { await bind() }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    // Bind first: two managers starting with no socket must not unlink each
    // other's endpoint. Recover a crashed owner's socket only on refusal.
    const existing = await new Promise((resolve, reject) => {
      const connection = net.createConnection(path)
      connection.once('connect', () => { connection.destroy(); resolve(true) })
      connection.once('error', (error) => {
        if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) resolve(error.code)
        else reject(error)
      })
    })
    if (existing === true) throw new ServiceError('ALREADY_RUNNING', '当前主机的服务管理器已经运行。')
    if (existing === 'ECONNREFUSED') await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    await bind()
  }
  await chmod(path, 0o600)
  return { async close() { await new Promise(resolve => server.close(resolve)) } }
}

export function call(path, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path)
    socket.setEncoding('utf8')
    let buffer = ''
    socket.setTimeout(8000, () => socket.destroy(new ServiceError('TIMEOUT', '服务管理器响应超时，请用 list 核对实际状态。')))
    socket.once('connect', () => socket.write(JSON.stringify(request) + '\n'))
    socket.on('data', (chunk) => {
      buffer += chunk
      if (buffer.length > 2 * 1024 * 1024) { socket.destroy(new ServiceError('RESPONSE_TOO_LARGE', '服务响应过大。')); return }
      const end = buffer.indexOf('\n')
      if (end < 0) return
      try {
        const result = JSON.parse(buffer.slice(0, end))
        if (result.ok) resolve(result.value)
        else reject(new ServiceError(result.code, result.message))
      } catch (error) { reject(error) }
      socket.destroy()
    })
    socket.once('error', (error) => {
      reject(['ENOENT', 'ECONNREFUSED'].includes(error.code)
        ? new ServiceError('MANAGER_UNAVAILABLE', '服务管理插件未运行，请在 DSH 主机中启用插件并启动引擎。') : error)
    })
    socket.once('close', () => reject(new ServiceError('CONNECTION_CLOSED', '服务管理器连接中断，请用 list 核对实际状态。')))
  })
}
