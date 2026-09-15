import assert from 'node:assert/strict'
import { access, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const exam = JSON.parse(await readFile(resolve(root, 'public/data/ep-v2/epExams/1.json'), 'utf8'))
const expectedAnswers = {
  'Reading and Writing|Module 1': 'ABBACBDDCCCBAAAACDCBACCCCCABB BBCC'.replaceAll(' ', '').split(''),
  'Reading and Writing|Module 2': 'AADAADBBDD DABADAAADBDCAD AABDA DDAC'.replaceAll(' ', '').split(''),
  'Math|Module 1': ['C', 'A', 'D', 'A', 'D', '77', '25', 'C', 'B', 'B', 'B', 'B', '1', '76', 'A', 'D', 'D', 'A', 'A', '35', '113', 'A', 'C', 'C', 'D', 'A', '29/3; 9.666; 9.667'],
  'Math|Module 2': ['D', 'A', 'D', 'D', 'A', '79', '2', 'D', 'D', 'B', 'A', 'C', '41', '11875', 'B', 'B', 'B', 'A', 'C', '5', '0.25; 1/4', 'D', 'C', 'C', 'D', 'B', '104'],
}
const expectedCounts = new Map([
  ['Reading and Writing|Module 1', 33],
  ['Reading and Writing|Module 2', 33],
  ['Math|Module 1', 27],
  ['Math|Module 2', 27],
])

assert.equal(exam.examCode, 'SAT-PT10')
assert.equal(exam.totalCount, 120)
assert.equal(exam.questions.length, 120)

const grouped = new Map()
const referencedAssets = new Set()
for (const question of exam.questions) {
  const key = `${question.sectionTitle}|${question.module}`
  if (!grouped.has(key)) grouped.set(key, [])
  grouped.get(key).push(question)
  assert.ok(question.stem.trim(), `${question.sourceQuestionId} must include its complete stem`)
  assert.ok(question.explanation.trim(), `${question.sourceQuestionId} must include its official explanation`)
  if (question.stimulusMaterial?.pictureUrl) referencedAssets.add(question.stimulusMaterial.pictureUrl)
  for (const image of Object.values(question.optionPictureUrls ?? {})) referencedAssets.add(image)
}

for (const [key, expectedCount] of expectedCounts) {
  const questions = grouped.get(key) ?? []
  assert.equal(questions.length, expectedCount, `${key} question count`)
  assert.deepEqual(questions.map((question) => question.correctAnswer), expectedAnswers[key], `${key} official answer key`)
}

assert.equal(referencedAssets.size, 18, 'All 18 required question and answer-choice images must be referenced')
for (const assetUrl of referencedAssets) {
  const path = resolve(root, `public${assetUrl}`)
  await access(path)
  assert.ok((await stat(path)).size > 2_000, `${assetUrl} must contain a non-empty rendered figure`)
}

console.log(JSON.stringify({
  status: 'ok',
  exam: exam.exam,
  questions: exam.questions.length,
  modules: Object.fromEntries([...grouped].map(([key, questions]) => [key, questions.length])),
  referencedImages: referencedAssets.size,
}, null, 2))
