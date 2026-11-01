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

  // Detect SMTC timeline that does not advance while status is playing
  // (common with NetEase / third-party SMTC plugins).
  const smtcHealthRef = useRef({
    lastPos: 0,
    lastWall: 0,
    stuckSamples: 0,
    trusted: true
  })

  const trackKeyRef = useRef('')
  const hasTrack = track !== null
  const key = track ? `${track.appId}|${track.artist}|${track.title}` : ''
  const durationKey = track ? Math.round(track.durationMs / 1000) : 0
  const positionSample = track?.positionMs ?? 0
  const statusSample = track?.playbackStatus ?? 'unknown'

  const hardAnchor = useCallback((pos: number, playing: boolean): void => {
    const now = performance.now()
    anchorRef.current = { positionMs: pos, wallMs: now, playing }
    setPositionMs(pos)
    smtcHealthRef.current = {
      lastPos: pos,
      lastWall: now,
      stuckSamples: 0,
      trusted: true
    }
  }, [])

  const applyAnchor = useCallback(
    (pos: number, playing: boolean, force = false): void => {
      const now = performance.now()
      const prev = anchorRef.current
      const extrapolated = prev.playing
        ? prev.positionMs + (now - prev.wallMs)
        : prev.positionMs
      const jump = pos - extrapolated
      const statusChanged = playing !== prev.playing

      const health = smtcHealthRef.current

      // --- Untrusted SMTC (timeline was frozen) ---
      // Recover when a sample suddenly appears far ahead (real position finally
      // published after a cold start / mid-song open), or when it is close
      // enough to re-establish trust.
      if (!health.trusted && !force) {
        if (playing && jump > 800) {
          hardAnchor(pos, playing)
          return
        }
        if (Math.abs(jump) < 400) {
          health.trusted = true
          health.stuckSamples = 0
          health.lastPos = pos
          health.lastWall = now
          anchorRef.current = { ...prev, playing }
          return
        }
        anchorRef.current = { ...prev, playing }
        return
      }

      // --- Intentional events: track change / initial bind / explicit refresh ---
      if (force || statusChanged) {
        // Cold start mid-song: first snapshot often reports positionMs≈0 while
        // audio is already playing. Bind locally but mark SMTC untrusted so a
        // later real timeline sample can hard-anchor to the true position.
        if (playing && pos < 500 && extrapolated > 0) {
          hardAnchor(pos, playing)
          if (jump < -800 || extrapolated > 1500) {
            health.trusted = false
            health.stuckSamples = 2
          }
          return
        }
        hardAnchor(pos, playing)
        return
      }

      if (playing) {
        if (!health.lastWall) {
          health.lastPos = pos
          health.lastWall = now
        } else {
          const wallDelta = now - health.lastWall
          // Sampled about once per second from the main process.
          if (wallDelta >= 700) {
            const posDelta = pos - health.lastPos
            // Position must keep up with wall clock, or at least not stay frozen.
            if (posDelta < wallDelta * 0.35) {
              health.stuckSamples += 1
            } else {
              health.stuckSamples = Math.max(0, health.stuckSamples - 1)
              health.trusted = true
            }
            health.lastPos = pos
            health.lastWall = now
          }

          // ~2 consecutive slow samples → treat SMTC timeline as untrustworthy.
          if (health.stuckSamples >= 2) {
            health.trusted = false
          }
        }
      } else {
        // Paused: a static position is expected.
        health.lastPos = pos
        health.lastWall = now
        health.stuckSamples = 0
        health.trusted = true
      }

      // Stuck / lagging SMTC: don't pull the local clock backward.
      if (!health.trusted) {
        // Still accept a clear forward catch-up (real timeline finally landed).
        if (playing && jump > 800) {
          hardAnchor(pos, playing)
          return
        }
        anchorRef.current = { ...prev, playing }
        return
      }

      // Large backward sample: almost always stale timeline — keep extrapolating.
      // Only accept a real seek-back when SMTC looks healthy and the gap is huge.
      if (jump < -800) {
        if (jump < -4000) {
          hardAnchor(pos, playing)
        } else {
          anchorRef.current = { ...prev, playing }
        }
        return
      }

      // Large forward sample = user seek; trust it while source is healthy.
      if (jump > 1200) {
        hardAnchor(pos, playing)
        return
      }

      // Near-identical sample — don't reset wall clock (would freeze progress).
      if (Math.abs(jump) < 80) {
        anchorRef.current = { ...prev, playing }
        return
      }

      // Small positive drift — soft re-anchor to reduce long-term skew.
      if (jump > 0) {
        anchorRef.current = { positionMs: pos, wallMs: now, playing }
        setPositionMs(pos)
        return
      }

      // Mild negative (SMTC slightly behind): keep local extrapolation.
      anchorRef.current = { ...prev, playing }
    },
    [hardAnchor]
  )

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

        // Mid-song open: SMTC timeline may still be stale (often 0).
        // If refresh finally reports a real position ahead of our clock, hard-bind.
        try {
          const snap = await window.dancingword.media.refresh()
          const fresh = snap?.track
          if (
            fresh &&
            fresh.title === track.title &&
            fresh.artist === track.artist
          ) {
            const anchor = anchorRef.current
            const livePos = anchor.playing
              ? anchor.positionMs + (performance.now() - anchor.wallMs)
              : anchor.positionMs
            const shouldForce =
              fresh.positionMs > livePos + 800 ||
              (!anchor.playing && fresh.positionMs > 0 && livePos < 200)
            applyAnchor(
              fresh.positionMs,
              fresh.playbackStatus === 'playing',
              shouldForce
            )
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
    if (!hasTrack) {
      setPositionMs(0)
      trackKeyRef.current = ''
      anchorRef.current = {
        positionMs: 0,
        wallMs: performance.now(),
        playing: false
      }
      smtcHealthRef.current = {
        lastPos: 0,
        lastWall: 0,
        stuckSamples: 0,
        trusted: true
      }
      return
    }

    const trackChanged = key !== trackKeyRef.current
    trackKeyRef.current = key
    applyAnchor(
      positionSample,
      statusSample === 'playing',
      // Only force on true track change; subsequent samples go through health checks.
      trackChanged
    )
    // Depend on sample fields + key only — main process rebuilds the track
    // object every poll even when values are unchanged.
  }, [hasTrack, positionSample, statusSample, key, applyAnchor])

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
