import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spawnOptions = { stdio: 'inherit', env: process.env, cwd: projectRoot }
const vite = spawn(process.execPath, [path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')], spawnOptions)
let electronProcess = null
let shuttingDown = false

function stop() {
  if (shuttingDown) return
  shuttingDown = true
  terminateTree(electronProcess)
  terminateTree(vite)
}

function terminateTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true, detached: true })
    killer.unref()
  } else {
    child.kill('SIGTERM')
  }
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) return
    } catch { /* Vite is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Vite geliştirme sunucusu zamanında başlamadı: ${url}`)
}

async function main() {
  await waitForServer('http://127.0.0.1:5173')
  const compile = spawn(process.execPath, [path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(projectRoot, 'tsconfig.electron.json')], spawnOptions)
  const compileResult = await new Promise((resolve) => compile.once('exit', (code, signal) => resolve({ code, signal })))
  if (compileResult.code !== 0) throw new Error(`Electron TypeScript derlemesi başarısız: ${compileResult.code ?? compileResult.signal}`)

  const electronBinary = require('electron')
  electronProcess = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_START_URL: 'http://127.0.0.1:5173' },
  })
  electronProcess.once('exit', (code) => {
    if (!shuttingDown) process.exitCode = code ?? 0
    stop()
  })
}

process.once('SIGINT', () => { stop(); process.exit(0) })
process.once('SIGTERM', () => { stop(); process.exit(0) })
vite.once('exit', (code) => {
  if (!shuttingDown && code && code !== 0) {
    console.error(`Vite geliştirme sunucusu kapandı: ${code}`)
    stop()
    process.exitCode = code
  }
})

main().catch((error) => {
  console.error(error)
  stop()
  process.exitCode = 1
})
