import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dataRoot = resolve(root, 'public/data/ap-calculus-bc/ep-v2')
const preparation = JSON.parse(await readFile(resolve(dataRoot, 'epPreparations/4001.json'), 'utf8'))
const contentIndex = JSON.parse(await readFile(resolve(dataRoot, 'epTopicContents/index.json'), 'utf8'))
const exam = JSON.parse(await readFile(resolve(dataRoot, 'epExams/1.json'), 'utf8'))
const diagnosticQuestions = exam.questions
  .filter((question) => question.sectionId === 'multiple-choice')
  .slice(0, 20)
const diagnosticDomains = new Set(diagnosticQuestions.map((question) => question.contentDomain))

const topics = preparation.outline.topicGroups.flatMap((group) => group.topics)
const byType = Object.fromEntries(['studyGuide', 'flashCard', 'quiz'].map((type) => [type, contentIndex.documents.filter((document) => document.contentType === type)]))
const assertions = [
  [topics.length === 49, `expected 49 topics, found ${topics.length}`],
  [preparation.outline.topicGroups.length === 10, `expected 10 units, found ${preparation.outline.topicGroups.length}`],
  [preparation.metadata.totals.flashcards === 980, `expected 980 flashcards, found ${preparation.metadata.totals.flashcards}`],
  [preparation.metadata.totals.practiceQuestions === 1470, `expected 1470 practice questions, found ${preparation.metadata.totals.practiceQuestions}`],
  [exam.questions.length === 48, `expected 48 mock questions, found ${exam.questions.length}`],
  [exam.questions.filter((question) => question.sectionId === 'multiple-choice').length === 42, 'expected 42 multiple-choice mock questions'],
  [exam.questions.filter((question) => question.sectionId === 'free-response').length === 6, 'expected 6 free-response mock questions'],
  [diagnosticQuestions.length === 20, `expected 20 AP diagnostic questions, found ${diagnosticQuestions.length}`],
  [diagnosticQuestions.every((question) => question.responseType === 'MULTIPLE_CHOICE'), 'expected every AP diagnostic question to be multiple choice'],
  [diagnosticQuestions.every((question) => Object.keys(question.options).length === 4), 'expected every AP diagnostic question to render four answer options'],
  [diagnosticDomains.size === 10, `expected AP diagnostic coverage across 10 units, found ${diagnosticDomains.size}`],
  [Object.values(byType).every((documents) => documents.length === 49), 'expected one study guide, flashcard deck, and quiz per topic'],
]

const failures = assertions.filter(([valid]) => !valid).map(([, message]) => message)
if (failures.length) throw new Error(`AP Calculus BC verification failed:\n- ${failures.join('\n- ')}`)

console.log(JSON.stringify({ status: 'ok', topics: topics.length, units: preparation.outline.topicGroups.length, flashcards: preparation.metadata.totals.flashcards, practiceQuestions: preparation.metadata.totals.practiceQuestions, mockQuestions: exam.questions.length, diagnosticQuestions: diagnosticQuestions.length, diagnosticUnits: diagnosticDomains.size }, null, 2))
