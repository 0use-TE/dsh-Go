import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [mode, ...args] = process.argv.slice(2)
if (mode === 'exit') {
  console.log('normal output')
  console.error('error output')
  process.exitCode = Number(args[0])
} else if (mode === 'logs') {
  const chunk = Buffer.alloc(64000, 'x')
  for (let n = 0; n < 45; n++) {
    if (!process.stdout.write(chunk)) await new Promise(resolve => process.stdout.once('drain', resolve))
  }
  console.log('\nTAIL-END-中文')
} else if (mode === 'tree') {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'ignore-term'], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.once('data', () => console.log(JSON.stringify({ child: child.pid })))
  setInterval(() => {}, 1000)
} else if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {})
  console.log('ready')
  setInterval(() => {}, 1000)
} else if (mode === 'server') {
  const server = http.createServer((_req, res) => { res.writeHead(Number(args[1]) || 200); res.write('streaming'); /* keep body open */ })
  server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })))
} else {
  console.log(JSON.stringify({ args, pid: process.pid }))
  setInterval(() => {}, 1000)
}
