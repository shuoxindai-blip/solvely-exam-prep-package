import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', 'public/data/abitur-mathematik/ep-v2')
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const preparation = await readJson('epPreparations/5001.json')
const index = await readJson('epTopicContents/index.json')
const exam = await readJson('epExams/1.json')
const topics = preparation.outline.topicGroups.flatMap((group) => group.topics)

assert(topics.length === 31, `Expected 31 topics, found ${topics.length}`)
assert(preparation.metadata.totals.flashcards === 620, `Expected 620 flashcards, found ${preparation.metadata.totals.flashcards}`)
assert(preparation.metadata.totals.quizQuestions === 930, `Expected 930 topic-quiz questions, found ${preparation.metadata.totals.quizQuestions}`)
assert(preparation.metadata.totals.practiceQuestions === 2929, `Expected 2,929 total questions, found ${preparation.metadata.totals.practiceQuestions}`)
assert(index.documents.length === 93, `Expected 93 topic-content documents, found ${index.documents.length}`)
assert(index.documents.filter((document) => document.contentType === 'quiz').every((document) => document.totalCount === 30), 'Every Topic Quiz must contain 30 questions')
assert(exam.questions.length === 23, `Expected 23 mock tasks, found ${exam.questions.length}`)
assert(exam.questions.every((question) => question.responseType === 'STUDENT_PRODUCED_RESPONSE' && Object.keys(question.options).length === 0), 'Abitur mock tasks must render as written responses')
assert(exam.questions.reduce((sum, question) => sum + question.maximumRawPoints, 0) === 120, 'Abitur mock exam must total 120 BE')
assert(new Set(exam.questions.map((question) => question.module)).size === 2, 'Abitur mock exam must retain Prüfungsteil A and B')

console.log('Abitur Mathematik data verified: 31 topics, 620 flashcards, 930 topic-quiz questions, 2,929-question catalog total, 23 mock tasks, 120 BE.')
