import { contextBridge, ipcRenderer } from 'electron'
import type { NowPlayingPayload, TransportCommand, TransportResult } from '../shared/media'
import type { LyricsQuery, LyricsResultDto } from '../shared/lyrics'

export interface DesktopSource {
  id: string
  name: string
}

const api = {
  media: {
    getSnapshot: (): Promise<NowPlayingPayload> =>
      ipcRenderer.invoke('media:get-snapshot'),
    refresh: (): Promise<NowPlayingPayload> => ipcRenderer.invoke('media:refresh'),
    setPreferredApp: (appId: string | null): Promise<NowPlayingPayload> =>
      ipcRenderer.invoke('media:set-preferred-app', appId),
    control: (command: TransportCommand): Promise<TransportResult> =>
      ipcRenderer.invoke('media:control', command),
    onNowPlaying: (callback: (payload: NowPlayingPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: NowPlayingPayload): void => {
        callback(payload)
      }
      ipcRenderer.on('media:now-playing', handler)
      return () => ipcRenderer.removeListener('media:now-playing', handler)
    }
  },
  lyrics: {
    fetch: (query: LyricsQuery): Promise<LyricsResultDto> =>
      ipcRenderer.invoke('lyrics:fetch', query)
  },
  window: {
    setAlwaysOnTop: (flag: boolean): Promise<boolean> =>
      ipcRenderer.invoke('window:set-always-on-top', flag),
    toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-fullscreen'),
    isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:is-fullscreen'),
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    openSettings: (): Promise<void> => ipcRenderer.invoke('window:open-settings')
  },
  desktop: {
    getSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('desktop:get-sources')
  }
}

contextBridge.exposeInMainWorld('dancingword', api)

export type DancingwordApi = typeof api
