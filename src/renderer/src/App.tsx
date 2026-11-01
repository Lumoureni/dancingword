import { useCallback, useEffect, useState } from 'react'
import type { TransportCommand } from '../../shared/media'
import { HudControls } from './components/HudControls'
import { ImmersiveStage } from './components/ImmersiveStage'
import { useBeatPulse } from './hooks/useBeatPulse'
import { useLyrics } from './hooks/useLyrics'
import { useNowPlaying } from './hooks/useNowPlaying'
import './styles/stage.css'

const PREFERRED_KEY = 'dancingword.preferredAppId'
const BEAT_KEY = 'dancingword.beatEnabled'

function readBeatEnabled(): boolean {
  const raw = localStorage.getItem(BEAT_KEY)
  return raw === null ? true : raw === '1'
}

export default function App(): React.JSX.Element {
  const { payload, track, setPreferredApp } = useNowPlaying()
  const { lyrics, loading, error, currentIndex } = useLyrics(track)
  const [hudVisible, setHudVisible] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [beatEnabled, setBeatEnabled] = useState(readBeatEnabled)
  const [prefsReady, setPrefsReady] = useState(false)
  const [transportBusy, setTransportBusy] = useState(false)
  const beat = useBeatPulse(beatEnabled)

  useEffect(() => {
    const saved = localStorage.getItem(PREFERRED_KEY)
    if (saved) {
      void setPreferredApp(saved).finally(() => setPrefsReady(true))
    } else {
      setPrefsReady(true)
    }
  }, [setPreferredApp])

  useEffect(() => {
    localStorage.setItem(BEAT_KEY, beatEnabled ? '1' : '0')
  }, [beatEnabled])

  // Sync beat toggle when changed from settings window
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === BEAT_KEY) setBeatEnabled(readBeatEnabled())
    }
    const onFocus = (): void => setBeatEnabled(readBeatEnabled())
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const preferredMissing =
    Boolean(payload.preferredAppId) &&
    !payload.sessions.some((s) => s.appId === payload.preferredAppId)

  useEffect(() => {
    let hideTimer = 0
    let inside = false

    const show = (): void => {
      setHudVisible(true)
      window.clearTimeout(hideTimer)
      if (inside) {
        hideTimer = window.setTimeout(() => setHudVisible(false), 2800)
      }
    }

    const hide = (): void => {
      inside = false
      window.clearTimeout(hideTimer)
      setHudVisible(false)
    }

    const onEnter = (): void => {
      inside = true
      show()
    }

    const onMove = (): void => {
      if (!inside) inside = true
      show()
    }

    const onLeave = (e: MouseEvent): void => {
      // Ignore leave events that still land inside the document
      const related = e.relatedTarget as Node | null
      if (related && document.documentElement.contains(related)) return
      hide()
    }

    document.documentElement.addEventListener('mouseenter', onEnter)
    document.documentElement.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('blur', hide)

    return () => {
      document.documentElement.removeEventListener('mouseenter', onEnter)
      document.documentElement.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('blur', hide)
      window.clearTimeout(hideTimer)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'f' || e.key === 'F') {
        void window.dancingword.window.toggleFullscreen()
      }
      if (e.key === 'Escape') {
        void window.dancingword.window.isFullscreen().then((fs) => {
          if (fs) void window.dancingword.window.toggleFullscreen()
        })
      }
      if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void window.dancingword.window.openSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onToggleAlwaysOnTop = useCallback(() => {
    const next = !alwaysOnTop
    void window.dancingword.window.setAlwaysOnTop(next).then(setAlwaysOnTop)
  }, [alwaysOnTop])

  const sendTransport = useCallback(async (command: TransportCommand): Promise<void> => {
    if (transportBusy) return
    setTransportBusy(true)
    try {
      const result = await window.dancingword.media.control(command)
      if (!result.ok && result.message) {
        console.warn('[transport]', command, result.message)
      }
    } catch (err) {
      console.warn('[transport] failed', command, err)
    } finally {
      // Brief lock so rapid clicks don't double-fire media commands.
      window.setTimeout(() => setTransportBusy(false), 280)
    }
  }, [transportBusy])

  if (!prefsReady) {
    return <div className="app" />
  }

  return (
    <div className="app">
      <ImmersiveStage
        track={track}
        lyrics={lyrics}
        loading={loading}
        error={error}
        currentIndex={currentIndex}
        energy={beat.energy}
        beatNonce={beat.beatNonce}
        preferredMissing={preferredMissing}
        beatHint={
          beatEnabled
            ? beat.error
              ? `鼓点不可用：${beat.error}`
              : beat.active
                ? null
                : '正在启动鼓点检测…'
            : null
        }
      />
      <HudControls
        visible={hudVisible}
        alwaysOnTop={alwaysOnTop}
        beatEnabled={beatEnabled}
        beatActive={beat.active}
        hasTrack={Boolean(track)}
        playbackStatus={track?.playbackStatus ?? 'unknown'}
        transportBusy={transportBusy}
        onOpenSettings={() => void window.dancingword.window.openSettings()}
        onToggleAlwaysOnTop={onToggleAlwaysOnTop}
        onToggleFullscreen={() => void window.dancingword.window.toggleFullscreen()}
        onToggleBeat={() => setBeatEnabled((v) => !v)}
        onMinimize={() => void window.dancingword.window.minimize()}
        onClose={() => void window.dancingword.window.close()}
        onPlayPause={() => void sendTransport('playPause')}
        onNext={() => void sendTransport('next')}
        onPrevious={() => void sendTransport('previous')}
      />
    </div>
  )
}
