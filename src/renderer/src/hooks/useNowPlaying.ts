import { useCallback, useEffect, useState } from 'react'
import type { MediaTrack, NowPlayingPayload } from '../../../shared/media'

const empty: NowPlayingPayload = {
  sessions: [],
  track: null,
  preferredAppId: null
}

export function useNowPlaying(): {
  payload: NowPlayingPayload
  track: MediaTrack | null
  setPreferredApp: (appId: string | null) => Promise<void>
} {
  const [payload, setPayload] = useState<NowPlayingPayload>(empty)

  useEffect(() => {
    let disposed = false

    void window.dancingword.media.getSnapshot().then((snap) => {
      if (!disposed) setPayload(snap)
    })

    const unsubscribe = window.dancingword.media.onNowPlaying((next) => {
      setPayload(next)
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  const setPreferredApp = useCallback(async (appId: string | null): Promise<void> => {
    const next = await window.dancingword.media.setPreferredApp(appId)
    setPayload(next)
  }, [])

  return { payload, track: payload.track, setPreferredApp }
}
