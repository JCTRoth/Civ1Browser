import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dev-server middleware that persists structured game-log lines to disk.
 *
 * The browser cannot write to the filesystem, so the GameLogger utility
 * POSTs batched JSON lines to `/__game_log`; this plugin appends them to
 * `game-logs/<sessionId>.log` on the host.
 */
function gameLogPlugin() {
  return {
    name: 'game-log-writer',
    configureServer(server) {
      server.middlewares.use('/__game_log', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const payload = JSON.parse(body)
            const sessionId = String(payload.sessionId || 'game').replace(/[^a-zA-Z0-9._-]/g, '_')
            const dir = join(process.cwd(), 'game-logs')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `${sessionId}.log`)
            const lines = Array.isArray(payload.lines)
              ? payload.lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
              : ''
            appendFileSync(file, lines, 'utf8')
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, file }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), gameLogPlugin()],
  server: {
    host: true,
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})