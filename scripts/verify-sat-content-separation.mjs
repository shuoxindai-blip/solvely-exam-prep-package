import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'public/data/sat/topics.json'), 'utf8'))
const preparation = JSON.parse(await readFile(resolve(root, 'public/data/ep-v2/epPreparations/2001.json'), 'utf8'))
const contentIndex = JSON.parse(await readFile(resolve(root, 'public/data/ep-v2/epTopicContents/index.json'), 'utf8'))
const storageContract = JSON.parse(await readFile(resolve(root, 'public/data/ep-v2/storage-contract.json'), 'utf8'))

const studyDocuments = contentIndex.documents.filter((document) => document.contentType === 'studyGuide')
const quizDocuments = contentIndex.documents.filter((document) => document.contentType === 'quiz')
const studySourceIds = new Set()
const quizSourceIds = new Set()
const studyCounts = new Map()
const quizCounts = new Map()
const expectedStudyQuestionsPerTopic = manifest.questionInventory.studyGuidePracticeQuestionCount / manifest.totals.topics

assert.equal(studyDocuments.length, manifest.totals.topics, 'Every Topic must have one Study Guide document')
assert.equal(quizDocuments.length, manifest.totals.topics, 'Every Topic must have one standalone Quiz document')

for (const indexDocument of studyDocuments) {
  const document = JSON.parse(await readFile(resolve(root, `public${indexDocument.path}`), 'utf8'))
  assert.equal(document.payload.items.length, expectedStudyQuestionsPerTopic, `${document.topicId} must contain the expected Quick Practice question set`)
  assert.equal(document.progress.totalCount, document.payload.items.length, `${document.topicId} Study Guide progress must count its checks`)
  studyCounts.set(document.topicId, document.payload.items.length)
  for (const question of document.payload.items) {
    assert.equal(question.type, 'CHECK_QUESTION', 'Study Guide items must use CHECK_QUESTION')
    assert.equal(question.quizType, undefined, 'Study Guide checks must not be marked as Quiz questions')
    assert.ok(question.sourceQuestionId, 'Study Guide checks must retain sourceQuestionId')
    assert.ok(!studySourceIds.has(question.sourceQuestionId), `Duplicate Study Guide source question ${question.sourceQuestionId}`)
    studySourceIds.add(question.sourceQuestionId)
  }
}

for (const indexDocument of quizDocuments) {
  const document = JSON.parse(await readFile(resolve(root, `public${indexDocument.path}`), 'utf8'))
  assert.equal(document.progress.totalCount, document.payload.questions.length, `${document.topicId} Quiz progress must count standalone questions`)
  quizCounts.set(document.topicId, document.payload.questions.length)
  for (const question of document.payload.questions) {
    assert.equal(question.quizType, 'QUIZ', 'Standalone Quiz questions must retain quizType QUIZ')
    assert.notEqual(question.type, 'CHECK_QUESTION', 'Standalone Quiz cannot contain CHECK_QUESTION items')
    assert.ok(question.sourceQuestionId, 'Standalone Quiz questions must retain sourceQuestionId')
    assert.ok(!quizSourceIds.has(question.sourceQuestionId), `Duplicate standalone Quiz source question ${question.sourceQuestionId}`)
    quizSourceIds.add(question.sourceQuestionId)
  }
}

const overlap = [...studySourceIds].filter((sourceQuestionId) => quizSourceIds.has(sourceQuestionId))
const inventory = manifest.questionInventory
assert.equal(overlap.length, 0, 'Study Guide checks and standalone Quiz questions must not overlap')
assert.equal(studySourceIds.size, inventory.studyGuidePracticeQuestionCount, 'Study Guide count must match the inventory')
assert.equal(quizSourceIds.size, inventory.standaloneQuizQuestionCount, 'Standalone Quiz count must match the inventory')
assert.equal(studySourceIds.size + quizSourceIds.size, inventory.sourceQuestionCount, 'The separated question sets must reconcile to the source bank')
assert.equal(inventory.overlapQuestionCount, 0, 'The inventory must declare zero overlap')
assert.deepEqual(preparation.metadata.questionInventory, inventory, 'EP V2 metadata must expose the same question inventory')
assert.deepEqual(storageContract.questionInventory, inventory, 'The storage contract must expose the same question inventory')

const outlineTopics = preparation.outline.topicGroups.flatMap((group) => group.topics)
for (const topic of manifest.topics) {
  const outlineTopic = outlineTopics.find((item) => item.originTopicId === topic.id)
  assert.ok(outlineTopic, `Missing EP V2 outline topic ${topic.id}`)
  assert.equal(topic.studyGuidePracticeCount, studyCounts.get(outlineTopic.id), `${topic.id} Study Guide count must match its content document`)
  assert.equal(topic.quizCount, quizCounts.get(outlineTopic.id), `${topic.id} standalone Quiz count must match its content document`)
  assert.equal(topic.mappedQuestionCount, topic.studyGuidePracticeCount + topic.quizCount, `${topic.id} mapped count must reconcile without overlap`)
}

console.log(JSON.stringify({
  sourceQuestions: inventory.sourceQuestionCount,
  studyGuidePracticeQuestions: studySourceIds.size,
  standaloneQuizQuestions: quizSourceIds.size,
  overlapQuestions: overlap.length,
  reconciledQuestions: studySourceIds.size + quizSourceIds.size,
}, null, 2))
