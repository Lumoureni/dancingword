import { matchScore, normalizeMeta, USER_AGENT } from '../lyrics/shared'

interface NeteaseSearchSong {
  id: number
  name: string
  artists?: Array<{ name: string }>
  duration?: number
  album?: { picUrl?: string; name?: string }
}

const coverCache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function cacheKey(title: string, artist: string, album: string): string {
  return `${normalizeMeta(title)}|${normalizeMeta(artist)}|${normalizeMeta(album)}`.toLowerCase()
}

/** Prefer a reasonably large NetEase cover URL. */
function pickCoverUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  let url = raw.trim()
  if (!url) return null
  if (url.startsWith('//')) url = `https:${url}`
  if (!/^https?:\/\//i.test(url)) return null
  // NetEase often serves size-specific paths; ask for ~500px when possible.
  if (!url.includes('?')) {
    url = `${url}?param=500y500`
  }
  return url
}

async function searchNeteaseCover(
  title: string,
  artist: string,
  album: string,
  durationMs: number
): Promise<string | null> {
  const t = normalizeMeta(title)
  const a = normalizeMeta(artist)
  if (!t || t === '未知曲目') return null

  const keyword = [t, a].filter(Boolean).join(' ')
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
  if (!res.ok) return null

  const json = (await res.json()) as { result?: { songs?: NeteaseSearchSong[] } }
  const songs = json.result?.songs ?? []
  if (!songs.length) return null

  const durationSec = durationMs > 0 && durationMs / 1000 < 3600 * 6 ? durationMs / 1000 : 0
  const ranked = [...songs].sort((sa, sb) => {
    const scoreA = matchScore({
      title: t,
      artist: a,
      durationSec,
      candTitle: sa.name,
      candArtist: (sa.artists ?? []).map((x) => x.name).join(' '),
      candDurationSec: sa.duration ? sa.duration / 1000 : undefined
    })
    const scoreB = matchScore({
      title: t,
      artist: a,
      durationSec,
      candTitle: sb.name,
      candArtist: (sb.artists ?? []).map((x) => x.name).join(' '),
      candDurationSec: sb.duration ? sb.duration / 1000 : undefined
    })
    return scoreA - scoreB
  })

  const best = ranked[0]
  if (!best) return null
  // Reject poor matches so we don't show a random cover.
  const bestScore = matchScore({
    title: t,
    artist: a,
    durationSec,
    candTitle: best.name,
    candArtist: (best.artists ?? []).map((x) => x.name).join(' '),
    candDurationSec: best.duration ? best.duration / 1000 : undefined
  })
  if (bestScore > 35) return null

  return pickCoverUrl(best.album?.picUrl)
}

/**
 * Resolve album art for a track when SMTC does not publish a thumbnail.
 * Cached per title|artist|album; concurrent callers share one request.
 */
export async function resolveTrackCover(input: {
  title: string
  artist: string
  album: string
  durationMs: number
}): Promise<string | null> {
  const key = cacheKey(input.title, input.artist, input.album)
  if (coverCache.has(key)) return coverCache.get(key) ?? null

  const existing = inflight.get(key)
  if (existing) return existing

  const promise = searchNeteaseCover(
    input.title,
    input.artist,
    input.album,
    input.durationMs
  )
    .then((url) => {
      coverCache.set(key, url)
      // Bound cache size
      if (coverCache.size > 64) {
        const first = coverCache.keys().next().value
        if (first) coverCache.delete(first)
      }
      return url
    })
    .catch(() => {
      // Do not cache hard failures forever — allow retry next track bind.
      return null
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}
