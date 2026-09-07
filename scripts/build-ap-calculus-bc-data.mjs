import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = process.env.AP_CALCULUS_BC_SOURCE_DIR || resolve(root, 'resources/ap-calculus-bc')

function parseCsv(source) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '' }
    else if (char !== '\r') field += char
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ''))
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[’'“”"–—‑-]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function sectionId(section) {
  return normalize(section).replaceAll(' ', '-')
}

function choices(row) {
  return [row.choice1, row.choice2, row.choice3, row.choice4]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function optionRecord(row) {
  return Object.fromEntries(choices(row).map((value, index) => [String.fromCharCode(65 + index), value]))
}

function parseWeight(value) {
  const values = String(value || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || []
  if (!values.length) return 10
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

const guides = parseCsv(await readFile(resolve(sourceRoot, 'study-guides-flashcards.csv'), 'utf8'))
const videos = parseCsv(await readFile(resolve(sourceRoot, 'video-links.csv'), 'utf8'))
  .filter((row) => row.section === 'AP Calculus BC')
const practiceRows = parseCsv(await readFile(resolve(sourceRoot, 'atomic-practice.csv'), 'utf8'))
const mockRows = parseCsv(await readFile(resolve(sourceRoot, 'mock-exam-1.csv'), 'utf8'))

const videoByTopic = new Map(videos.map((video) => [normalize(video.atomic_topic_en), video]))
const topics = guides.map((row, index) => {
  const video = videoByTopic.get(normalize(row.lesson_title)) || videos[index] || {}
  const flashcardBundle = safeJson(row.flashcards_json, {})
  return {
    id: row.lesson_id,
    order: index + 1,
    section: 'AP Calculus BC',
    domain: row.topic_group,
    skill: row.official_skill,
    title: row.lesson_title,
    summary: row.lesson_summary,
    atomicTopic: video.atomic_topic_en || row.lesson_title,
    atomicTopicZh: video.atomic_topic_zh || '',
    strategyName: video.strategy_name || '',
    studyGuide: safeJson(row.study_guide_json, {}),
    flashcards: Array.isArray(flashcardBundle) ? flashcardBundle : (flashcardBundle.flashcards || []),
    video: { title: video.title || row.lesson_title, url: video.video_url || '', cover: video.cover_url || '' },
  }
})

const topicAliases = new Map()
for (const topic of topics) {
  for (const alias of [topic.id, topic.title, topic.atomicTopic, topic.atomicTopicZh]) {
    if (normalize(alias)) topicAliases.set(normalize(alias), topic)
  }
}

const questionsByTopic = new Map(topics.map((topic) => [topic.id, []]))
for (const row of practiceRows) {
  const topic = topicAliases.get(normalize(row.atomicTopic))
  if (!topic) throw new Error(`Unmapped AP Calculus BC practice question ${row.questionId}: ${row.atomicTopic}`)
  questionsByTopic.get(topic.id).push(row)
}

const unitWeights = Object.fromEntries([...new Set(topics.map((topic) => topic.domain))].map((domain) => {
  const source = practiceRows.find((row) => row.topicGroup === domain)
  return [domain, parseWeight(source?.topicWeight)]
}))
const maximumWeight = Math.max(...Object.values(unitWeights))

function priorityFor(score) {
  if (score >= 80) return 'CORE'
  if (score >= 55) return 'LIKELY'
  return 'POSSIBLE'
}

for (const topic of topics) {
  const domainWeightPercent = unitWeights[topic.domain]
  const domainWeightIndex = domainWeightPercent / maximumWeight
  const mappedQuestionCount = questionsByTopic.get(topic.id).length
  const topicFrequencyIndex = mappedQuestionCount / 30
  const importanceScore = Math.round(100 * (.7 * domainWeightIndex + .3 * topicFrequencyIndex))
  Object.assign(topic, {
    domainWeightPercent,
    domainWeightIndex: Number(domainWeightIndex.toFixed(4)),
    mappedQuestionCount,
    topicFrequencyIndex: Number(topicFrequencyIndex.toFixed(4)),
    importanceScore,
    priority: priorityFor(importanceScore),
  })
}

const groupMap = new Map()
for (const topic of topics) {
  if (!groupMap.has(topic.domain)) groupMap.set(topic.domain, { id: sectionId(topic.domain), title: topic.domain, examSection: topic.section, topicIds: [] })
  groupMap.get(topic.domain).topicIds.push(topic.id)
}

const EP_ID = 400001
const OUTLINE_ID = 400002
const PACKAGE_ID = 4001
const generatedAt = '2026-09-07T00:00:00.000Z'
const storageGroups = [...groupMap.values()].map((group, index) => ({ ...group, storageId: 410001 + index }))
const topicStorage = new Map(topics.map((topic, index) => {
  const group = storageGroups.find((item) => item.topicIds.includes(topic.id))
  return [topic.id, { topicId: 420001 + index, topicGroupId: group.storageId }]
}))

const IMPORTANCE_MODEL = {
  schemaVersion: 'AP_CALCULUS_BC_TOPIC_IMPORTANCE_V1',
  source: 'AP Calculus BC unit ranges in the supplied 2026–27 course-aligned bank + mapped topic frequency',
  sourceQuestionCount: practiceRows.length,
  domainWeightContribution: .7,
  topicFrequencyContribution: .3,
  domainWeightNormalization: 'unit range midpoint / highest AP Calculus BC unit midpoint',
  topicFrequencyNormalization: 'mapped topic question count / 30 questions per atomic topic',
  thresholds: { core: 80, likely: 55, possible: 0 },
  officialDomainWeights: unitWeights,
}
const studyGuidePracticeCount = topics.length * 2
const QUESTION_INVENTORY = {
  schemaVersion: 'AP_CALCULUS_BC_PRACTICE_INVENTORY_V1',
  sourceQuestionCount: practiceRows.length,
  mappedQuestionCount: practiceRows.length,
  studyGuidePracticeQuestionCount: studyGuidePracticeCount,
  standaloneQuizQuestionCount: practiceRows.length - studyGuidePracticeCount,
  overlapQuestionCount: 0,
  selectionRule: 'Two multiple-choice questions per lesson are Study Guide exit-ticket checks and are removed from the standalone Topic Quiz.',
}
const totals = {
  topics: topics.length,
  flashcards: topics.reduce((sum, topic) => sum + topic.flashcards.length, 0),
  practiceQuestions: practiceRows.length,
  mappedPracticeQuestions: practiceRows.length,
  studyGuidePracticeQuestions: studyGuidePracticeCount,
  quizQuestions: practiceRows.length - studyGuidePracticeCount,
  mockExams: 1,
}

const preparation = {
  _id: EP_ID,
  deviceId: '__EP_PACKAGE_TEMPLATE__', platform: 'system', packageId: PACKAGE_ID,
  exam: 'AP', examCode: 'AP-CALCULUS-BC', subject: 'AP Calculus BC',
  course: { id: null, schoolId: null, name: 'AP Calculus BC Prep 2027', code: 'AP-CALCULUS-BC' },
  type: 'PUBLIC-EXAM',
  metadata: { schemaVersion: 'EP_V2', totals, importanceModel: IMPORTANCE_MODEL, questionInventory: QUESTION_INVENTORY, note: 'AP Calculus BC demo package generated from the supplied course-aligned resources.' },
  language: 'en', country: 'US', region: '', deletedAt: null,
  outline: { outlineId: OUTLINE_ID, status: 'READY', topicGroups: storageGroups.map((group) => ({
    id: group.storageId,
    originTopicGroupId: group.id,
    sectionId: sectionId(group.examSection),
    sectionTitle: group.examSection,
    title: group.title,
    relevanceScore: Math.round(group.topicIds.reduce((sum, id) => sum + topics.find((topic) => topic.id === id).importanceScore, 0) / group.topicIds.length),
    domainWeightPercent: unitWeights[group.title],
    topics: group.topicIds.map((id) => {
      const topic = topics.find((item) => item.id === id)
      return {
        id: topicStorage.get(id).topicId,
        originTopicId: id,
        title: topic.title,
        description: topic.summary,
        relevanceScore: topic.importanceScore,
        importanceScore: topic.importanceScore,
        domainWeightPercent: topic.domainWeightPercent,
        mappedQuestionCount: topic.mappedQuestionCount,
        domainWeightIndex: topic.domainWeightIndex,
        topicFrequencyIndex: topic.topicFrequencyIndex,
        priority: topic.priority,
      }
    }),
  })) },
  createdAt: generatedAt, updatedAt: generatedAt,
}

function baseTopicDocument(topic, contentType, totalCount) {
  const storage = topicStorage.get(topic.id)
  return { epId: EP_ID, outlineId: OUTLINE_ID, topicGroupId: storage.topicGroupId, topicId: storage.topicId, packageId: PACKAGE_ID, contentType, contentStatus: 'READY', generationId: '', progress: { totalCount, completedCount: 0, items: {} }, platform: 'system' }
}

function epQuestion(row, topic, id, kind = 'QUIZ') {
  const options = optionRecord(row)
  const correctAnswer = String(row.answer || '').trim()
  if (Object.keys(options).length && !(correctAnswer in options)) {
    throw new Error(`AP Calculus BC question ${row.questionId} has answer ${correctAnswer} outside its options`)
  }
  return {
    id,
    sourceQuestionId: row.questionId,
    topicId: topicStorage.get(topic.id).topicId,
    type: Object.keys(options).length ? (kind === 'CHECK_QUESTION' ? 'CHECK_QUESTION' : 'MULTIPLE_CHOICE') : 'STUDENT_PRODUCED_RESPONSE',
    ...(kind === 'QUIZ' ? { quizType: 'QUIZ' } : {}),
    stem: row.questionText,
    options,
    correctAnswer,
    explanation: row.answerExplanation || row.scoringRubric || '',
    userAnswer: null,
    isCorrect: -1,
  }
}

const contentDocuments = topics.flatMap((topic, topicIndex) => {
  const questions = questionsByTopic.get(topic.id)
  const studyQuestions = questions.filter((row) => choices(row).length).slice(0, 2)
  const studyIds = new Set(studyQuestions.map((row) => row.questionId))
  const quizQuestions = questions.filter((row) => !studyIds.has(row.questionId))
  return [
    { ...baseTopicDocument(topic, 'studyGuide', studyQuestions.length), payload: { content: topic.studyGuide, items: studyQuestions.map((row, index) => epQuestion(row, topic, 45000000 + topicIndex * 100 + index, 'CHECK_QUESTION')), videoLesson: { title: topic.video.title, coverUrl: topic.video.cover, playbackUrl: topic.video.url, durationSeconds: 480, description: topic.summary } }, lastViewedQuestionId: null, lastViewedAt: null },
    { ...baseTopicDocument(topic, 'flashCard', topic.flashcards.length), payload: { cards: topic.flashcards.map((card, index) => ({ id: 43000000 + topicIndex * 100 + index, topicId: topicStorage.get(topic.id).topicId, type: 'FLASH_CARD', info: card.front, backInfo: card.back, imageMarkdown: card.image_markdown || '', cardType: 'BASIC', userStatus: '' })) } },
    { ...baseTopicDocument(topic, 'quiz', quizQuestions.length), payload: { questions: quizQuestions.map((row, index) => epQuestion(row, topic, 46000000 + topicIndex * 100 + index)) } },
  ]
})

function mockTopic(row) {
  const normalizedTarget = normalize(row.teachingTopic || row.contentDomain)
  return topicAliases.get(normalizedTarget)
    || topics.find((topic) => normalize(topic.domain).includes(normalizedTarget))
    || topics[0]
}

function epExam(rows) {
  return {
    _id: 440001,
    deviceId: '__EP_PACKAGE_TEMPLATE__', platform: 'system', epId: EP_ID, outlineId: OUTLINE_ID, packageId: PACKAGE_ID,
    exam: 'AP', examCode: 'AP-CALCULUS-BC', subject: 'AP Calculus BC', jurisdiction: 'US', level: 'High School', examStatus: 'READY', overviewStatus: 'DONE', totalCount: rows.length,
    questions: rows.map((row, rowIndex) => {
      const topic = mockTopic(row)
      const options = optionRecord(row)
      const isMultipleChoice = options && Object.keys(options).length > 0
      return {
        id: 47000000 + rowIndex,
        index: rowIndex,
        topicGroupId: topicStorage.get(topic.id).topicGroupId,
        topicId: topicStorage.get(topic.id).topicId,
        sectionId: sectionId(row.section),
        sectionTitle: row.section,
        module: 'Section', route: 'standard',
        contentDomain: row.contentDomain,
        officialSkill: row.officialSkill,
        teachingTopic: row.teachingTopic,
        difficulty: String(row.difficulty || '').toUpperCase(),
        secondaryClassification: row.secondaryClassification || '',
        isScored: String(row.isScored).toLowerCase() !== 'false',
        maximumRawPoints: Number(row.maximumRawPoints || 1),
        responseType: isMultipleChoice ? 'MULTIPLE_CHOICE' : 'STUDENT_PRODUCED_RESPONSE',
        type: isMultipleChoice ? 'MULTIPLE_CHOICE' : 'STUDENT_PRODUCED_RESPONSE',
        stem: row.questionText,
        options,
        correctAnswer: String(row.answer || '').trim(),
        explanation: row.answerExplanation || row.scoringRubric || '',
        stimulusMaterial: null,
        attachments: row.pictureKey ? [{ type: 'image', url: row.pictureKey }] : [],
        scoreDetail: null, userAnswer: null, isCorrect: -1,
      }
    }),
    result: null, submittedAt: null, completedAt: null, createdAt: generatedAt, updatedAt: generatedAt,
  }
}

const exam = epExam(mockRows)
const outputRoot = resolve(root, 'public/data/ap-calculus-bc/ep-v2')
await mkdir(resolve(outputRoot, 'epPreparations'), { recursive: true })
await mkdir(resolve(outputRoot, 'epTopicContents'), { recursive: true })
await mkdir(resolve(outputRoot, 'epExams'), { recursive: true })
await writeFile(resolve(outputRoot, 'epPreparations/4001.json'), JSON.stringify(preparation))
await writeFile(resolve(outputRoot, 'epTopicContents/index.json'), JSON.stringify({ collection: 'epTopicContents', uniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'], documents: contentDocuments.map((document) => ({ epId: document.epId, outlineId: document.outlineId, packageId: document.packageId, topicGroupId: document.topicGroupId, topicId: document.topicId, contentType: document.contentType, contentStatus: document.contentStatus, totalCount: document.progress.totalCount, path: `/data/ap-calculus-bc/ep-v2/epTopicContents/${document.topicId}-${document.contentType}.json` })) }))
for (const document of contentDocuments) await writeFile(resolve(outputRoot, `epTopicContents/${document.topicId}-${document.contentType}.json`), JSON.stringify(document))
await writeFile(resolve(outputRoot, 'epExams/1.json'), JSON.stringify(exam))
await writeFile(resolve(outputRoot, 'epExams/index.json'), JSON.stringify({ collection: 'epExams', documents: [{ _id: exam._id, epId: exam.epId, outlineId: exam.outlineId, packageId: exam.packageId, totalCount: exam.totalCount, path: '/data/ap-calculus-bc/ep-v2/epExams/1.json' }] }))
await writeFile(resolve(outputRoot, 'storage-contract.json'), JSON.stringify({ schemaVersion: 'EP_V2', collections: ['epPreparations', 'epTopicContents', 'epExams'], packageTemplateKey: 'packageId', preparationToContent: ['epId', 'outlineId', 'packageId'], topicLocator: ['topicGroupId', 'topicId'], preparationToMockExam: ['epId', 'outlineId', 'packageId'], topicContentUniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'], contentTypes: ['studyGuide', 'flashCard', 'quiz'], questionPlacement: { studyGuidePractice: { contentType: 'studyGuide', path: 'payload.items', type: 'CHECK_QUESTION' }, standaloneQuiz: { contentType: 'quiz', path: 'payload.questions', quizType: 'QUIZ' } }, questionIdentityField: 'sourceQuestionId', questionInventory: QUESTION_INVENTORY, topicImportanceFields: ['importanceScore', 'priority', 'domainWeightPercent', 'mappedQuestionCount', 'domainWeightIndex', 'topicFrequencyIndex'], importanceModel: IMPORTANCE_MODEL }))

console.log(JSON.stringify({ topics: totals.topics, flashcards: totals.flashcards, practiceQuestions: totals.practiceQuestions, quizQuestions: totals.quizQuestions, mockExamQuestions: exam.totalCount, videos: videos.length, units: storageGroups.length, priorities: Object.fromEntries(['CORE', 'LIKELY', 'POSSIBLE'].map((priority) => [priority, topics.filter((topic) => topic.priority === priority).length])) }, null, 2))
