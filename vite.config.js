import { defineConfig } from 'vite'

// Relative paths so the same build works on any static host.
export default defineConfig({
  base: './',
  server: {
    watch: {
      ignored: ['**/downloads/**', '**/node_modules/**', '**/.tools/**'],
    },
  },
})
