import type { LyricsQuery, LyricsResultDto } from '../../shared/lyrics'
import {
  emptyResult,
  matchScore,
  normalizeMeta,
  resultFromLrc,
  USER_AGENT
} from './shared'

interface NeteaseSong {
  id: number
  name: string
  artists?: Array<{ name: string }>
  duration?: number
}

async function searchSongs(keyword: string): Promise<NeteaseSong[]> {
  const url = new URL('https://music.163.com/api/search/get/web')
  url.searchParams.set('csrf_token', '')
  url.searchParams.set('type', '1')
  url.searchParams.set('s', keyword)
  url.searchParams.set('offset', '0')
  url.searchParams.set('limit', '8')

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://music.163.com/',
      Accept: '*/*'
    }
  })
  if (!res.ok) throw new Error(`网易云搜索失败: ${res.status}`)
  const json = (await res.json()) as { result?: { songs?: NeteaseSong[] } }
  return json.result?.songs ?? []
}

async function fetchLyric(id: number): Promise<{ lrc?: string; tlyric?: string }> {
  const url = new URL('https://music.163.com/api/song/lyric')
  url.searchParams.set('id', String(id))
  url.searchParams.set('lv', '-1')
  url.searchParams.set('kv', '-1')
  url.searchParams.set('tv', '-1')

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://music.163.com/'
    }
  })
  if (!res.ok) throw new Error(`网易云歌词失败: ${res.status}`)
  const json = (await res.json()) as {
    lrc?: { lyric?: string }
    tlyric?: { lyric?: string }
    nolyric?: boolean
    uncollected?: boolean
  }

  if (json.nolyric || json.uncollected) return {}
  return {
    lrc: json.lrc?.lyric,
    tlyric: json.tlyric?.lyric
  }
}

export async function fetchLyricsFromNetease(
  input: Pick<LyricsQuery, 'title' | 'artist' | 'durationMs'> & { durationSec: number }
): Promise<LyricsResultDto | null> {
  const title = normalizeMeta(input.title)
  const artist = normalizeMeta(input.artist)
  const keyword = [title, artist].filter(Boolean).join(' ')
  if (!keyword) return null

  const songs = await searchSongs(keyword)
  if (!songs.length) return null

  const ranked = [...songs].sort((a, b) => {
    const sa = matchScore({
      title,
      artist,
      durationSec: input.durationSec,
      candTitle: a.name,
      candArtist: (a.artists ?? []).map((x) => x.name).join(' '),
      candDurationSec: a.duration ? a.duration / 1000 : undefined
    })
    const sb = matchScore({
      title,
      artist,
      durationSec: input.durationSec,
      candTitle: b.name,
      candArtist: (b.artists ?? []).map((x) => x.name).join(' '),
      candDurationSec: b.duration ? b.duration / 1000 : undefined
    })
    return sa - sb
  })

  const best = ranked[0]
  if (!best?.id) return null

  // Reject very poor matches
  const bestScore = matchScore({
    title,
    artist,
    durationSec: input.durationSec,
    candTitle: best.name,
    candArtist: (best.artists ?? []).map((x) => x.name).join(' '),
    candDurationSec: best.duration ? best.duration / 1000 : undefined
  })
  if (bestScore > 35) return null

  const lyric = await fetchLyric(best.id)
  if (!lyric.lrc?.trim()) return emptyResult()

  return resultFromLrc(lyric.lrc, lyric.tlyric)
}
