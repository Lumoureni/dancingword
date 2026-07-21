import type { LyricsQuery, LyricsResultDto } from '../../shared/lyrics'
import {
  cacheKey,
  emptyResult,
  normalizeDurationSec,
  normalizeMeta,
  parseLrc,
  USER_AGENT
} from './shared'
import { fetchLyricsFromNetease } from './netease'
import { fetchLyricsFromQq } from './qq'

interface LrcLibRecord {
  id: number
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

const cache = new Map<string, LyricsResultDto>()

function toResult(record: LrcLibRecord | null): LyricsResultDto {
  if (!record) return emptyResult()
  if (record.instrumental) return emptyResult(true)

  const synced = parseLrc(record.syncedLyrics)
  if (synced.length) {
    return {
      lines: synced,
      plainText: record.plainLyrics,
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

  return emptyResult()
}

async function lrclibFetch(url: URL): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': `Dancingword/1.0.0 (${USER_AGENT})`,
      Accept: 'application/json'
    }
  })
}

async function fetchGet(params: {
  track_name: string
  artist_name: string
  album_name: string
  duration: number
}): Promise<LrcLibRecord | null> {
  const url = new URL('https://lrclib.net/api/get')
  url.searchParams.set('track_name', params.track_name)
  url.searchParams.set('artist_name', params.artist_name)
  url.searchParams.set('album_name', params.album_name || params.track_name)
  url.searchParams.set('duration', String(Math.round(params.duration)))

  const res = await lrclibFetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB get failed: ${res.status}`)
  return (await res.json()) as LrcLibRecord
}

async function fetchSearch(params: {
  track_name: string
  artist_name: string
  duration: number
  useQuery?: boolean
}): Promise<LrcLibRecord | null> {
  const url = new URL('https://lrclib.net/api/search')
  if (params.useQuery) {
    const q = [params.track_name, params.artist_name].filter(Boolean).join(' ')
    url.searchParams.set('q', q)
  } else {
    url.searchParams.set('track_name', params.track_name)
    if (params.artist_name) url.searchParams.set('artist_name', params.artist_name)
  }

  const res = await lrclibFetch(url)
  if (!res.ok) throw new Error(`LRCLIB search failed: ${res.status}`)
  const list = (await res.json()) as LrcLibRecord[]
  if (!list.length) return null

  const target = params.duration
  const ranked = [...list].sort((a, b) => {
    const da = Math.abs((a.duration ?? 0) - (target || a.duration || 0))
    const db = Math.abs((b.duration ?? 0) - (target || b.duration || 0))
    const syncBonusA = a.syncedLyrics ? 0 : 1
    const syncBonusB = b.syncedLyrics ? 0 : 1
    return da - db || syncBonusA - syncBonusB
  })

  return ranked[0] ?? null
}

async function fetchFromLrclib(input: {
  title: string
  artist: string
  album: string
  durationSec: number
}): Promise<LyricsResultDto> {
  let record: LrcLibRecord | null = null

  try {
    if (input.durationSec > 0) {
      record = await fetchGet({
        track_name: input.title,
        artist_name: input.artist || 'Unknown',
        album_name: input.album,
        duration: input.durationSec
      })
    }
  } catch (err) {
    console.warn('[lyrics] lrclib get failed', err)
  }

  if (!record) {
    try {
      record = await fetchSearch({
        track_name: input.title,
        artist_name: input.artist,
        duration: input.durationSec
      })
    } catch (err) {
      console.warn('[lyrics] lrclib search failed', err)
    }
  }

  if (!record) {
    try {
      record = await fetchSearch({
        track_name: input.title,
        artist_name: input.artist,
        duration: input.durationSec,
        useQuery: true
      })
    } catch (err) {
      console.warn('[lyrics] lrclib query failed', err)
    }
  }

  return toResult(record)
}

/** LRCLIB → 网易云 → QQ 音乐 */
export async function fetchLyricsFromLrclib(input: LyricsQuery): Promise<LyricsResultDto> {
  const title = normalizeMeta(input.title)
  const artist = normalizeMeta(input.artist)
  const album = normalizeMeta(input.album)

  if (!title || title === '未知曲目') {
    return emptyResult()
  }

  const durationSec = normalizeDurationSec(input.durationMs)
  const key = cacheKey(artist, title, durationSec)
  const cached = cache.get(key)
  if (cached && cached.source !== 'none') return cached

  let result = await fetchFromLrclib({ title, artist, album, durationSec })

  if (result.source === 'none' && !result.instrumental) {
    try {
      const netease = await fetchLyricsFromNetease({
        title,
        artist,
        durationMs: input.durationMs,
        durationSec
      })
      if (netease && (netease.source !== 'none' || netease.instrumental)) {
        console.info('[lyrics] matched via NetEase')
        result = netease
      }
    } catch (err) {
      console.warn('[lyrics] netease failed', err)
    }
  }

  if (result.source === 'none' && !result.instrumental) {
    try {
      const qq = await fetchLyricsFromQq({
        title,
        artist,
        durationMs: input.durationMs,
        durationSec
      })
      if (qq && (qq.source !== 'none' || qq.instrumental)) {
        console.info('[lyrics] matched via QQ Music')
        result = qq
      }
    } catch (err) {
      console.warn('[lyrics] qq failed', err)
    }
  }

  if (result.source !== 'none' || result.instrumental) {
    cache.set(key, result)
  }

  return result
}
