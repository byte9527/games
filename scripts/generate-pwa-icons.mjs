import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(projectRoot, 'public', 'icon-source.svg')
const outputs = [
  { filename: 'pwa-192x192.png', width: 192, height: 192 },
  { filename: 'pwa-512x512.png', width: 512, height: 512 },
  { filename: 'maskable-512x512.png', width: 512, height: 512 },
  { filename: 'apple-touch-icon.png', width: 180, height: 180 },
]

await Promise.all(outputs.map(async ({ filename, width, height }) => {
  const output = path.join(projectRoot, 'public', filename)
  await sharp(source)
    .resize(width, height, { fit: 'cover' })
    .png()
    .toFile(output)

  const metadata = await sharp(output).metadata()
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`${filename} 尺寸错误：期望 ${width}x${height}，实际 ${metadata.width}x${metadata.height}`)
  }
}))
