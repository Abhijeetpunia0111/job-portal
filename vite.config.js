import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: true,
    // Greenhouse's API blocks browser CORS — proxy it through the dev server
    // so "live mode" works without a backend. Ashby/SmartRecruiters allow CORS.
    proxy: {
      '/ats/gh': {
        target: 'https://boards-api.greenhouse.io',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ats\/gh/, ''),
      },
      // Resume-match API (run `npm run server`).
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
