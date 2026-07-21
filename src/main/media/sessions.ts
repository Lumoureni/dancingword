import {
  createSessionManager,
  shutdown as shutdownDefault,
  type MediaSession,
  type SessionManager
} from 'windows-media-sessions'
import type {
  MediaSessionInfo,
  MediaTrack,
  NowPlayingPayload,
  PlaybackStatus
} from '../../shared/media'

type SessionListener = (payload: NowPlayingPayload) => void

function mapStatus(status: string | undefined): PlaybackStatus {
  switch (status) {
    case 'playing':
      return 'playing'
    case 'paused':
      return 'paused'
    case 'stopped':
    case 'closed':
      return 'stopped'
    default:
      return 'unknown'
  }
}

function resolveAppName(session: MediaSession): string {
  const name = session.sourceAppDisplayName?.trim()
  if (name) return name

  const aumid = session.sourceAppUserModelId ?? ''
  const lower = aumid.toLowerCase()
  if (lower.includes('cloudmusic') || lower.includes('netease')) return '网易云音乐'
  if (lower.includes('qqmusic')) return 'QQ音乐'
  if (lower.includes('spotify')) return 'Spotify'
  return aumid || '未知应用'
}

function toTrack(session: MediaSession): MediaTrack {
  return {
    title: session.title?.trim() || '未知曲目',
    artist: session.artist?.trim() || '未知艺术家',
    album: session.albumTitle?.trim() || '',
    durationMs: Math.max(0, Number(session.timeline?.durationMs ?? 0)),
    positionMs: Math.max(0, Number(session.timeline?.positionMs ?? 0)),
    playbackStatus: mapStatus(session.playbackStatus),
    thumbnail: session.thumbnail ?? null,
    appId: session.sourceAppUserModelId ?? '',
    appName: resolveAppName(session)
  }
}

function toSessionInfo(session: MediaSession): MediaSessionInfo {
  return {
    appId: session.sourceAppUserModelId ?? '',
    appName: resolveAppName(session),
    playbackStatus: mapStatus(session.playbackStatus),
    title: session.title?.trim() || '',
    artist: session.artist?.trim() || ''
  }
}

function pickSession(
  sessions: readonly MediaSession[],
  preferredAppId: string | null
): MediaSession | null {
  if (!sessions.length) return null

  if (preferredAppId) {
    const preferred = sessions.find((s) => s.sourceAppUserModelId === preferredAppId)
    return preferred ?? null
  }

  const playing = sessions.find((s) => s.playbackStatus === 'playing')
  return playing ?? sessions[0] ?? null
}

export class MediaSessionService {
  private preferredAppId: string | null = null
  private unsubscribe: (() => void) | null = null
  private listeners = new Set<SessionListener>()
  private manager: SessionManager | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private burstTimers: Array<ReturnType<typeof setTimeout>> = []
  private lastPayload: NowPlayingPayload = {
    sessions: [],
    track: null,
    preferredAppId: null
  }

  start(): void {
    if (this.unsubscribe) return

    this.manager = createSessionManager({ notifyDebounceMs: 25 })
    this.unsubscribe = this.manager.onSessionsChanged((sessions) => {
      this.emit(sessions)
    })

    // Kick the backend and pull first snapshot
    void this.manager.getAllSessions().then((sessions) => this.emit(sessions))

    // Mid-song open: SMTC timeline is often stale until a few refreshes land
    this.forceRefresh()
    for (const delay of [200, 500, 1000, 2000]) {
      this.burstTimers.push(
        setTimeout(() => {
          this.forceRefresh()
        }, delay)
      )
    }

    // Keep timeline fresh while playing (many players only tick infrequently)
    this.pollTimer = setInterval(() => {
      if (this.lastPayload.track?.playbackStatus === 'playing') {
        this.forceRefresh()
      }
    }, 1000)
  }

  stop(): void {
    for (const t of this.burstTimers) clearTimeout(t)
    this.burstTimers = []
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.unsubscribe?.()
    this.unsubscribe = null
    void this.manager?.stop()
    this.manager = null
    void shutdownDefault()
  }

  /** Ask the .NET backend for a fresh GSMTC snapshot (includes timeline). */
  forceRefresh(): void {
    try {
      const backend = (this.manager as unknown as { backend?: { requestRefresh?: () => void } })
        ?.backend
      backend?.requestRefresh?.()
    } catch (err) {
      console.warn('[media] refresh failed', err)
    }
  }

  async refreshNow(): Promise<NowPlayingPayload> {
    this.forceRefresh()
    // Give the backend a beat to reply, then return latest cache
    await new Promise((r) => setTimeout(r, 120))
    if (this.manager) {
      const sessions = await this.manager.getAllSessions()
      this.emit(sessions)
    }
    return this.lastPayload
  }

  setPreferredAppId(appId: string | null): void {
    this.preferredAppId = appId
    this.forceRefresh()
    void this.manager
      ?.getAllSessions()
      .then((sessions) => this.emit(sessions))
      .catch(() => this.emit([]))
  }

  getSnapshot(): NowPlayingPayload {
    return this.lastPayload
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener)
    listener(this.lastPayload)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(sessions: readonly MediaSession[]): void {
    const infos = sessions
      .filter((s) => Boolean(s.sourceAppUserModelId))
      .map(toSessionInfo)

    const unique = new Map<string, MediaSessionInfo>()
    for (const info of infos) {
      const existing = unique.get(info.appId)
      if (!existing || info.playbackStatus === 'playing') {
        unique.set(info.appId, info)
      }
    }

    const selected = pickSession(sessions, this.preferredAppId)
    const track = selected ? toTrack(selected) : null

    this.lastPayload = {
      sessions: Array.from(unique.values()),
      track,
      preferredAppId: this.preferredAppId
    }

    for (const listener of Array.from(this.listeners)) {
      listener(this.lastPayload)
    }
  }
}
