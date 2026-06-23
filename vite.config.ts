import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 1420 is Tauri's conventional dev port, so the desktop shell can wrap
// this exact frontend unchanged once the Tauri Rust side is added.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    // Poll instead of inotify: the host's IDE (Cursor) already consumes most
    // inotify watchers, which would crash Vite's HMR watcher with ENOSPC.
    watch: { usePolling: true, interval: 1000 },
  },
})
