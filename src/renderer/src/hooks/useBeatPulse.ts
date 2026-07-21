import { useCallback, useEffect, useRef, useState } from 'react'

export interface BeatState {
  energy: number
  beatNonce: number
  active: boolean
  error: string | null
  start: () => Promise<void>
  stop: () => void
}

const COOLDOWN_MS = 180
const SMOOTH = 0.18

type ChromeDesktopConstraints = {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId?: string
    maxWidth?: number
    maxHeight?: number
  }
}

export function useBeatPulse(enabled: boolean): BeatState {
  const [energy, setEnergy] = useState(0)
  const [beatNonce, setBeatNonce] = useState(0)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const lastBeatRef = useRef(0)
  const prevFluxRef = useRef(0)
  const smoothEnergyRef = useRef(0)

  const stop = useCallback((): void => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    void ctxRef.current?.close()
    ctxRef.current = null

    setActive(false)
    setEnergy(0)
  }, [])

  const start = useCallback(async (): Promise<void> => {
    stop()
    setError(null)

    try {
      const sources = await window.dancingword.desktop.getSources()
      const screen = sources[0]
      if (!screen) {
        setError('未找到可捕获的屏幕音频源')
        return
      }

      const audio: ChromeDesktopConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screen.id
        }
      }
      const video: ChromeDesktopConstraints = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screen.id,
          maxWidth: 1,
          maxHeight: 1
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio as unknown as MediaTrackConstraints,
        video: video as unknown as MediaTrackConstraints
      })

      stream.getVideoTracks().forEach((t) => {
        t.stop()
        stream.removeTrack(t)
      })

      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop())
        setError('未能捕获系统音频（请确认播放器正在出声）')
        return
      }

      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)

      const bands = new Float32Array(analyser.frequencyBinCount)
      streamRef.current = stream
      ctxRef.current = ctx
      setActive(true)

      const sampleRate = ctx.sampleRate
      const binHz = sampleRate / analyser.fftSize
      const lowBin = Math.max(1, Math.floor(60 / binHz))
      const highBin = Math.min(bands.length - 1, Math.ceil(150 / binHz))

      const loop = (): void => {
        analyser.getFloatFrequencyData(bands)

        let sum = 0
        let count = 0
        for (let i = lowBin; i <= highBin; i++) {
          const db = bands[i]
          const lin = Math.max(0, Math.min(1, (db + 90) / 70))
          sum += lin
          count++
        }

        const bass = count ? sum / count : 0
        const flux = Math.max(0, bass - prevFluxRef.current)
        prevFluxRef.current = bass

        smoothEnergyRef.current =
          smoothEnergyRef.current * (1 - SMOOTH) + bass * SMOOTH
        setEnergy(smoothEnergyRef.current)

        const now = performance.now()
        const threshold = 0.045 + smoothEnergyRef.current * 0.04
        if (flux > threshold && now - lastBeatRef.current > COOLDOWN_MS) {
          lastBeatRef.current = now
          setBeatNonce((n) => n + 1)
        }

        rafRef.current = requestAnimationFrame(loop)
      }

      rafRef.current = requestAnimationFrame(loop)
    } catch (err) {
      console.warn('[beat] start failed', err)
      setError(err instanceof Error ? err.message : '鼓点检测启动失败')
      setActive(false)
    }
  }, [stop])

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }
    void start()
    return () => stop()
  }, [enabled, start, stop])

  return { energy, beatNonce, active, error, start, stop }
}
