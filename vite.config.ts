import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves from /Telokine/; local dev uses /.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    // Poll instead of inotify: the host's IDE (Cursor) already consumes most
    // inotify watchers, which would crash Vite's HMR watcher with ENOSPC.
    watch: { usePolling: true, interval: 1000 },
  },
})
