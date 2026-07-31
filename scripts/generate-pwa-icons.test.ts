import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('PWA 图标资产', () => {
  it.each([
    ['pwa-192x192.png', 192, 192],
    ['pwa-512x512.png', 512, 512],
    ['maskable-512x512.png', 512, 512],
    ['apple-touch-icon.png', 180, 180],
  ] as const)('%s 具有精确像素尺寸', async (filename, width, height) => {
    const png = await readFile(path.join(projectRoot, 'public', filename))

    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(width)
    expect(png.readUInt32BE(20)).toBe(height)
  })
})
