import type { DancingwordApi } from './index'
import type { LyricsQuery, LyricsResultDto } from '../shared/lyrics'

declare global {
  interface Window {
    dancingword: DancingwordApi & {
      lyrics?: {
        fetch: (query: LyricsQuery) => Promise<LyricsResultDto>
      }
    }
  }
}

export {}
