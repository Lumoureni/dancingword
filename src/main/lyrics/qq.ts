import type { LyricsQuery, LyricsResultDto } from '../../shared/lyrics'
import {
  emptyResult,
  matchScore,
  normalizeMeta,
  resultFromLrc,
  USER_AGENT
} from './shared'

interface QqSong {
  songmid: string
  songname: string
  singer?: Array<{ name: string }>
  interval?: number
}

function stripJsonp(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed)
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1))
  }
  throw new Error('QQ 音乐返回无法解析')
}

async function searchSongs(keyword: string): Promise<QqSong[]> {
  const url = new URL('https://c.y.qq.com/soso/fcgi-bin/client_search_cp')
  url.searchParams.set('p', '1')
  url.searchParams.set('n', '8')
  url.searchParams.set('w', keyword)
  url.searchParams.set('format', 'json')

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://y.qq.com/'
    }
  })
  if (!res.ok) throw new Error(`QQ 音乐搜索失败: ${res.status}`)
  const json = (await res.json()) as {
    data?: { song?: { list?: QqSong[] } }
  }
  return json.data?.song?.list ?? []
}

async function fetchLyric(songmid: string): Promise<string | null> {
  const url = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg')
  url.searchParams.set('songmid', songmid)
  url.searchParams.set('format', 'json')
  url.searchParams.set('nobase64', '1')
  url.searchParams.set('g_tk', '5381')

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://y.qq.com/'
    }
  })
  if (!res.ok) throw new Error(`QQ 音乐歌词失败: ${res.status}`)
  const json = stripJsonp(await res.text()) as {
    lyric?: string
    retcode?: number
  }
  if (!json.lyric?.trim()) return null
  // QQ may HTML-entity encode
  return json.lyric
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, (m) => {
      const n = Number(m.slice(2, -1))
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    })
}

export async function fetchLyricsFromQq(
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
      candTitle: a.songname,
      candArtist: (a.singer ?? []).map((x) => x.name).join(' '),
      candDurationSec: a.interval
    })
    const sb = matchScore({
      title,
      artist,
      durationSec: input.durationSec,
      candTitle: b.songname,
      candArtist: (b.singer ?? []).map((x) => x.name).join(' '),
      candDurationSec: b.interval
    })
    return sa - sb
  })

  const best = ranked[0]
  if (!best?.songmid) return null

  const bestScore = matchScore({
    title,
    artist,
    durationSec: input.durationSec,
    candTitle: best.songname,
    candArtist: (best.singer ?? []).map((x) => x.name).join(' '),
    candDurationSec: best.interval
  })
  if (bestScore > 35) return null

  const lyric = await fetchLyric(best.songmid)
  if (!lyric?.trim()) return emptyResult()

  return resultFromLrc(lyric)
}
