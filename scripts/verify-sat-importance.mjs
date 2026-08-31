import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(await readFile(resolve(root, 'public/data/sat/topics.json'), 'utf8'))
const preparation = JSON.parse(await readFile(resolve(root, 'public/data/ep-v2/epPreparations/2001.json'), 'utf8'))
const topics = manifest.topics
const model = manifest.importanceModel

assert.equal(topics.length, manifest.totals.topics, 'Topic total must match the manifest')
assert.equal(model.sourceQuestionCount, manifest.totals.practiceQuestions, 'Importance source total must match the complete practice question bank')
assert.equal(topics.reduce((sum, topic) => sum + topic.mappedQuestionCount, 0), manifest.totals.mappedPracticeQuestions, 'Mapped Topic frequencies must reconcile to the mapped practice total')
assert.equal(manifest.totals.mappedPracticeQuestions, manifest.totals.practiceQuestions, 'All SAT practice questions must map to a Topic')

const maximumTopicFrequencyByDomain = Object.fromEntries(
  [...new Set(topics.map((topic) => topic.domain))].map((domain) => [domain, Math.max(...topics.filter((topic) => topic.domain === domain).map((topic) => topic.mappedQuestionCount))]),
)
const maximumDomainWeightBySection = Object.fromEntries(
  [...new Set(topics.map((topic) => topic.section))].map((section) => [section, Math.max(...topics.filter((topic) => topic.section === section).map((topic) => topic.domainWeightPercent))]),
)

const outlineTopics = new Map(preparation.outline.topicGroups.flatMap((group) => group.topics).map((topic) => [topic.originTopicId, topic]))
const priorityCounts = { CORE: 0, LIKELY: 0, POSSIBLE: 0 }

for (const topic of topics) {
  const domainWeightIndex = topic.domainWeightPercent / maximumDomainWeightBySection[topic.section]
  const topicFrequencyIndex = topic.mappedQuestionCount / maximumTopicFrequencyByDomain[topic.domain]
  const expectedScore = Math.round(100 * (model.domainWeightContribution * domainWeightIndex + model.topicFrequencyContribution * topicFrequencyIndex))
  const expectedPriority = expectedScore >= model.thresholds.core ? 'CORE' : expectedScore >= model.thresholds.likely ? 'LIKELY' : 'POSSIBLE'
  assert.equal(topic.importanceScore, expectedScore, `${topic.id} importanceScore must match the model`)
  assert.equal(topic.priority, expectedPriority, `${topic.id} priority must match the score threshold`)
  assert.equal(topic.mappedQuestionCount, topic.studyGuidePracticeCount + topic.quizCount, `${topic.id} mapped count must reconcile across Study Guide practice and standalone Quiz`)
  assert.deepEqual(outlineTopics.get(topic.id), {
    id: outlineTopics.get(topic.id).id,
    originTopicId: topic.id,
    title: topic.title,
    description: topic.summary,
    relevanceScore: topic.importanceScore,
    importanceScore: topic.importanceScore,
    domainWeightPercent: topic.domainWeightPercent,
    mappedQuestionCount: topic.mappedQuestionCount,
    domainWeightIndex: topic.domainWeightIndex,
    topicFrequencyIndex: topic.topicFrequencyIndex,
    priority: topic.priority,
  }, `${topic.id} must be identical in the EP V2 outline`)
  priorityCounts[topic.priority] += 1
}

assert.ok(Object.values(priorityCounts).every((count) => count > 0), 'Core, Likely, and Possible must all have Topics')
assert.deepEqual(preparation.metadata.importanceModel, model, 'The active EP V2 model must match the generated manifest model')

console.log(JSON.stringify({
  topics: topics.length,
  mappedQuestions: manifest.totals.mappedPracticeQuestions,
  mappingCoverage: `${Math.round((manifest.totals.mappedPracticeQuestions / manifest.totals.practiceQuestions) * 100)}%`,
  scoreRange: [Math.min(...topics.map((topic) => topic.importanceScore)), Math.max(...topics.map((topic) => topic.importanceScore))],
  priorityCounts,
}, null, 2))
