import { setMaxListeners } from 'events'
import { fileURLToPath } from 'url'
import { defineConfig } from 'astro/config'
import tailwind from '@tailwindcss/vite'
import svelte from '@astrojs/svelte'
import electron from 'astro-electron'

setMaxListeners(20)

const electronOptions = {
  main: { entry: 'src/electron/main.js', vite: {} },
  preload: { input: 'src/electron/preload.js' },
}
const isBuild = process.argv.includes('build')

export default defineConfig({
  base: isBuild ? './' : undefined,
  build: {
    assets: 'dist',
  },

  vite: {
    plugins: [tailwind()],
    optimizeDeps: {
      include: ['bits-ui', '@internationalized/date', 'clsx', 'tailwind-merge', 'tailwind-variants'],
    },
    resolve: {
      alias: {
        $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      },
    },
    server: {
      watch: {
        ignored: ['.github/**/*', 'dist/**', 'dist-electron/**', 'public/**', '.astro/**'],
      },
    },
  },
  security: {
    checkOrigin: false,
  },
  integrations: [svelte(), ...(isBuild ? [] : [electron(electronOptions)])],
})
