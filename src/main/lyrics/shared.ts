import type { LyricLineDto, LyricsResultDto } from '../../shared/lyrics'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]/g

export function parseLrc(raw: string | null | undefined): LyricLineDto[] {
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

export function normalizeMeta(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*[-–—]\s*(单曲|歌曲|Official|MV|Audio|Lyric Video).*$/i, '')
    .replace(
      /\s*[\(\[（【].{0,40}?(官方|正式|Live|Remix|伴奏|纯音乐|歌词|高清|完整版).*?[\)\]）】]/gi,
      ''
    )
    .trim()
}

export function emptyResult(instrumental = false): LyricsResultDto {
  return { lines: [], plainText: null, source: 'none', instrumental }
}

export function resultFromLrc(
  synced: string | null | undefined,
  plain?: string | null
): LyricsResultDto {
  const lines = parseLrc(synced)
  if (lines.length) {
    return {
      lines,
      plainText: plain?.trim() || synced || null,
      source: 'synced',
      instrumental: false
    }
  }

  const plainText = (plain ?? synced)?.trim() || null
  if (plainText) {
    return { lines: [], plainText, source: 'plain', instrumental: false }
  }

  return emptyResult()
}

export function normalizeDurationSec(durationMs: number): number {
  let durationSec = durationMs > 0 ? durationMs / 1000 : 0
  if (durationSec > 3600 * 6) durationSec = durationMs / 1_000_000
  if (durationSec > 3600 * 6) durationSec = 0
  return durationSec
}

export function cacheKey(artist: string, title: string, durationSec: number): string {
  return `${artist}|${title}|${Math.round(durationSec)}`.toLowerCase()
}

/** Lower is better. */
export function matchScore(input: {
  title: string
  artist: string
  durationSec: number
  candTitle: string
  candArtist: string
  candDurationSec?: number
}): number {
  const t = input.title.toLowerCase()
  const a = input.artist.toLowerCase()
  const ct = input.candTitle.toLowerCase()
  const ca = input.candArtist.toLowerCase()

  let score = 0
  if (ct === t) score -= 50
  else if (ct.includes(t) || t.includes(ct)) score -= 25
  else score += 40

  if (a) {
    if (ca === a) score -= 40
    else if (ca.includes(a) || a.includes(ca)) score -= 20
    else score += 25
  }

  if (input.durationSec > 0 && input.candDurationSec && input.candDurationSec > 0) {
    score += Math.min(40, Math.abs(input.candDurationSec - input.durationSec))
  }

  return score
}
