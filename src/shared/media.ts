export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'unknown'

export interface MediaControlCaps {
  canPlay: boolean
  canPause: boolean
  canSkipNext: boolean
  canSkipPrevious: boolean
}

export interface MediaTrack {
  title: string
  artist: string
  album: string
  durationMs: number
  positionMs: number
  playbackStatus: PlaybackStatus
  thumbnail: string | null
  appId: string
  appName: string
  controls: MediaControlCaps
}

export interface MediaSessionInfo {
  appId: string
  appName: string
  playbackStatus: PlaybackStatus
  title: string
  artist: string
}

export interface NowPlayingPayload {
  sessions: MediaSessionInfo[]
  track: MediaTrack | null
  preferredAppId: string | null
}

export type TransportCommand = 'playPause' | 'next' | 'previous'

export interface TransportResult {
  ok: boolean
  method: 'smtc' | 'media-key' | 'none'
  message?: string
}
