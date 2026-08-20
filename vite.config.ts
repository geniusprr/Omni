import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDirectory, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/dist-electron/**'],
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_'],
  build: {
    target: 'chrome120',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(rootDirectory, 'index.html'),
        splash: path.resolve(rootDirectory, 'splash.html'),
      },
    },
  },
})
