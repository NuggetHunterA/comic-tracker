import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Version 0.n, n = number of the last merged pull request, read from the merge commits.
// Vercel previews carry the number of their own pull request.
function version() {
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_GIT_PULL_REQUEST_ID) {
    return `0.${process.env.VERCEL_GIT_PULL_REQUEST_ID} (Vorschau)`
  }
  let log = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? ''
  try {
    log = execSync('git log -50 --format=%s', { encoding: 'utf8' }) + '\n' + log
  } catch {
    // Without git only the commit message is left.
  }
  const pr = log.match(/Merge pull request #(\d+)|\(#(\d+)\)/)
  return pr ? `0.${pr[1] ?? pr[2]}` : '0.?'
}

// Vercel serves the app at the domain root; GitHub Pages sets BASE=/comic-tracker/.
export default defineConfig({
  base: process.env.BASE ?? '/',
  define: { __VERSION__: JSON.stringify(version()) },
  plugins: [react()],
})
