import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const examPath = resolve(root, 'public/data/act/ep-v2/epExams/1.json')
const exam = JSON.parse(await readFile(examPath, 'utf8'))
const expectedCounts = { english: 50, mathematics: 45, reading: 36, science: 40, writing: 1 }
const expectedScored = { english: 40, mathematics: 41, reading: 27, science: 34, writing: 1 }
const answerKeys = {
  english: 'A F B J B J D H B G B J A H D H D F A H C H A G C J C G B F C J A G C F B F C J A G D G D H C J A G'.split(' '),
  mathematics: 'B J B H B H C J D G A J B J B F C G A J A F B H A H B G B H B F D F C J C G C J A J A H D'.split(' '),
  reading: 'B H A G D F C G C G D F D J A H A H A F A G A H B G A J C F C J D H A F'.split(' '),
  science: 'D H C F B G B J A J D G A H B J A G B H C H B G C J A F D F B F B J D H C J B F'.split(' '),
}
const failures = []

if (exam.totalCount !== 172 || exam.questions.length !== 172) failures.push(`Expected 172 total items, found ${exam.totalCount}/${exam.questions.length}.`)

for (const [sectionId, count] of Object.entries(expectedCounts)) {
  const questions = exam.questions.filter((question) => question.sectionId === sectionId)
  if (questions.length !== count) failures.push(`${sectionId}: expected ${count} items, found ${questions.length}.`)
  if (questions.filter((question) => question.isScored).length !== expectedScored[sectionId]) failures.push(`${sectionId}: scored-item count is incorrect.`)
  if (sectionId === 'writing') continue
  questions.forEach((question, index) => {
    const labels = Object.keys(question.options ?? {})
    if (labels.length !== 4) failures.push(`${sectionId} ${index + 1}: expected 4 answer choices.`)
    if (question.correctAnswer !== answerKeys[sectionId][index]) failures.push(`${sectionId} ${index + 1}: answer key mismatch.`)
    if (!String(question.stem || '').trim()) failures.push(`${sectionId} ${index + 1}: missing question stem.`)
  })
}

const writing = exam.questions.find((question) => question.sectionId === 'writing')
if (!writing?.stimulusMaterial?.perspectives || writing.stimulusMaterial.perspectives.length !== 3) failures.push('Writing: expected the issue and all three perspectives.')
if (writing?.maximumRawPoints !== 12 || writing?.responseType !== 'STUDENT_PRODUCED_RESPONSE') failures.push('Writing: expected an open response scored on a 2–12 practice scale.')

const math = exam.questions.filter((question) => question.sectionId === 'mathematics')
const mathVisuals = new Set()
for (const question of math) {
  const number = question.scoreDetail?.sourceQuestionNumber
  const assetPaths = question.stimulusMaterial?.pictureUrls ?? []
  if (question.visualIncludesStem) failures.push(`Mathematics ${number}: question text must not be embedded in the figure.`)
  if (question.optionPictureUrls && Object.values(question.optionPictureUrls).some(Boolean)) failures.push(`Mathematics ${number}: answer choices must remain live text.`)
  if (!Object.values(question.options).every((option) => String(option).trim())) failures.push(`Mathematics ${number}: blank live-text answer choice.`)
  for (const assetPath of assetPaths) {
    mathVisuals.add(assetPath)
    if (!/-figure-\d+\.webp$/.test(assetPath)) failures.push(`Mathematics ${number}: non-figure asset ${assetPath}.`)
    if (!assetPath?.startsWith('/assets/')) failures.push(`Mathematics ${question.scoreDetail?.sourceQuestionNumber}: invalid asset path.`)
    else {
      try { await access(resolve(root, 'public', assetPath.slice(1))) } catch { failures.push(`Missing asset ${assetPath}.`) }
    }
  }
}
if (mathVisuals.size !== 13) failures.push(`Mathematics: expected 13 figure/table/graph assets, found ${mathVisuals.size}.`)
if (!math.some((question) => String(question.stem).includes('\\frac')) || !math.some((question) => String(question.stem).includes('\\sqrt'))) failures.push('Mathematics: expected explicit LaTeX fractions and radicals in live question text.')

const science = exam.questions.filter((question) => question.sectionId === 'science')
const scienceVisuals = new Set()
const scienceBodies = new Map()
for (const question of science) {
  const number = question.scoreDetail?.sourceQuestionNumber
  const body = String(question.stimulusMaterial?.body || '')
  if (body.length < 150 || body.includes('Use the original passage')) failures.push(`Science ${number}: missing live passage/experiment text.`)
  scienceBodies.set(question.stimulusMaterial?.id, body)
  const assetPaths = question.stimulusMaterial?.pictureUrls ?? []
  if (!assetPaths.length) failures.push(`Science ${number}: missing source figure/table assets.`)
  for (const assetPath of assetPaths) {
    scienceVisuals.add(assetPath)
    if (!/-figure-\d+\.webp$/.test(assetPath)) failures.push(`Science ${number}: non-figure asset ${assetPath}.`)
    try { await access(resolve(root, 'public', assetPath.slice(1))) } catch { failures.push(`Missing asset ${assetPath}.`) }
  }
}
if (scienceBodies.size !== 7) failures.push(`Science: expected 7 distinct live-text passages, found ${scienceBodies.size}.`)
if (scienceVisuals.size !== 21) failures.push(`Science: expected 21 source figure/table assets, found ${scienceVisuals.size}.`)

const generatedAssets = await readdir(resolve(root, 'public/assets/act-practice-test-3'))
const forbiddenScreenshot = generatedAssets.find((name) => /math-q\d+-(?:stem|[a-dfghj])\.webp/.test(name) || /science-passage-\d+\.webp/.test(name))
if (forbiddenScreenshot) failures.push(`Text-bearing legacy screenshot remains: ${forbiddenScreenshot}.`)

const readingTablePath = exam.questions
  .filter((question) => question.sectionId === 'reading')
  .map((question) => question.stimulusMaterial?.pictureUrl)
  .find(Boolean)
if (!readingTablePath) failures.push('Reading: expected the Passage II table visual.')
else {
  try { await access(resolve(root, 'public', readingTablePath.slice(1))) } catch { failures.push(`Missing asset ${readingTablePath}.`) }
}

const highlightedPassages = new Map()
for (const question of exam.questions.filter((item) => item.sectionId === 'english')) {
  const body = String(question.stimulusMaterial?.body || '')
  highlightedPassages.set(question.stimulusMaterial?.id, body.match(/\[\[.*?\]\]/g)?.length ?? 0)
}
const authoredHighlights = [...highlightedPassages.values()].reduce((sum, count) => sum + count, 0)
if (!authoredHighlights) failures.push('English: no authored underline-to-highlight references were preserved.')

if (failures.length) {
  console.error(`ACT Practice Test 3 verification failed with ${failures.length} issue(s):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`ACT Practice Test 3 verified: 171 live-text multiple-choice questions + 1 live-text Writing task, ${mathVisuals.size} Math figure/table assets, ${scienceVisuals.size} Science figure/table assets across 7 live-text passages, 1 Reading table visual, ${authoredHighlights} unique English underline highlights, explicit Math LaTeX, and exact official answer labels.`)
