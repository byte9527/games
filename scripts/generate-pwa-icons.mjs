import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(projectRoot, 'public', 'icon-source.svg')
const outputs = [
  { filename: 'pwa-192x192.png', width: 192, height: 192, opaque: false },
  { filename: 'pwa-512x512.png', width: 512, height: 512, opaque: false },
  { filename: 'maskable-512x512.png', width: 512, height: 512, opaque: true },
  { filename: 'apple-touch-icon.png', width: 180, height: 180, opaque: true },
]

function resolveOutputDirectory() {
  const outputFlagIndex = process.argv.indexOf('--output-dir')
  if (outputFlagIndex >= 0) {
    const argument = process.argv[outputFlagIndex + 1]
    if (typeof argument !== 'string' || argument.length === 0) {
      throw new Error('--output-dir 需要提供目录路径。')
    }
    return path.resolve(projectRoot, argument)
  }
  const environmentDirectory = process.env.PWA_ICON_OUTPUT_DIR
  return environmentDirectory === undefined || environmentDirectory.length === 0
    ? path.join(projectRoot, 'public')
    : path.resolve(projectRoot, environmentDirectory)
}

async function validateIcon(output, { filename, width, height, opaque }) {
  const image = sharp(output)
  const metadata = await image.metadata()
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`${filename} 尺寸错误：期望 ${width}x${height}，实际 ${metadata.width}x${metadata.height}`)
  }
  if (!opaque) return

  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let alphaIndex = 3; alphaIndex < data.length; alphaIndex += 4) {
    if (data[alphaIndex] !== 255) throw new Error(`${filename} 包含透明像素。`)
  }
}

const outputDirectory = resolveOutputDirectory()
await mkdir(outputDirectory, { recursive: true })
const temporaryDirectory = await mkdtemp(path.join(outputDirectory, '.pwa-icons-'))

try {
  await Promise.all(outputs.map(async (definition) => {
    const { filename, width, height, opaque } = definition
    const output = path.join(temporaryDirectory, filename)
    let pipeline = sharp(source).resize(width, height, { fit: 'cover' })
    if (opaque) pipeline = pipeline.flatten({ background: '#6f4b2a' })
    await pipeline.png().toFile(output)
    await validateIcon(output, definition)
  }))

  for (const { filename } of outputs) {
    await rename(
      path.join(temporaryDirectory, filename),
      path.join(outputDirectory, filename),
    )
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
