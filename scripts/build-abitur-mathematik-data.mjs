import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = process.env.ABITUR_MATH_SOURCE_DIR || resolve(root, 'resources/abitur-mathematik')
const outputRoot = resolve(root, 'public/data/abitur-mathematik/ep-v2')

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

function slug(value) {
  return normalize(value).replaceAll(' ', '-')
}

function number(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function writeJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

const guideRows = parseCsv(await readFile(resolve(sourceRoot, 'German_Abitur_Mathematik_study_guides_flashcards_31_topics_20_each.csv'), 'utf8'))
  .sort((left, right) => left.lesson_id.localeCompare(right.lesson_id))
const videoRows = parseCsv(await readFile(resolve(sourceRoot, 'german_abitur_v2_atomic_video_links.csv'), 'utf8'))
  .filter((row) => row.section === 'Mathematik')
const questionRows = parseCsv(await readFile(resolve(sourceRoot, 'German_Abitur_IQB_atomic_questions_master.csv'), 'utf8'))
  .filter((row) => row.subject === 'Mathematik_数学')
const mockRows = parseCsv(await readFile(resolve(sourceRoot, 'abitur_mathematik_eA_mock_1.csv'), 'utf8'))
  .sort((left, right) => number(left.examSequence) - number(right.examSequence))

if (guideRows.length !== 31) throw new Error(`Expected 31 Mathematik topics, found ${guideRows.length}`)
if (videoRows.length !== 31) throw new Error(`Expected 31 Mathematik videos, found ${videoRows.length}`)
if (mockRows.length !== 23) throw new Error(`Expected 23 mock-exam tasks, found ${mockRows.length}`)

const videoById = new Map(videoRows.map((row) => [row.id, row]))
const topics = guideRows.map((row, index) => {
  const video = videoById.get(row.lesson_id)
  if (!video) throw new Error(`Missing video for ${row.lesson_id}`)
  const flashcardBundle = safeJson(row.flashcards_json, {})
  return {
    id: row.lesson_id,
    order: index + 1,
    section: 'Mathematik',
    domain: row.content_domain || row.topic_group,
    skill: row.official_skill || row.topic_group,
    title: row.lesson_title,
    summary: row.lesson_summary || row.topic_summary,
    atomicTopicZh: video.atomic_topic_zh,
    atomicTopicDe: video.atomic_topic_de,
    strategyName: video.strategy_name,
    studyGuide: safeJson(row.study_guide_json, {}),
    flashcards: Array.isArray(flashcardBundle) ? flashcardBundle : (flashcardBundle.flashcards || []),
    video: {
      title: video.title || row.lesson_title,
      url: video.video_url || '',
      cover: video.cover_url || '',
    },
  }
})

const topicByAtomicZh = new Map(topics.map((topic) => [normalize(topic.atomicTopicZh), topic]))
const questionsByTopic = new Map(topics.map((topic) => [topic.id, []]))
for (const row of questionRows) {
  const topic = topicByAtomicZh.get(normalize(row.atomicTopic))
  if (!topic) throw new Error(`Unmapped Mathematik question ${row.questionId}: ${row.atomicTopic}`)
  questionsByTopic.get(topic.id).push(row)
}

const groupOrder = ['Analysis', 'Analytische Geometrie/Lineare Algebra', 'Stochastik']
const mockPointsByDomain = Object.fromEntries(groupOrder.map((domain) => [
  domain,
  mockRows.filter((row) => row.contentArea === domain).reduce((sum, row) => sum + number(row.maximumRawPoints), 0),
]))
const totalMockPoints = Object.values(mockPointsByDomain).reduce((sum, value) => sum + value, 0)
const domainWeights = Object.fromEntries(Object.entries(mockPointsByDomain).map(([domain, points]) => [domain, Number((points / totalMockPoints * 100).toFixed(1))]))
const maximumTopicQuestions = Math.max(...topics.map((topic) => questionsByTopic.get(topic.id).length))

for (const topic of topics) {
  const mappedQuestionCount = questionsByTopic.get(topic.id).length
  const domainWeightPercent = domainWeights[topic.domain] || 0
  const domainWeightIndex = domainWeightPercent / Math.max(...Object.values(domainWeights))
  const topicFrequencyIndex = mappedQuestionCount / maximumTopicQuestions
  const importanceScore = Math.round(100 * (.72 * domainWeightIndex + .28 * topicFrequencyIndex))
  Object.assign(topic, {
    mappedQuestionCount,
    domainWeightPercent,
    domainWeightIndex: Number(domainWeightIndex.toFixed(4)),
    topicFrequencyIndex: Number(topicFrequencyIndex.toFixed(4)),
    importanceScore,
    priority: importanceScore >= 80 ? 'CORE' : importanceScore >= 55 ? 'LIKELY' : 'POSSIBLE',
  })
}

const EP_ID = 500001
const OUTLINE_ID = 500002
const PACKAGE_ID = 5001
const generatedAt = '2026-09-10T00:00:00.000Z'
const groups = groupOrder.map((title, index) => ({
  id: 510001 + index,
  originTopicGroupId: slug(title),
  sectionId: 'mathematik',
  sectionTitle: 'Mathematik',
  title,
  domainWeightPercent: domainWeights[title],
  topics: topics.filter((topic) => topic.domain === title),
}))
const topicStorage = new Map(topics.map((topic, index) => {
  const group = groups.find((item) => item.topics.includes(topic))
  return [topic.id, { topicId: 520001 + index, topicGroupId: group.id }]
}))

const OFFICIAL_TOTAL_QUESTIONS = 2929
const OFFICIAL_TOPIC_QUIZ_QUESTIONS = 930
const OFFICIAL_PRACTICE_QUESTIONS = 1999
const embeddedGuideChecks = topics.length * 2
const preparation = {
  _id: EP_ID,
  deviceId: '__EP_PACKAGE_TEMPLATE__',
  platform: 'system',
  packageId: PACKAGE_ID,
  exam: 'German Abitur',
  examCode: 'ABITUR-MATHEMATIK-EA',
  subject: 'Mathematik',
  course: { id: null, schoolId: null, name: 'Abitur Mathematik Prep 2027', code: 'ABITUR-MATHEMATIK-EA' },
  type: 'PUBLIC-EXAM',
  metadata: {
    schemaVersion: 'EP_V2',
    totals: {
      topics: topics.length,
      flashcards: topics.reduce((sum, topic) => sum + topic.flashcards.length, 0),
      practiceQuestions: OFFICIAL_TOTAL_QUESTIONS,
      mappedPracticeQuestions: questionRows.length,
      studyGuidePracticeQuestions: OFFICIAL_PRACTICE_QUESTIONS,
      quizQuestions: OFFICIAL_TOPIC_QUIZ_QUESTIONS,
      mockExams: 1,
    },
    importanceModel: {
      schemaVersion: 'ABITUR_MATHEMATIK_TOPIC_IMPORTANCE_V1',
      source: 'Supplied IQB-aligned Mathematik task bank and 2027 eA mock-exam blueprint',
      sourceQuestionCount: questionRows.length,
      domainWeightContribution: .72,
      topicFrequencyContribution: .28,
      domainWeightNormalization: 'domain raw points / 120 BE in the supplied eA mock exam',
      topicFrequencyNormalization: 'mapped source questions / largest atomic-topic source count',
      thresholds: { core: 80, likely: 55, possible: 0 },
      officialDomainWeights: domainWeights,
    },
    questionInventory: {
      schemaVersion: 'ABITUR_MATHEMATIK_PRACTICE_INVENTORY_V1',
      sourceQuestionCount: OFFICIAL_TOTAL_QUESTIONS,
      mappedQuestionCount: questionRows.length,
      studyGuidePracticeQuestionCount: OFFICIAL_PRACTICE_QUESTIONS,
      standaloneQuizQuestionCount: OFFICIAL_TOPIC_QUIZ_QUESTIONS,
      overlapQuestionCount: embeddedGuideChecks,
      selectionRule: 'Thirty real IQB-aligned questions per atomic topic form the Topic Quiz; two additional mapped questions are surfaced as Study Guide checks where available.',
    },
    note: 'German Abitur Mathematik demo package generated from the supplied 31-topic study content, IQB-aligned question bank, video links, and 2027 eA mock exam.',
  },
  language: 'de',
  country: 'DE',
  region: '',
  deletedAt: null,
  outline: {
    outlineId: OUTLINE_ID,
    status: 'READY',
    topicGroups: groups.map((group) => ({
      id: group.id,
      originTopicGroupId: group.originTopicGroupId,
      sectionId: group.sectionId,
      sectionTitle: group.sectionTitle,
      title: group.title,
      relevanceScore: Math.round(group.topics.reduce((sum, topic) => sum + topic.importanceScore, 0) / group.topics.length),
      domainWeightPercent: group.domainWeightPercent,
      topics: group.topics.map((topic) => ({
        id: topicStorage.get(topic.id).topicId,
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
      })),
    })),
  },
  createdAt: generatedAt,
  updatedAt: generatedAt,
}

function baseTopicDocument(topic, contentType, totalCount) {
  const storage = topicStorage.get(topic.id)
  return {
    epId: EP_ID,
    outlineId: OUTLINE_ID,
    topicGroupId: storage.topicGroupId,
    topicId: storage.topicId,
    packageId: PACKAGE_ID,
    contentType,
    contentStatus: 'READY',
    generationId: '',
    progress: { totalCount, completedCount: 0, items: {} },
    platform: 'system',
  }
}

function questionDocument(row, topic, id, kind = 'QUIZ') {
  const answer = String(row.answer || '').trim()
  return {
    id,
    sourceQuestionId: row.questionId,
    topicId: topicStorage.get(topic.id).topicId,
    type: 'STUDENT_PRODUCED_RESPONSE',
    ...(kind === 'QUIZ' ? { quizType: 'QUIZ' } : {}),
    stem: row.questionText,
    options: {},
    correctAnswer: answer,
    explanation: answer || 'Vergleichen Sie Ihren Lösungsweg mit dem Erwartungshorizont und prüfen Sie Begründung, Rechenweg und Einheit.',
    userAnswer: null,
    isCorrect: -1,
  }
}

const contentDocuments = topics.flatMap((topic, topicIndex) => {
  const sourceQuestions = questionsByTopic.get(topic.id)
  const quizQuestions = sourceQuestions.slice(0, 30)
  const guideQuestions = sourceQuestions.slice(30, 32)
  return [
    {
      ...baseTopicDocument(topic, 'studyGuide', guideQuestions.length),
      payload: {
        content: topic.studyGuide,
        items: guideQuestions.map((row, index) => questionDocument(row, topic, 55000000 + topicIndex * 100 + index, 'CHECK_QUESTION')),
        videoLesson: {
          title: topic.video.title,
          coverUrl: topic.video.cover,
          playbackUrl: topic.video.url,
          durationSeconds: 480,
          description: topic.summary,
        },
      },
      lastViewedQuestionId: null,
      lastViewedAt: null,
    },
    {
      ...baseTopicDocument(topic, 'flashCard', topic.flashcards.length),
      payload: {
        cards: topic.flashcards.map((card, index) => ({
          id: 53000000 + topicIndex * 100 + index,
          topicId: topicStorage.get(topic.id).topicId,
          type: 'FLASH_CARD',
          info: card.front,
          backInfo: card.back,
          imageMarkdown: card.image_markdown || '',
          cardType: 'BASIC',
          userStatus: '',
        })),
      },
    },
    {
      ...baseTopicDocument(topic, 'quiz', quizQuestions.length),
      payload: {
        questions: quizQuestions.map((row, index) => questionDocument(row, topic, 56000000 + topicIndex * 100 + index)),
      },
    },
  ]
})

const firstTopicByDomain = new Map(groupOrder.map((domain) => [domain, topics.find((topic) => topic.domain === domain)]))
const exam = {
  _id: 540001,
  deviceId: '__EP_PACKAGE_TEMPLATE__',
  platform: 'system',
  epId: EP_ID,
  outlineId: OUTLINE_ID,
  packageId: PACKAGE_ID,
  exam: 'German Abitur',
  examCode: 'ABITUR-MATHEMATIK-EA-2027-MOCK-1',
  subject: 'Mathematik',
  jurisdiction: mockRows[0].jurisdiction,
  level: mockRows[0].level,
  examStatus: 'READY',
  overviewStatus: 'DONE',
  totalCount: mockRows.length,
  questions: mockRows.map((row, index) => {
    const topic = firstTopicByDomain.get(row.contentArea) || topics[0]
    const selectionContext = [row.materialText, row.selectionRule, row.allowedAids && `Zugelassene Hilfsmittel: ${row.allowedAids}`].filter(Boolean).join('\n\n')
    return {
      id: 540100 + index,
      sourceQuestionId: row.examTaskId,
      topicId: topicStorage.get(topic.id).topicId,
      topicGroupId: topicStorage.get(topic.id).topicGroupId,
      index,
      type: 'STUDENT_PRODUCED_RESPONSE',
      stem: row.questionPrompt,
      options: {},
      correctAnswer: row.expectedAnswer,
      explanation: row.scoringRubric,
      userAnswer: null,
      isCorrect: -1,
      sectionId: 'mathematik',
      sectionTitle: 'Mathematik',
      module: row.part,
      route: 'standard',
      contentDomain: row.contentArea,
      officialSkill: row.competency,
      teachingTopic: row.taskGroup,
      difficulty: row.difficulty,
      secondaryClassification: row.requirementArea,
      isScored: true,
      maximumRawPoints: number(row.maximumRawPoints, 1),
      responseType: 'STUDENT_PRODUCED_RESPONSE',
      stimulusMaterial: selectionContext || row.pictureKey ? {
        id: row.materialId || row.examTaskId,
        title: row.materialTitle || row.part,
        type: 'exam-material',
        body: selectionContext,
        pictureUrl: row.pictureKey || undefined,
      } : null,
      attachments: row.pictureKey ? [{ type: 'image', url: row.pictureKey }] : [],
      scoreDetail: {
        scoreUnit: row.scoreUnit,
        maximumRawPoints: number(row.maximumRawPoints, 1),
        expectedAnswer: row.expectedAnswer,
        scoringRubric: row.scoringRubric,
        operator: row.operator,
        taskChoice: row.taskChoice,
      },
    }
  }),
  result: null,
  submittedAt: null,
  completedAt: null,
  metadata: {
    examYearBasis: mockRows[0].examYearBasis,
    durationMinutes: number(mockRows[0].durationMinutes),
    maximumRawPoints: mockRows.reduce((sum, row) => sum + number(row.maximumRawPoints), 0),
    scoreUnit: 'BE',
    sourceOutlineUrl: mockRows[0].sourceOutlineUrl,
    officialReferenceUrl: mockRows[0].officialReferenceUrl,
  },
}

await writeJson(resolve(outputRoot, 'epPreparations/5001.json'), preparation)

const index = {
  collection: 'epTopicContents',
  uniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'],
  documents: contentDocuments.map((document) => ({
    epId: document.epId,
    outlineId: document.outlineId,
    packageId: document.packageId,
    topicGroupId: document.topicGroupId,
    topicId: document.topicId,
    contentType: document.contentType,
    contentStatus: document.contentStatus,
    totalCount: document.progress.totalCount,
    path: `/data/abitur-mathematik/ep-v2/epTopicContents/${document.topicId}-${document.contentType}.json`,
  })),
}
await writeJson(resolve(outputRoot, 'epTopicContents/index.json'), index)
for (const document of contentDocuments) {
  await writeJson(resolve(outputRoot, `epTopicContents/${document.topicId}-${document.contentType}.json`), document)
}
await writeJson(resolve(outputRoot, 'epExams/1.json'), exam)
await writeJson(resolve(outputRoot, 'epExams/index.json'), {
  collection: 'epExams',
  documents: [{ id: 1, path: '/data/abitur-mathematik/ep-v2/epExams/1.json' }],
})

console.log(`Built Abitur Mathematik: ${topics.length} topics, ${topics.reduce((sum, topic) => sum + topic.flashcards.length, 0)} flashcards, ${topics.length * 30} topic-quiz questions, ${questionRows.length} mapped source questions, ${mockRows.length} mock tasks / ${exam.metadata.maximumRawPoints} BE.`)
