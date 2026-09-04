import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(root, 'public/data/act/ep-v2/epTopicContents')

function normalizedChoiceText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function embeddedOptionBlock(stem, optionValues) {
  if (optionValues.length < 2) return null
  const markers = [...String(stem || '').matchAll(/(?:^|\n)\s*([A-Z])[).:]\s+/g)]
  for (let start = markers.length - optionValues.length; start >= 0; start -= 1) {
    const candidate = markers.slice(start, start + optionValues.length)
    const labels = candidate.map((marker) => marker[1])
    if (new Set(labels).size !== labels.length) continue
    const parsedValues = candidate.map((marker, index) => {
      const valueStart = marker.index + marker[0].length
      const valueEnd = candidate[index + 1]?.index ?? stem.length
      return stem.slice(valueStart, valueEnd).trim()
    })
    if (parsedValues.every((value, index) => normalizedChoiceText(value) === normalizedChoiceText(optionValues[index]))) {
      return { stem: stem.slice(0, candidate[0].index).trim(), labels }
    }
  }
  return null
}

function normalizeQuestion(question) {
  const entries = Object.entries(question.options ?? {})
  if (!entries.length) return { question, changed: false, recoveredLabels: [] }
  const block = embeddedOptionBlock(question.stem, entries.map(([, value]) => value))
  if (!block) {
    if (!(question.correctAnswer in question.options)) {
      throw new Error(`${question.sourceQuestionId}: answer ${question.correctAnswer} is outside the rendered options`)
    }
    return { question, changed: false, recoveredLabels: [] }
  }
  const options = Object.fromEntries(entries.map(([, value], index) => [block.labels[index], value]))
  if (!(question.correctAnswer in options)) {
    throw new Error(`${question.sourceQuestionId}: answer ${question.correctAnswer} is outside recovered options ${block.labels.join(', ')}`)
  }
  return {
    question: { ...question, stem: block.stem, options },
    changed: block.stem !== question.stem || JSON.stringify(options) !== JSON.stringify(question.options),
    recoveredLabels: block.labels.filter((label) => !['A', 'B', 'C', 'D'].includes(label)),
  }
}

const files = (await readdir(directory)).filter((file) => /^\d+-(?:quiz|studyGuide)\.json$/.test(file))
let documentsChanged = 0
let questionsChecked = 0
let questionsChanged = 0
const recoveredLabelCounts = new Map()

for (const file of files) {
  const path = resolve(directory, file)
  const document = JSON.parse(await readFile(path, 'utf8'))
  const key = document.contentType === 'studyGuide' ? 'items' : 'questions'
  const questions = document.payload[key] ?? []
  let documentChanged = false
  document.payload[key] = questions.map((question) => {
    questionsChecked += 1
    const normalized = normalizeQuestion(question)
    if (normalized.changed) {
      documentChanged = true
      questionsChanged += 1
    }
    for (const label of normalized.recoveredLabels) {
      recoveredLabelCounts.set(label, (recoveredLabelCounts.get(label) ?? 0) + 1)
    }
    return normalized.question
  })
  if (documentChanged) {
    await writeFile(path, JSON.stringify(document))
    documentsChanged += 1
  }
}

console.log(JSON.stringify({
  documentsChecked: files.length,
  documentsChanged,
  questionsChecked,
  questionsChanged,
  recoveredLabelCounts: Object.fromEntries([...recoveredLabelCounts].sort()),
}, null, 2))
