import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaTrack } from '../../../shared/media'
import { fetchLyrics, type LyricsResult } from '../services/lyricsApi'
import { findCurrentLineIndex } from '../services/parseLrc'

export function useLyrics(track: MediaTrack | null): {
  lyrics: LyricsResult | null
  loading: boolean
  error: string | null
  positionMs: number
  currentIndex: number
} {
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionMs, setPositionMs] = useState(0)

  const anchorRef = useRef<{
    positionMs: number
    wallMs: number
    playing: boolean
  }>({ positionMs: 0, wallMs: performance.now(), playing: false })

  const trackKeyRef = useRef('')
  const key = track ? `${track.appId}|${track.artist}|${track.title}` : ''
  const durationKey = track ? Math.round(track.durationMs / 1000) : 0

  const applyAnchor = useCallback((pos: number, playing: boolean, force = false): void => {
    const now = performance.now()
    const prev = anchorRef.current
    const extrapolated = prev.playing
      ? prev.positionMs + (now - prev.wallMs)
      : prev.positionMs
    const jump = pos - extrapolated
    const statusChanged = playing !== prev.playing

    if (force || statusChanged || Math.abs(jump) > 1200) {
      anchorRef.current = { positionMs: pos, wallMs: now, playing }
      setPositionMs(pos)
      return
    }

    // Stale SMTC sample behind our live clock — keep extrapolating
    if (jump < -300) return

    // Near-identical sample — don't reset wall clock (would freeze progress)
    if (Math.abs(jump) < 80) {
      anchorRef.current = { ...prev, playing }
      return
    }

    // Fresh sample slightly ahead — soft re-anchor
    anchorRef.current = { positionMs: pos, wallMs: now, playing }
    setPositionMs(pos)
  }, [])

  useEffect(() => {
    if (!track) {
      setLyrics(null)
      setError(null)
      setLoading(false)
      return
    }

    if (!track.title || track.title === '未知曲目') {
      setLyrics(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchLyrics({
      title: track.title,
      artist: track.artist === '未知艺术家' ? '' : track.artist,
      album: track.album,
      durationMs: track.durationMs
    })
      .then(async (result) => {
        if (cancelled) return
        setLyrics(result)
        setLoading(false)

        // After lyrics arrive, re-pull SMTC timeline — mid-song open often
        // had a stale position during the fetch window.
        try {
          const snap = await window.dancingword.media.refresh()
          const fresh = snap?.track
          if (
            fresh &&
            fresh.title === track.title &&
            fresh.artist === track.artist
          ) {
            applyAnchor(fresh.positionMs, fresh.playbackStatus === 'playing', true)
          }
        } catch {
          // optional API
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLyrics(null)
          setError(err instanceof Error ? err.message : '歌词加载失败')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [key, durationKey, applyAnchor])

  useEffect(() => {
    if (!track) {
      setPositionMs(0)
      trackKeyRef.current = ''
      anchorRef.current = {
        positionMs: 0,
        wallMs: performance.now(),
        playing: false
      }
      return
    }

    const trackChanged = key !== trackKeyRef.current
    trackKeyRef.current = key
    applyAnchor(track.positionMs, track.playbackStatus === 'playing', trackChanged)
  }, [track?.positionMs, track?.playbackStatus, key, track, applyAnchor])

  useEffect(() => {
    let raf = 0

    const tick = (): void => {
      const anchor = anchorRef.current
      if (anchor.playing) {
        const elapsed = performance.now() - anchor.wallMs
        setPositionMs(anchor.positionMs + elapsed)
      } else {
        setPositionMs(anchor.positionMs)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key])

  const currentIndex = useMemo(() => {
    if (!lyrics?.lines.length) return -1
    return findCurrentLineIndex(lyrics.lines, positionMs)
  }, [lyrics, positionMs])

  return { lyrics, loading, error, positionMs, currentIndex }
}
