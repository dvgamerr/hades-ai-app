import { build } from 'vite-plugin-electron'

for (const entry of ['src/electron/main.js', 'src/electron/preload.js']) {
  await build({ entry })
}
