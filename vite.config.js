import { defineConfig } from 'vite'

// GitHub Pages project site: https://abnerjluo.github.io/3dpet/
export default defineConfig({
  base: '/3dpet/',
  server: {
    watch: {
      ignored: ['**/downloads/**', '**/node_modules/**', '**/.tools/**'],
    },
  },
})
