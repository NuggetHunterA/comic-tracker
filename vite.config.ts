import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel serves the app at the domain root; GitHub Pages sets BASE=/comic-tracker/.
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react()],
})
