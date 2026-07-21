export interface LyricLineDto {
  timeMs: number
  text: string
}

export interface LyricsResultDto {
  lines: LyricLineDto[]
  plainText: string | null
  source: 'synced' | 'plain' | 'none'
  instrumental: boolean
}

export interface LyricsQuery {
  title: string
  artist: string
  album: string
  durationMs: number
}
