import * as url from 'url'
import { release } from 'os'
import { existsSync } from 'fs'
import path from 'path'
import electron from 'electron'

import settings from './lib/settings'
import { initilizeApp } from './lib/config'
import ipcEvent from './events'
import { onWindowPosition } from './events/window'

const { app, BrowserWindow, shell, ipcMain, nativeImage } = electron

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId('com.electron.hades-ai.app')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

function getPublicAssetPath(fileName) {
  const candidates = [path.join(process.cwd(), 'public', fileName), path.join(app.getAppPath(), 'public', fileName), path.join(process.resourcesPath, 'public', fileName)]

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function registerIpcHandlers() {
  for (const eventName in ipcEvent) {
    ipcMain.handle(eventName, async (e, ...args) => {
      const result = await ipcEvent[eventName](e, ...args)
      return result
    })
  }
}

function watchWindowShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.code === 'F12') {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win.webContents.openDevTools({ mode: 'undocked' })
      }
      return
    }

    if (app.isPackaged && input.type === 'keyDown') {
      const modifier = input.control || input.meta
      if (modifier && (input.code === 'KeyR' || input.code === 'Minus')) event.preventDefault()
      if (modifier && input.shift && input.code === 'Equal') event.preventDefault()
      if ((input.alt && input.meta) || (input.control && input.shift)) {
        if (input.code === 'KeyI') event.preventDefault()
      }
    }
  })
}

function syncWindowTheme(win, theme, focused) {
  const overlay = focused
    ? {
        color: theme.titlebar.activeBackground,
        symbolColor: theme.titlebar.activeForeground,
      }
    : {
        color: theme.titlebar.inactiveBackground,
        symbolColor: theme.titlebar.inactiveForeground,
      }

  win.setTitleBarOverlay(overlay)
  win.webContents.executeJavaScript(`document.body?.classList.toggle('inactive', ${JSON.stringify(!focused)})`).catch(() => {})
}

async function createWindow() {
  const { config, theme } = await initilizeApp()
  const lasted = (await settings.get('position')) ?? {}
  const iconPath = getPublicAssetPath('favicon.png')
  const windowIcon = nativeImage.createFromPath(iconPath)

  if (!app.isPackaged) {
    console.log({ iconPath, iconLoaded: !windowIcon.isEmpty() })
  }

  const win = new BrowserWindow({
    title: 'Hades AI',
    show: true,
    movable: true,
    resizable: true,
    frame: false,
    alwaysOnTop: false,
    titleBarStyle: 'hidden',
    backgroundColor: theme.titlebar.activeBackground,
    titleBarOverlay: {
      color: theme.titlebar.activeBackground,
      symbolColor: theme.titlebar.activeForeground,
    },
    autoHideMenuBar: true,
    minWidth: config.width,
    minHeight: config.height,
    width: lasted.width || config.width,
    height: lasted.height || config.height,
    x: lasted.x,
    y: lasted.y,
    ...(process.platform === 'darwin' ? {} : { icon: windowIcon }),
    webPreferences: {
      preload: url.fileURLToPath(new URL('preload.js', import.meta.url)),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (lasted.maximized) win.maximize()

  win.webContents.setMaxListeners(0)

  win.on('focus', () => syncWindowTheme(win, theme, true))
  win.on('blur', () => syncWindowTheme(win, theme, false))
  win.webContents.on('did-finish-load', () => {
    syncWindowTheme(win, theme, win.isFocused())
  })

  win.on('unmaximize', onWindowPosition(win))
  win.on('maximize', onWindowPosition(win))
  win.on('moved', onWindowPosition(win))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // You can use `process.env.VITE_DEV_SERVER_URL` when the vite command is called `serve`
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // Load your file
    await win.loadFile('dist/index.html')
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron.hades-ai.app')
  }

  // Register IPC handlers once at app startup
  registerIpcHandlers()

  app.on('browser-window-created', (_, window) => {
    watchWindowShortcuts(window)
  })

  await createWindow()

  app.on('activate', async function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) await createWindow()
  })
})
