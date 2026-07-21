export interface LyricLine {
  timeMs: number
  text: string
}

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]/g

export function parseLrc(raw: string | null | undefined): LyricLine[] {
  if (!raw?.trim()) return []

  const lines: LyricLine[] = []

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

export function findCurrentLineIndex(lines: LyricLine[], positionMs: number): number {
  if (!lines.length) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= positionMs) idx = i
    else break
  }
  return idx
}
