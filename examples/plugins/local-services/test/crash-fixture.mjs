import { ServiceManager } from '../lib/manager.js'
import { argv } from './helpers.js'
const manager = new ServiceManager({ dir: process.argv[2] })
await manager.load()
const service = await manager.execute({ op: 'start', name: 'crash', cwd: process.argv[2], argv: argv('tree') })
process.send({ pid: service.pid })
