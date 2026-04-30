import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'recharts'
            if (id.includes('@tanstack/react-query')) return 'react-query'
            if (
              id.includes('react-router') ||
              id.includes('/react-dom/') ||
              id.includes('/react/')
            ) return 'react-vendor'
          }
        },
      },
    },
  },
})
