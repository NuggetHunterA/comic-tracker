import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from GitHub Pages under /comic-tracker/
export default defineConfig({
  base: '/comic-tracker/',
  plugins: [react()],
})
