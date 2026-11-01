import { useEffect, useRef, useState } from 'react'
import type { MediaTrack } from '../../../shared/media'
import type { LyricsResult } from '../services/lyricsApi'
import { DEFAULT_PALETTE, extractArtPalette, type ArtPalette } from '../services/artPalette'
import { LyricLine } from './LyricLine'

interface ImmersiveStageProps {
  track: MediaTrack | null
  lyrics: LyricsResult | null
  loading: boolean
  error: string | null
  currentIndex: number
  energy: number
  beatNonce: number
  preferredMissing: boolean
  beatHint?: string | null
}

export function ImmersiveStage({
  track,
  lyrics,
  loading,
  error,
  currentIndex,
  energy,
  beatNonce,
  preferredMissing,
  beatHint
}: ImmersiveStageProps): React.JSX.Element {
  const [pulse, setPulse] = useState(false)
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const [prevArtUrl, setPrevArtUrl] = useState<string | null>(null)
  const [palette, setPalette] = useState<ArtPalette>(DEFAULT_PALETTE)
  const artUrlRef = useRef<string | null>(null)
  const artTimer = useRef(0)

  useEffect(() => {
    if (!beatNonce) return
    setPulse(true)
    const t = window.setTimeout(() => setPulse(false), 220)
    return () => window.clearTimeout(t)
  }, [beatNonce])

  useEffect(() => {
    const next = track?.thumbnail ?? null
    if (next === artUrlRef.current) return

    window.clearTimeout(artTimer.current)
    if (artUrlRef.current) {
      setPrevArtUrl(artUrlRef.current)
      artTimer.current = window.setTimeout(() => setPrevArtUrl(null), 900)
    }
    artUrlRef.current = next
    setArtUrl(next)

    return () => window.clearTimeout(artTimer.current)
  }, [track?.thumbnail])

  useEffect(() => {
    let cancelled = false
    if (!artUrl) {
      setPalette(DEFAULT_PALETTE)
      return
    }

    void extractArtPalette(artUrl).then((next) => {
      if (!cancelled) setPalette(next)
    })

    return () => {
      cancelled = true
    }
  }, [artUrl])

  const lines = lyrics?.lines ?? []
  const prev = currentIndex > 0 ? lines[currentIndex - 1]?.text : ''
  const current =
    currentIndex >= 0 ? lines[currentIndex]?.text : track ? '♪' : '等待音乐…'
  const next = currentIndex >= 0 ? lines[currentIndex + 1]?.text : ''

  const brightness = 0.4 + energy * 0.45
  const hasArt = Boolean(artUrl || prevArtUrl)

  return (
    <div
      className={`stage${hasArt ? ' stage--has-art' : ''}${pulse ? ' stage--beat' : ''}`}
      style={
        {
          '--energy': String(energy),
          '--beat-scale': pulse ? '1.035' : '1',
          '--art-primary': palette.primary,
          '--art-secondary': palette.secondary,
          '--art-deep': palette.deep,
          '--art-glow': palette.glow
        } as React.CSSProperties
      }
    >
      <div className="stage__color-wash" aria-hidden />

      <div className="stage__art-stack" aria-hidden>
        {prevArtUrl ? (
          <div
            className="stage__art stage__art--leaving"
            style={{ backgroundImage: `url(${prevArtUrl})` }}
          />
        ) : null}
        {artUrl ? (
          <div
            key={artUrl.slice(0, 64)}
            className="stage__art stage__art--active"
            style={{ backgroundImage: `url(${artUrl})` }}
          />
        ) : null}
      </div>

      <div className="stage__veil" />
      <div className="stage__atmosphere" style={{ opacity: brightness }} />

      <div className="stage__brand">Dancingword</div>

      {artUrl ? (
        <div className="stage__cover" aria-hidden>
          <div
            key={`card-${artUrl.slice(0, 64)}`}
            className="stage__cover-card"
            style={{ backgroundImage: `url(${artUrl})` }}
          />
        </div>
      ) : null}

      <div className="stage__meta">
        {track ? (
          <>
            <div className="stage__title">{track.title}</div>
            <div className="stage__artist">
              {track.artist}
              {track.appName ? ` · ${track.appName}` : ''}
            </div>
          </>
        ) : (
          <div className="stage__artist">
            {preferredMissing
              ? '已选择来源，但当前没有该播放器的媒体会话。请先在对应软件中播放。'
              : '请在网易云中开始播放（默认仅识别网易云）'}
          </div>
        )}
      </div>

      <div className="stage__lyrics">
        {loading ? (
          <p className="lyric-line lyric-line--current lyric-line--enter">正在寻找歌词…</p>
        ) : error ? (
          <p className="lyric-line lyric-line--current lyric-line--error">{error}</p>
        ) : lyrics?.instrumental ? (
          <p className="lyric-line lyric-line--current lyric-line--enter">纯音乐</p>
        ) : lyrics?.source === 'synced' && lines.length ? (
          <>
            <LyricLine
              key={`p-${currentIndex - 1}`}
              text={prev || ''}
              role="prev"
              lineKey={currentIndex - 1}
              beatPulse={false}
            />
            <LyricLine
              key={`c-${currentIndex}`}
              text={current || ''}
              role="current"
              lineKey={currentIndex}
              beatPulse={pulse}
            />
            <LyricLine
              key={`n-${currentIndex + 1}`}
              text={next || ''}
              role="next"
              lineKey={currentIndex + 1}
              beatPulse={false}
            />
          </>
        ) : lyrics?.source === 'plain' && lyrics.plainText ? (
          <pre className="lyric-plain lyric-line--enter">{lyrics.plainText}</pre>
        ) : track ? (
          <p className="lyric-line lyric-line--current lyric-line--enter">未找到歌词</p>
        ) : (
          <LyricLine text="等待音乐…" role="current" lineKey={-1} beatPulse={pulse} />
        )}
      </div>

      <div className="stage__hint">
        {beatHint ?? '移动鼠标显示控制 · 离开窗口自动隐藏 · 设置或 Ctrl+, 配置来源'}
      </div>
    </div>
  )
}
