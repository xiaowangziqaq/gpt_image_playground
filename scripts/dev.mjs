import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let authServer = null
let viteServer = null

function cleanup() {
  if (authServer) {
    authServer.kill('SIGTERM')
    authServer = null
  }
  if (viteServer) {
    viteServer.kill('SIGTERM')
    viteServer = null
  }
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

function startAuthServer() {
  console.log('[dev] Starting auth server...')
  authServer = spawn('node', ['scripts/auth-server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env },
  })
  authServer.on('error', (err) => {
    console.error('[dev] Auth server error:', err)
  })
  authServer.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[dev] Auth server exited with code ${code}`)
    }
  })
}

function startVite() {
  console.log('[dev] Starting Vite dev server...')
  const viteBin = require.resolve('vite/bin/vite.js')
  viteServer = spawn('node', [viteBin], {
    stdio: 'inherit',
    env: { ...process.env },
  })
  viteServer.on('error', (err) => {
    console.error('[dev] Vite error:', err)
  })
  viteServer.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[dev] Vite exited with code ${code}`)
    }
  })
}

startAuthServer()
startVite()
