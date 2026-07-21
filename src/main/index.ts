import { app, BrowserWindow, desktopCapturer, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { MediaSessionService } from './media/sessions'
import { fetchLyricsFromLrclib } from './lyrics'
import type { NowPlayingPayload } from '../shared/media'
import type { LyricsQuery } from '../shared/lyrics'

const mediaService = new MediaSessionService()
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

function broadcastNowPlaying(payload: NowPlayingPayload = mediaService.getSnapshot()): void {
  for (const win of [mainWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('media:now-playing', payload)
    }
  }
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1280, width),
    height: Math.min(800, height),
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0c0b0a',
    autoHideMenuBar: true,
    title: 'Dancingword',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 440,
    height: 420,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    parent: mainWindow ?? undefined,
    modal: false,
    autoHideMenuBar: true,
    backgroundColor: '#14110f',
    title: 'Dancingword 设置',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`)
  } else {
    void settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  mediaService.start()

  mediaService.subscribe((payload) => {
    broadcastNowPlaying(payload)
  })

  ipcMain.handle('media:get-snapshot', () => mediaService.getSnapshot())
  ipcMain.handle('media:refresh', async () => mediaService.refreshNow())
  ipcMain.handle('media:set-preferred-app', (_event, appId: string | null) => {
    mediaService.setPreferredAppId(appId)
    const snapshot = mediaService.getSnapshot()
    broadcastNowPlaying(snapshot)
    return snapshot
  })

  ipcMain.handle('lyrics:fetch', async (_event, query: LyricsQuery) => {
    return fetchLyricsFromLrclib(query)
  })

  ipcMain.handle('window:set-always-on-top', (_event, flag: boolean) => {
    mainWindow?.setAlwaysOnTop(flag)
    return mainWindow?.isAlwaysOnTop() ?? false
  })

  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })

  ipcMain.handle('window:is-fullscreen', () => mainWindow?.isFullScreen() ?? false)

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:open-settings', () => {
    openSettingsWindow()
  })

  ipcMain.handle('desktop:get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })

  mainWindow?.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      const primary = sources[0]
      if (!primary) {
        callback({})
        return
      }
      callback({ video: primary, audio: 'loopback' })
    } catch {
      callback({})
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  mediaService.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  mediaService.stop()
})
