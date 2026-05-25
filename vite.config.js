import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:    ['react', 'react-dom', 'react-router-dom'],
          firebase:  ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database'],
          stripe:    ['@stripe/stripe-js'],
          dateFns:   ['date-fns'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
