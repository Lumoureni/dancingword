import type { LyricsQuery, LyricsResultDto, LyricLineDto } from '../../../shared/lyrics'

export type LyricsResult = LyricsResultDto

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]/g

function parseLrc(raw: string | null | undefined): LyricLineDto[] {
  if (!raw?.trim()) return []
  const lines: LyricLineDto[] = []

  for (const line of raw.split(/\r?\n/)) {
    const text = line.replace(TIME_TAG, '').trim()
    if (!text) continue
    TIME_TAG.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ?? '0'
      const millis =
        fraction.length === 1
          ? Number(fraction) * 100
          : fraction.length === 2
            ? Number(fraction) * 10
            : Number(fraction.padEnd(3, '0').slice(0, 3))
      lines.push({
        timeMs: minutes * 60_000 + seconds * 1_000 + millis,
        text
      })
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

function toResult(record: {
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
} | null): LyricsResult {
  if (!record) {
    return { lines: [], plainText: null, source: 'none', instrumental: false }
  }
  if (record.instrumental) {
    return { lines: [], plainText: null, source: 'none', instrumental: true }
  }
  const synced = parseLrc(record.syncedLyrics)
  if (synced.length) {
    return {
      lines: synced,
      plainText: record.plainLyrics ?? null,
      source: 'synced',
      instrumental: false
    }
  }
  if (record.plainLyrics?.trim()) {
    return {
      lines: [],
      plainText: record.plainLyrics.trim(),
      source: 'plain',
      instrumental: false
    }
  }
  return { lines: [], plainText: null, source: 'none', instrumental: false }
}

/** Renderer fallback when preload is stale (hot reload without full restart). */
async function fetchLyricsFallback(input: LyricsQuery): Promise<LyricsResult> {
  const title = input.title.trim()
  const artist = input.artist.trim()
  if (!title) {
    return { lines: [], plainText: null, source: 'none', instrumental: false }
  }

  const durationSec =
    input.durationMs > 0 && input.durationMs / 1000 < 3600 * 6
      ? Math.round(input.durationMs / 1000)
      : 0

  if (durationSec > 0) {
    try {
      const url = new URL('https://lrclib.net/api/get')
      url.searchParams.set('track_name', title)
      url.searchParams.set('artist_name', artist || 'Unknown')
      url.searchParams.set('album_name', input.album.trim() || title)
      url.searchParams.set('duration', String(durationSec))
      const res = await fetch(url)
      if (res.ok) return toResult(await res.json())
    } catch {
      // continue to search
    }
  }

  const search = new URL('https://lrclib.net/api/search')
  search.searchParams.set('track_name', title)
  if (artist) search.searchParams.set('artist_name', artist)
  const res = await fetch(search)
  if (!res.ok) throw new Error(`歌词搜索失败: ${res.status}`)
  const list = (await res.json()) as Array<{
    duration?: number
    instrumental?: boolean
    plainLyrics?: string | null
    syncedLyrics?: string | null
  }>
  if (!list.length) return toResult(null)

  const ranked = [...list].sort((a, b) => {
    const da = Math.abs((a.duration ?? 0) - (durationSec || a.duration || 0))
    const db = Math.abs((b.duration ?? 0) - (durationSec || b.duration || 0))
    return da - db || (a.syncedLyrics ? 0 : 1) - (b.syncedLyrics ? 0 : 1)
  })

  return toResult(ranked[0] ?? null)
}

export async function fetchLyrics(input: LyricsQuery): Promise<LyricsResult> {
  const lyricsApi = window.dancingword?.lyrics
  if (lyricsApi && typeof lyricsApi.fetch === 'function') {
    return lyricsApi.fetch(input)
  }

  console.warn('[lyrics] preload API missing, using renderer fallback — please fully restart the app')
  return fetchLyricsFallback(input)
}
