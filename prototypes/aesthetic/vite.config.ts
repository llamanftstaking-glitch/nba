import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One app, three concepts. Port 4310 is fixed so the screenshot tools can rely on it.
export default defineConfig({
  plugins: [react()],
  server: { port: 4310, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4310, strictPort: true, host: '127.0.0.1' },
  build: { chunkSizeWarningLimit: 2500 },
})
