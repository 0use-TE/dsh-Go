// One foreground command owns one process group. IPC disconnect means its
// manager died: stop the entire group, including npm's descendants.
import { spawn } from 'node:child_process'
import { closeSync, openSync, fstatSync, writeSync, renameSync } from 'node:fs'

let child, timer, stopping = false, finished = false
let logFd, logPath, logBytes = 0
const LOG_LIMIT = 1024 * 1024
const send = (message) => { if (process.connected) process.send(message, () => {}) }
function signal(value) {
  if (!child?.pid) return false
  try { process.kill(-child.pid, value); return true }
  catch (error) { if (error.code === 'ESRCH') return false; throw error }
}
function finish() {
  if (finished) return
  finished = true
  clearTimeout(timer)
  if (process.connected) process.disconnect()
  process.exitCode = 0
}
function stop() {
  if (stopping) return
  stopping = true
  if (!signal('SIGTERM')) { finish(); return }
  timer = setTimeout(() => { signal('SIGKILL'); finish() }, 1200)
}
process.on('disconnect', stop)
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('message', (message) => {
  if (message.op === 'stop') { stop(); return }
  if (message.op !== 'start' || child || stopping) return
  try {
    logPath = message.log
    logFd = openSync(logPath, 'a', 0o600)
    logBytes = fstatSync(logFd).size
    child = spawn(message.argv[0], message.argv.slice(1), {
      cwd: message.cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const append = (chunk) => {
      if (logFd === undefined) return
      try {
        if (logBytes + chunk.length > LOG_LIMIT) {
          closeSync(logFd)
          logFd = undefined
          renameSync(logPath, `${logPath}.1`)
          logFd = openSync(logPath, 'w', 0o600)
          logBytes = 0
        }
        writeSync(logFd, chunk)
        logBytes += chunk.length
      } catch (error) {
        if (logFd !== undefined) { closeSync(logFd); logFd = undefined }
        send({ type: 'failed', code: 'LOG_FAILED', message: error.message })
        stop()
      }
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('close', () => { if (logFd !== undefined) { closeSync(logFd); logFd = undefined } })
    child.once('spawn', () => send({ type: 'started', pid: child.pid }))
    child.once('error', (error) => { send({ type: 'failed', code: error.code, message: error.message }); finish() })
    child.once('exit', (code, signalName) => {
      send({ type: 'exited', code, signal: signalName })
      if (!stopping) stop()
      else if (!signal(0)) finish()
    })
  } catch (error) {
    send({ type: 'failed', code: error.code, message: error.message })
    finish()
  }
})
