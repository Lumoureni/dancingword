export interface ArtPalette {
  primary: string
  secondary: string
  deep: string
  glow: string
}

const DEFAULT_PALETTE: ArtPalette = {
  primary: '42, 34, 28',
  secondary: '29, 22, 18',
  deep: '12, 11, 10',
  glow: '196, 165, 116'
}

function clamp(n: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function rgbKey(r: number, g: number, b: number): string {
  // quantize to reduce noise
  return `${r >> 4},${g >> 4},${b >> 4}`
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === 0) return 0
  return (max - min) / max
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function darken(r: number, g: number, b: number, amount: number): [number, number, number] {
  return [clamp(r * (1 - amount)), clamp(g * (1 - amount)), clamp(b * (1 - amount))]
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    clamp(a[0] + (b[0] - a[0]) * t),
    clamp(a[1] + (b[1] - a[1]) * t),
    clamp(a[2] + (b[2] - a[2]) * t)
  ]
}

function toCssRgb(rgb: [number, number, number]): string {
  return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`
}

/**
 * Extract a mood palette from album art (data URL or blob URL).
 * Returns RGB triplets without `rgb()` wrapper for CSS variable composition.
 */
export async function extractArtPalette(src: string): Promise<ArtPalette> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'

    img.onload = () => {
      try {
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(DEFAULT_PALETTE)
          return
        }

        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        const buckets = new Map<string, { r: number; g: number; b: number; w: number }>()

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 200) continue

          const lum = luminance(r, g, b)
          const sat = saturation(r, g, b)
          // Skip near-white / near-black noise
          if (lum < 0.08 || lum > 0.92) continue

          const weight = 0.35 + sat * 1.4 + (lum > 0.2 && lum < 0.75 ? 0.35 : 0)
          const key = rgbKey(r, g, b)
          const prev = buckets.get(key)
          if (prev) {
            prev.r += r * weight
            prev.g += g * weight
            prev.b += b * weight
            prev.w += weight
          } else {
            buckets.set(key, { r: r * weight, g: g * weight, b: b * weight, w: weight })
          }
        }

        const ranked = Array.from(buckets.values())
          .map((v) => ({
            r: v.r / v.w,
            g: v.g / v.w,
            b: v.b / v.w,
            w: v.w,
            sat: saturation(v.r / v.w, v.g / v.w, v.b / v.w)
          }))
          .sort((a, b) => b.w * (0.6 + b.sat) - a.w * (0.6 + a.sat))

        if (!ranked.length) {
          resolve(DEFAULT_PALETTE)
          return
        }

        const dominant: [number, number, number] = [
          ranked[0].r,
          ranked[0].g,
          ranked[0].b
        ]
        const secondarySrc = ranked[1]
          ? ([ranked[1].r, ranked[1].g, ranked[1].b] as [number, number, number])
          : mix(dominant, [20, 16, 14], 0.45)

        // Prefer a more saturated sample for glow accent
        const glowCand = [...ranked].sort((a, b) => b.sat - a.sat)[0]
        const glow: [number, number, number] = glowCand
          ? [glowCand.r, glowCand.g, glowCand.b]
          : dominant

        const primary = darken(dominant[0], dominant[1], dominant[2], 0.35)
        const secondary = darken(secondarySrc[0], secondarySrc[1], secondarySrc[2], 0.45)
        const deep = darken(dominant[0], dominant[1], dominant[2], 0.78)
        const glowSoft = mix(glow, [255, 230, 190], 0.15)

        resolve({
          primary: toCssRgb(primary),
          secondary: toCssRgb(secondary),
          deep: toCssRgb(deep),
          glow: toCssRgb(glowSoft)
        })
      } catch {
        resolve(DEFAULT_PALETTE)
      }
    }

    img.onerror = () => resolve(DEFAULT_PALETTE)
    img.src = src
  })
}

export { DEFAULT_PALETTE }
