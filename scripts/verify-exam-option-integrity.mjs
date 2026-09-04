import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const examDirectories = [
  resolve(root, 'public/data/ep-v2/epExams'),
  resolve(root, 'public/data/act/ep-v2/epExams'),
]

const failures = []
let examCount = 0
let questionCount = 0
let choiceCount = 0

for (const directory of examDirectories) {
  const files = (await readdir(directory))
    .filter((file) => /^\d+\.json$/.test(file))
    .sort((left, right) => Number.parseInt(left) - Number.parseInt(right))

  for (const file of files) {
    const path = resolve(directory, file)
    const exam = JSON.parse(await readFile(path, 'utf8'))
    examCount += 1

    for (const question of exam.questions ?? []) {
      questionCount += 1
      const labels = Object.keys(question.options ?? {})
      const context = `${path.replace(`${root}/`, '')} question ${question.id}`

      if (labels.length) {
        choiceCount += labels.length
        if (new Set(labels).size !== labels.length) failures.push(`${context}: duplicate answer labels`)
        if (!labels.includes(question.correctAnswer)) failures.push(`${context}: correct answer ${question.correctAnswer} is not a rendered option (${labels.join(', ')})`)
      } else if (question.type === 'MULTIPLE_CHOICE') {
        failures.push(`${context}: multiple-choice question has no options`)
      }

      if (/(?:^|\n)\s*[A-Z]\)\s+\S/m.test(String(question.stem ?? ''))) {
        failures.push(`${context}: answer choices are embedded in the question stem`)
      }
    }
  }
}

if (failures.length) {
  console.error(`Exam option integrity failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Exam option integrity verified: ${examCount} exams, ${questionCount} questions, ${choiceCount} rendered choices.`)
