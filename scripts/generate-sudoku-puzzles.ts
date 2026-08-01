import { writeFile } from 'node:fs/promises'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRootUrl = new URL('../', import.meta.url)
const sourceRootUrl = new URL('src/', projectRootUrl).href
const resolveHookSource = `
import { extname } from 'node:path'

const sourceRootUrl = ${JSON.stringify(sourceRootUrl)}

export async function resolve(specifier, context, nextResolve) {
  const parentUrl = context.parentURL
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  const isProjectTypeScriptParent =
    typeof parentUrl === 'string' &&
    parentUrl.startsWith(sourceRootUrl) &&
    parentUrl.endsWith('.ts')
  const resolvedPath =
    typeof parentUrl === 'string' && isRelative
      ? new URL(specifier, parentUrl).pathname
      : ''

  if (isProjectTypeScriptParent && isRelative && extname(resolvedPath) === '') {
    return nextResolve(specifier + '.ts', context)
  }

  return nextResolve(specifier, context)
}
`

register(`data:text/javascript,${encodeURIComponent(resolveHookSource)}`, import.meta.url)

const { generateSudokuPuzzleCatalog } = await import(
  '../src/games/sudoku/puzzles/generator.ts'
)

const startedAt = performance.now()
const catalog = generateSudokuPuzzleCatalog()
const outputPath = new URL('../src/games/sudoku/puzzles/data.ts', import.meta.url)

const serializedPuzzles = catalog.puzzles
  .map(
    (puzzle) => `  {
    id: ${JSON.stringify(puzzle.id)},
    difficulty: ${JSON.stringify(puzzle.difficulty)},
    givens: ${JSON.stringify(puzzle.givens)},
    solution: ${JSON.stringify(puzzle.solution)},
  },`,
  )
  .join('\n')

const output = `// 此文件由 scripts/generate-sudoku-puzzles.ts 确定性生成，请勿手工修改。
export const builtinSudokuPuzzleData = [
${serializedPuzzles}
] as const
`

await writeFile(outputPath, output, 'utf8')

const elapsedMs = Math.round(performance.now() - startedAt)
const relativeOutputPath = fileURLToPath(outputPath).slice(
  fileURLToPath(projectRootUrl).length,
)

for (const statistic of catalog.statistics) {
  console.log(
    `${statistic.difficulty}: accepted ${statistic.acceptedPuzzles}, attempted ${statistic.attemptedSeeds} seeds`,
  )
}

console.log(
  `Wrote ${catalog.puzzles.length} puzzles to ${relativeOutputPath} in ${elapsedMs} ms`,
)
