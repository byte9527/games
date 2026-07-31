import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const sharp: typeof import('sharp').default = require('sharp')
const execFileAsync = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconFilenames = [
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-512x512.png',
  'apple-touch-icon.png',
] as const

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function decodedRgba(filename: string) {
  return sharp(path.join(projectRoot, 'public', filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
}

function pixelAt(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * width + x) * 4
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0]
}

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

  it.each(['maskable-512x512.png', 'apple-touch-icon.png'] as const)(
    '%s 解码后每个像素及四角都完全不透明',
    async (filename) => {
      const { data, info } = await decodedRgba(filename)

      let firstTransparentPixel = -1
      for (let alphaIndex = 3; alphaIndex < data.length; alphaIndex += 4) {
        if (data[alphaIndex] !== 255) {
          firstTransparentPixel = Math.floor(alphaIndex / 4)
          break
        }
      }
      expect(firstTransparentPixel).toBe(-1)
      expect(pixelAt(data, info.width, 0, 0)[3]).toBe(255)
      expect(pixelAt(data, info.width, info.width - 1, 0)[3]).toBe(255)
      expect(pixelAt(data, info.width, 0, info.height - 1)[3]).toBe(255)
      expect(pixelAt(data, info.width, info.width - 1, info.height - 1)[3]).toBe(255)
    },
  )

  it('maskable 与普通 512 图标不同且安全区内仍包含黑白棋主体', async () => {
    const ordinary = path.join(projectRoot, 'public', 'pwa-512x512.png')
    const maskable = path.join(projectRoot, 'public', 'maskable-512x512.png')
    const { data, info } = await decodedRgba('maskable-512x512.png')
    const blackStone = pixelAt(data, info.width, 206, 206)
    const whiteStone = pixelAt(data, info.width, 306, 306)

    expect(await sha256(maskable)).not.toBe(await sha256(ordinary))
    expect(blackStone[0]).toBeLessThan(80)
    expect(whiteStone[0]).toBeGreaterThan(150)
    expect(blackStone[3]).toBe(255)
    expect(whiteStone[3]).toBe(255)
  })

  it('在临时输出目录原子重建并与提交资产哈希一致且不残留临时文件', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'gomoku-pwa-icons-'))
    try {
      await execFileAsync(process.execPath, ['scripts/generate-pwa-icons.mjs'], {
        cwd: projectRoot,
        env: { ...process.env, PWA_ICON_OUTPUT_DIR: outputDirectory },
      })

      expect((await readdir(outputDirectory)).sort()).toEqual([...iconFilenames].sort())
      for (const filename of iconFilenames) {
        expect(await sha256(path.join(outputDirectory, filename)))
          .toBe(await sha256(path.join(projectRoot, 'public', filename)))
      }
    } finally {
      await rm(outputDirectory, { force: true, recursive: true })
    }
  })
})
