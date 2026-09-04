import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const suites = [
  {
    name: 'SAT',
    examDirectory: resolve(root, 'public/data/ep-v2/epExams'),
    contentDirectory: resolve(root, 'public/data/ep-v2/epTopicContents'),
  },
  {
    name: 'ACT',
    examDirectory: resolve(root, 'public/data/act/ep-v2/epExams'),
    contentDirectory: resolve(root, 'public/data/act/ep-v2/epTopicContents'),
  },
]

const failures = []
let examCount = 0
let questionCount = 0
let choiceCount = 0
let topicDocumentCount = 0
let topicQuestionCount = 0
const nonAbcdLabelCounts = new Map()

function normalizedChoiceText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function hasEmbeddedOptionBlock(stem, optionValues) {
  if (optionValues.length < 2) return false
  const markers = [...String(stem || '').matchAll(/(?:^|\n)\s*([A-Z])[).:]\s+/g)]
  for (let start = markers.length - optionValues.length; start >= 0; start -= 1) {
    const candidate = markers.slice(start, start + optionValues.length)
    const parsedValues = candidate.map((marker, index) => {
      const valueStart = marker.index + marker[0].length
      const valueEnd = candidate[index + 1]?.index ?? stem.length
      return stem.slice(valueStart, valueEnd).trim()
    })
    if (parsedValues.every((value, index) => normalizedChoiceText(value) === normalizedChoiceText(optionValues[index]))) return true
  }
  return false
}

function verifyQuestion(question, context) {
  const labels = Object.keys(question.options ?? {})
  const optionValues = Object.values(question.options ?? {})
  questionCount += 1

  if (labels.length) {
    choiceCount += labels.length
    if (labels.length < 2) failures.push(`${context}: choice question has fewer than two options`)
    if (new Set(labels).size !== labels.length) failures.push(`${context}: duplicate answer labels`)
    if (labels.some((label) => !/^[A-Z]+$/.test(label))) failures.push(`${context}: invalid answer label (${labels.join(', ')})`)
    if (!labels.includes(question.correctAnswer)) failures.push(`${context}: correct answer ${question.correctAnswer} is not a rendered option (${labels.join(', ')})`)
    if (question.type === 'STUDENT_PRODUCED_RESPONSE') failures.push(`${context}: choice question is typed as a student-produced response`)
    for (const label of labels.filter((label) => !['A', 'B', 'C', 'D'].includes(label))) {
      nonAbcdLabelCounts.set(label, (nonAbcdLabelCounts.get(label) ?? 0) + 1)
    }
  } else if (question.type !== 'STUDENT_PRODUCED_RESPONSE') {
    failures.push(`${context}: ${question.type || 'untyped'} question has no options but is not a student-produced response`)
  }

  if (hasEmbeddedOptionBlock(question.stem, optionValues)) {
    failures.push(`${context}: answer choices are embedded in the question stem`)
  }
}

for (const suite of suites) {
  const files = (await readdir(suite.examDirectory))
    .filter((file) => /^\d+\.json$/.test(file))
    .sort((left, right) => Number.parseInt(left) - Number.parseInt(right))

  for (const file of files) {
    const path = resolve(suite.examDirectory, file)
    const exam = JSON.parse(await readFile(path, 'utf8'))
    examCount += 1

    for (const question of exam.questions ?? []) {
      const context = `${path.replace(`${root}/`, '')} question ${question.id}`
      verifyQuestion(question, context)
    }
  }

  const contentFiles = (await readdir(suite.contentDirectory))
    .filter((file) => /^\d+-(?:quiz|studyGuide)\.json$/.test(file))
    .sort()

  for (const file of contentFiles) {
    const path = resolve(suite.contentDirectory, file)
    const document = JSON.parse(await readFile(path, 'utf8'))
    const questions = document.contentType === 'studyGuide'
      ? document.payload.items ?? []
      : document.payload.questions ?? []
    topicDocumentCount += 1
    topicQuestionCount += questions.length
    for (const question of questions) {
      verifyQuestion(question, `${path.replace(`${root}/`, '')} question ${question.id}`)
    }
  }
}

if (failures.length) {
  console.error(`Exam option integrity failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Question option integrity verified: ${examCount} exams, ${topicDocumentCount} Study Plan/Quiz documents, ${questionCount} total questions (${topicQuestionCount} Study Plan/Targeted Practice/Mini Quiz), ${choiceCount} rendered choices, non-ABCD labels ${JSON.stringify(Object.fromEntries([...nonAbcdLabelCounts].sort()))}.`)
