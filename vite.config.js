import { defineConfig } from 'vite'

// Relative paths so the same build works on any static host.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  server: {
    watch: {
      ignored: ['**/downloads/**', '**/node_modules/**', '**/.tools/**'],
    },
  },
})
