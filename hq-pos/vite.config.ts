import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import fs from 'fs'

const MIME_MAP: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

const STATIC_SPA_PREFIXES = ['/0414/', '/0420/0414/']

function staticSpaPlugin(): Plugin {
  return {
    name: 'serve-static-spa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        const prefix = STATIC_SPA_PREFIXES.find(p => url.startsWith(p))
        if (!prefix) {
          return next()
        }

        const publicDir = path.resolve(server.config.root, 'public')
        const filePath = path.join(publicDir, url)

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          res.setHeader('Content-Type', getMimeType(filePath))
          fs.createReadStream(filePath).pipe(res)
          return
        }

        const prefixDir = prefix.replace(/\/$/, '')
        if (url === prefixDir || url === prefixDir + '/') {
          const indexFile = path.join(publicDir, prefixDir, 'index.html')
          if (fs.existsSync(indexFile)) {
            res.setHeader('Content-Type', 'text/html')
            fs.createReadStream(indexFile).pipe(res)
            return
          }
        }

        const indexFile = path.join(publicDir, prefixDir, 'index.html')
        if (fs.existsSync(indexFile)) {
          res.setHeader('Content-Type', 'text/html')
          fs.createReadStream(indexFile).pipe(res)
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8100'

  return {
    plugins: [react(), tailwindcss(), staticSpaPlugin()],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})