export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'unknown'

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
