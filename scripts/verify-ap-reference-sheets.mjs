import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const manifestPath = resolve(projectRoot, 'src/data/apReferenceSheets.json')
const assetDirectory = resolve(projectRoot, 'public/assets/ap-reference-sheets')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

if (!Array.isArray(manifest) || manifest.length !== 9) {
  throw new Error(`Expected exactly 9 AP reference sheet entries, found ${manifest.length}`)
}

const slugs = new Set()
const expectedFiles = new Set()
for (const sheet of manifest) {
  if (slugs.has(sheet.slug)) throw new Error(`Duplicate AP reference slug: ${sheet.slug}`)
  if (sheet.slug === 'ap-calculus-bc') throw new Error('AP Calculus BC must not expose a Reference entry')
  slugs.add(sheet.slug)

  const fileName = basename(sheet.src)
  expectedFiles.add(fileName)
  const filePath = resolve(assetDirectory, fileName)
  const fileStats = await stat(filePath)
  if (!fileStats.isFile() || fileStats.size === 0) throw new Error(`Missing AP reference PDF: ${fileName}`)

  const digest = createHash('sha256').update(await readFile(filePath)).digest('hex')
  if (digest !== sheet.sha256) throw new Error(`SHA-256 mismatch for ${fileName}`)
}

const actualFiles = (await readdir(assetDirectory)).filter((file) => file.endsWith('.pdf')).sort()
const expectedFileList = [...expectedFiles].sort()
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFileList)) {
  throw new Error(`AP reference asset set differs from manifest: ${JSON.stringify(actualFiles)}`)
}

console.log(JSON.stringify({ status: 'ok', referenceSheets: manifest.length, files: actualFiles }, null, 2))
