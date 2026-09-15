import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function parseCsv(source) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') quoted = false
      else field += char
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      if (row.some((value) => value.length)) rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''))
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function safeJson(value, fallback) {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’'“”"–—‑-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenScore(left, right) {
  const stop = new Set(['a', 'an', 'and', 'the', 'to', 'of', 'in', 'for', 'with', 'from', 'or', 'by'])
  const a = new Set(normalize(left).split(' ').filter((word) => word.length > 2 && !stop.has(word)))
  const b = new Set(normalize(right).split(' ').filter((word) => word.length > 2 && !stop.has(word)))
  if (!a.size || !b.size) return 0
  const overlap = [...a].filter((word) => b.has(word)).length
  return overlap / Math.max(a.size, b.size)
}

function choiceMarkerRuns(questionText) {
  const markers = [...String(questionText || '').matchAll(/(?:^|\n)\s*([A-Z])[).:]\s+/g)]
  const runs = []
  for (let start = 0; start < markers.length; start += 1) {
    if (markers[start][1] !== 'A') continue
    const run = [markers[start]]
    let expectedCode = 'B'.charCodeAt(0)
    for (const marker of markers.slice(start + 1)) {
      const label = marker[1]
      if (label === String.fromCharCode(expectedCode)) {
        run.push(marker)
        expectedCode += 1
      }
    }
    if (run.length >= 2) runs.push(run)
  }
  return runs
}

function questionParts(questionText, answer) {
  const answerLetter = String(answer || '').trim().match(/^([A-Z])$/i)?.[1]?.toUpperCase()
  const runs = choiceMarkerRuns(questionText)
  const markers = [...runs]
    .reverse()
    .find((run) => !answerLetter || run.some((marker) => marker[1] === answerLetter))
    ?? runs.at(-1)
    ?? []
  if (markers.length < 2) {
    return { stem: questionText.trim(), options: [], correctIndex: -1 }
  }

  const stem = questionText.slice(0, markers[0].index).trim()
  const options = markers.map((marker, index) => {
    const start = marker.index + marker[0].length
    const end = markers[index + 1]?.index ?? questionText.length
    return questionText.slice(start, end).trim()
  })
  return { stem, options, correctIndex: answerLetter ? answerLetter.charCodeAt(0) - 65 : -1 }
}

function compactQuestion(row) {
  const parsed = questionParts(row.questionText, row.answer)
  return {
    id: row.questionId || row.examQuestionId,
    question: parsed.stem,
    options: parsed.options,
    correctIndex: parsed.correctIndex,
    answer: row.answer,
    explanation: row.explanation || row.answerExplanation,
    difficulty: row.difficulty,
    section: row.section,
    domain: row.contentDomain,
    skill: row.officialSkill,
    teachingTopic: row.teachingTopic,
    pictureKey: row.pictureKey || '',
    sourceUrl: row.sourceUrl || '',
  }
}

function isRenderablePracticeQuestion(question) {
  const answerLetter = String(question.answer || '').trim().match(/^([A-Z])$/i)?.[1]
  if (!question.options.length) return !answerLetter
  return question.options.length >= 2
    && question.correctIndex >= 0
    && question.correctIndex < question.options.length
}

function optionRecord(options) {
  return Object.fromEntries(options.map((option, index) => [String.fromCharCode(65 + index), option]))
}

function epResponseType(options) {
  return options.length ? 'MULTIPLE_CHOICE' : 'STUDENT_PRODUCED_RESPONSE'
}

function answerValue(question) {
  if (question.options.length && question.correctIndex >= 0) return String.fromCharCode(65 + question.correctIndex)
  return String(question.answer || '').trim()
}

function quickPracticeExplanation(question) {
  if (String(question.explanation || '').trim()) return question.explanation.trim()
  const answer = answerValue(question)
  const option = question.options[question.correctIndex]
  return `The correct answer is ${answer}${option ? `: ${option}` : ''}. Review the Exam Essentials and worked examples above, then apply the same reasoning to this question.`
}

const STUDY_GUIDE_PRACTICE_PER_TOPIC = 2

function quickPracticeQuestions(questions, topicId) {
  const candidates = questions
    .filter((question) => question.options.length >= 2 && question.correctIndex >= 0 && !question.pictureKey)
    .sort((left, right) => (
      Number(String(right.id).startsWith('SAT-QB-')) - Number(String(left.id).startsWith('SAT-QB-'))
      || Number(right.options.length === 4) - Number(left.options.length === 4)
      || Number(Boolean(String(right.explanation || '').trim())) - Number(Boolean(String(left.explanation || '').trim()))
      || String(left.id).localeCompare(String(right.id))
    ))
  if (candidates.length < STUDY_GUIDE_PRACTICE_PER_TOPIC) throw new Error(`Not enough text-only multiple-choice Quick Practice candidates for ${topicId}`)
  return candidates.slice(0, STUDY_GUIDE_PRACTICE_PER_TOPIC)
}

const OFFICIAL_DOMAIN_WEIGHTS = Object.freeze({
  'Craft and Structure': 28,
  'Information and Ideas': 26,
  'Standard English Conventions': 26,
  'Expression of Ideas': 20,
  Algebra: 35,
  'Advanced Math': 35,
  'Problem-Solving and Data Analysis': 15,
  'Geometry and Trigonometry': 15,
})

const SECTION_MAX_DOMAIN_WEIGHT = Object.freeze({
  'Reading and Writing': 28,
  Math: 35,
})

const IMPORTANCE_MODEL_BASE = Object.freeze({
  schemaVersion: 'SAT_TOPIC_IMPORTANCE_V1',
  source: 'College Board Digital SAT operational question distribution + mapped SAT question bank frequency',
  domainWeightContribution: 0.65,
  topicFrequencyContribution: 0.35,
  domainWeightNormalization: 'official domain weight / highest official domain weight in the same SAT section',
  topicFrequencyNormalization: 'mapped topic question count / highest mapped topic question count in the same content domain',
  thresholds: { core: 80, likely: 55, possible: 0 },
  officialDomainWeights: OFFICIAL_DOMAIN_WEIGHTS,
})

function importancePriority(score) {
  if (score >= IMPORTANCE_MODEL.thresholds.core) return 'CORE'
  if (score >= IMPORTANCE_MODEL.thresholds.likely) return 'LIKELY'
  return 'POSSIBLE'
}

const guideRows = parseCsv(await readFile(resolve(root, 'resources/sat-study-guides-flashcards.csv'), 'utf8'))
const videoRows = parseCsv(await readFile(resolve(root, 'resources/sat-video-links.csv'), 'utf8'))
const quizRows = parseCsv(await readFile(resolve(root, 'resources/sat-master-questions.csv'), 'utf8'))
const mockOneRows = parseCsv(await readFile(resolve(root, 'resources/sat-mock-exam-1.csv'), 'utf8'))
const mockTwoRows = parseCsv(await readFile(resolve(root, 'resources/sat-mock-exam-2.csv'), 'utf8'))
const parsedQuizRows = quizRows.map((row) => ({ row, question: compactQuestion(row) }))
const renderableQuizRows = parsedQuizRows.filter(({ question }) => isRenderablePracticeQuestion(question))
const rejectedQuizQuestions = parsedQuizRows.filter(({ question }) => !isRenderablePracticeQuestion(question)).map(({ question }) => question)
const IMPORTANCE_MODEL = Object.freeze({ ...IMPORTANCE_MODEL_BASE, sourceQuestionCount: renderableQuizRows.length })

const topics = guideRows
  .sort((left, right) => Number(left.order) - Number(right.order))
  .map((row, index) => {
    const video = videoRows[index] ?? {}
    const studyGuide = safeJson(row.study_guide_json, {})
    const flashcardBundle = safeJson(row.flashcards_json, {})
    const flashcards = Array.isArray(flashcardBundle) ? flashcardBundle : (flashcardBundle.flashcards || [])
    return {
      id: row.lesson_id,
      topicId: row.topic_id,
      order: Number(row.order),
      section: video.section || (row.topic_id.includes('_rw_') ? 'Reading and Writing' : 'Math'),
      domain: video.domain || row.topic_group,
      skill: video.skill || row.topic_title,
      title: row.lesson_title,
      summary: row.lesson_summary || row.topic_summary,
      atomicTopic: video.atomic_topic_en || row.topic_summary,
      atomicTopicZh: video.atomic_topic_zh || '',
      strategyName: video.strategy_name || '',
      studyGuide,
      flashcards,
      video: {
        id: video.id || '',
        title: video.title || row.lesson_title,
        url: video.video_url || '',
        cover: video.cover_url || '',
      },
      quizCount: 0,
    }
  })

const aliasMap = new Map()
for (const topic of topics) {
  const aliases = [topic.title, topic.summary, topic.atomicTopic, topic.atomicTopicZh, topic.studyGuide?.title, topic.studyGuide?.overview]
  for (const alias of aliases) {
    const key = normalize(alias)
    if (key && !aliasMap.has(key)) aliasMap.set(key, topic)
  }
}

function topicForQuestion(row) {
  const exact = aliasMap.get(normalize(row.teachingTopic))
  if (exact) return exact
  let bestTopic = null
  let bestScore = 0
  for (const topic of topics) {
    const score = Math.max(
      tokenScore(row.teachingTopic, topic.summary),
      tokenScore(row.teachingTopic, topic.atomicTopic),
      tokenScore(row.teachingTopic, topic.title),
    )
    if (score > bestScore) {
      bestTopic = topic
      bestScore = score
    }
  }
  return bestScore >= .45 ? bestTopic : null
}

function examTopicCandidates(row) {
  const section = normalize(row.section)
  const domain = normalize(row.contentDomain)
  const skill = normalize(row.officialSkill)
  return topics.filter((topic) => (
    normalize(topic.section) === section
    && normalize(topic.domain) === domain
    && normalize(topic.skill) === skill
  ))
}

function topicForExamQuestion(row, usage) {
  const candidates = examTopicCandidates(row)
  if (!candidates.length) return topicForQuestion(row)
  const minimumUse = Math.min(...candidates.map((topic) => usage.get(topic.id) || 0))
  const available = candidates.filter((topic) => (usage.get(topic.id) || 0) === minimumUse)
  const ranked = available.map((topic) => ({
    topic,
    score: Math.max(
      tokenScore(row.questionText, topic.title),
      tokenScore(row.questionText, topic.summary),
      tokenScore(row.questionText, topic.atomicTopic),
      tokenScore(row.teachingTopic, topic.atomicTopicZh),
    ),
  })).sort((left, right) => right.score - left.score || left.topic.order - right.topic.order)
  const selected = ranked[0]?.topic ?? available[0]
  usage.set(selected.id, (usage.get(selected.id) || 0) + 1)
  return selected
}

const questionsByTopic = new Map(topics.map((topic) => [topic.id, []]))
const unmatched = []
for (const { row, question } of renderableQuizRows) {
  const topic = topicForQuestion(row)
  if (topic) questionsByTopic.get(topic.id).push(question)
  else unmatched.push(question)
}

const studyGuidePracticeByTopic = new Map()
const standaloneQuizByTopic = new Map()
for (const topic of topics) {
  const mappedQuestions = questionsByTopic.get(topic.id)
  const studyGuidePractice = quickPracticeQuestions(mappedQuestions, topic.id)
  const studyGuidePracticeSet = new Set(studyGuidePractice)
  studyGuidePracticeByTopic.set(topic.id, studyGuidePractice)
  standaloneQuizByTopic.set(topic.id, mappedQuestions.filter((question) => !studyGuidePracticeSet.has(question)))
  topic.mappedQuestionCount = mappedQuestions.length
  topic.studyGuidePracticeCount = studyGuidePractice.length
  topic.quizCount = mappedQuestions.length - studyGuidePractice.length
}

const QUESTION_INVENTORY = Object.freeze({
  schemaVersion: 'SAT_PRACTICE_INVENTORY_V1',
  sourceQuestionCount: renderableQuizRows.length,
  mappedQuestionCount: renderableQuizRows.length - unmatched.length,
  studyGuidePracticeQuestionCount: [...studyGuidePracticeByTopic.values()].reduce((total, questions) => total + questions.length, 0),
  standaloneQuizQuestionCount: [...standaloneQuizByTopic.values()].reduce((total, questions) => total + questions.length, 0),
  overlapQuestionCount: 0,
  selectionRule: 'Two text-only multiple-choice questions per Topic, preferring SAT question-bank sources, complete four-option sets, supplied explanations, and stable source order; selected questions are removed from standalone Quiz.',
})

const maximumTopicFrequencyByDomain = Object.fromEntries(
  [...new Set(topics.map((topic) => topic.domain))].map((domain) => [domain, Math.max(...topics.filter((topic) => topic.domain === domain).map((topic) => topic.mappedQuestionCount))]),
)

for (const topic of topics) {
  const domainWeightPercent = OFFICIAL_DOMAIN_WEIGHTS[topic.domain]
  const maximumSectionDomainWeight = SECTION_MAX_DOMAIN_WEIGHT[topic.section]
  const maximumDomainTopicFrequency = maximumTopicFrequencyByDomain[topic.domain]
  if (!domainWeightPercent || !maximumSectionDomainWeight || !maximumDomainTopicFrequency) throw new Error(`Missing importance inputs for ${topic.id}`)
  const domainWeightIndex = domainWeightPercent / maximumSectionDomainWeight
  const topicFrequencyIndex = topic.mappedQuestionCount / maximumDomainTopicFrequency
  const importanceScore = Math.round(100 * (
    IMPORTANCE_MODEL.domainWeightContribution * domainWeightIndex
    + IMPORTANCE_MODEL.topicFrequencyContribution * topicFrequencyIndex
  ))
  Object.assign(topic, {
    domainWeightPercent,
    domainWeightIndex: Number(domainWeightIndex.toFixed(4)),
    topicFrequencyIndex: Number(topicFrequencyIndex.toFixed(4)),
    importanceScore,
    priority: importancePriority(importanceScore),
  })
}

const sectionMap = new Map()
for (const topic of topics) {
  const key = `${topic.section}::${topic.domain}`
  if (!sectionMap.has(key)) sectionMap.set(key, { id: normalize(key).replaceAll(' ', '-'), title: topic.domain, examSection: topic.section, topicIds: [] })
  sectionMap.get(key).topicIds.push(topic.id)
}

const manifest = {
  exam: 'Digital SAT',
  generatedFrom: 'SAT complete exam-prep materials',
  importanceModel: IMPORTANCE_MODEL,
  questionInventory: QUESTION_INVENTORY,
  totals: {
    topics: topics.length,
    flashcards: topics.reduce((total, topic) => total + topic.flashcards.length, 0),
    practiceQuestions: renderableQuizRows.length,
    mappedPracticeQuestions: renderableQuizRows.length - unmatched.length,
    studyGuidePracticeQuestions: QUESTION_INVENTORY.studyGuidePracticeQuestionCount,
    quizQuestions: QUESTION_INVENTORY.standaloneQuizQuestionCount,
    mockExams: 1,
  },
  sections: [...sectionMap.values()],
  topics,
}

const EP_ID = 100001
const OUTLINE_ID = 100002
const PACKAGE_ID = 2001
const generatedAt = '2026-08-31T00:00:00.000Z'
const storageGroups = [...sectionMap.values()].map((section, index) => ({
  ...section,
  storageId: 110001 + index,
}))
const topicStorage = new Map()
topics.forEach((topic, index) => {
  const group = storageGroups.find((item) => item.topicIds.includes(topic.id))
  topicStorage.set(topic.id, {
    topicId: 120001 + index,
    topicGroupId: group.storageId,
    group,
  })
})

const epPreparation = {
  _id: EP_ID,
  deviceId: '__EP_PACKAGE_TEMPLATE__',
  platform: 'system',
  packageId: PACKAGE_ID,
  exam: 'SAT',
  examCode: 'SAT',
  subject: 'SAT',
  course: { id: null, schoolId: null, name: 'SAT Prep 2026', code: 'SAT' },
  type: 'PUBLIC-EXAM',
  examDate: '',
  days: null,
  resources: [],
  questionIds: [],
  instructions: '',
  metadata: {
    schemaVersion: 'EP_V2',
    totals: manifest.totals,
    importanceModel: IMPORTANCE_MODEL,
    questionInventory: QUESTION_INVENTORY,
    note: 'SAT package template generated from the complete Web exam-prep materials.',
  },
  language: 'en',
  country: 'US',
  region: '',
  deletedAt: null,
  outline: {
    outlineId: OUTLINE_ID,
    status: 'READY',
    topicGroups: storageGroups.map((group) => ({
      id: group.storageId,
      originTopicGroupId: group.id,
      sectionId: group.examSection === 'Math' ? 'math' : 'reading-writing',
      sectionTitle: group.examSection,
      title: group.title,
      relevanceScore: Math.round(group.topicIds.reduce((sum, topicId) => sum + topics.find((topic) => topic.id === topicId).importanceScore, 0) / group.topicIds.length),
      domainWeightPercent: OFFICIAL_DOMAIN_WEIGHTS[group.title],
      topics: group.topicIds.map((topicOriginId) => {
        const topic = topics.find((item) => item.id === topicOriginId)
        const storage = topicStorage.get(topicOriginId)
        return {
          id: storage.topicId,
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
        }
      }),
    })),
  },
  createdAt: generatedAt,
  updatedAt: generatedAt,
}

function baseTopicContent(topic, contentType, totalCount) {
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

const epTopicContents = topics.flatMap((topic, topicIndex) => {
  const storage = topicStorage.get(topic.id)
  const studyGuidePracticeQuestions = studyGuidePracticeByTopic.get(topic.id)
  const quizQuestions = standaloneQuizByTopic.get(topic.id)
  const studyGuide = {
    ...baseTopicContent(topic, 'studyGuide', studyGuidePracticeQuestions.length),
    payload: {
      content: topic.studyGuide,
      items: studyGuidePracticeQuestions.map((question, questionIndex) => ({
        id: 15000000 + topicIndex * 100 + questionIndex + 1,
        sourceQuestionId: question.id,
        topicId: storage.topicId,
        type: 'CHECK_QUESTION',
        stem: question.question,
        options: optionRecord(question.options),
        correctAnswer: answerValue(question),
        explanation: quickPracticeExplanation(question),
        userAnswer: null,
        isCorrect: -1,
      })),
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
  }
  const flashCard = {
    ...baseTopicContent(topic, 'flashCard', topic.flashcards.length),
    payload: {
      cards: topic.flashcards.map((card, cardIndex) => ({
        id: 13000000 + topicIndex * 100 + cardIndex + 1,
        topicId: storage.topicId,
        type: 'FLASH_CARD',
        info: card.front,
        backInfo: card.back,
        imageMarkdown: card.image_markdown || '',
        cardType: 'BASIC',
        userStatus: '',
      })),
    },
  }
  const quiz = {
    ...baseTopicContent(topic, 'quiz', quizQuestions.length),
    payload: {
      questions: quizQuestions.map((question, questionIndex) => ({
        id: 16000000 + topicIndex * 1000 + questionIndex + 1,
        sourceQuestionId: question.id,
        topicId: storage.topicId,
        type: epResponseType(question.options),
        quizType: 'QUIZ',
        stem: question.question,
        options: optionRecord(question.options),
        correctAnswer: answerValue(question),
        explanation: question.explanation || '',
        userAnswer: null,
        isCorrect: -1,
      })),
    },
  }
  return [studyGuide, flashCard, quiz]
})

function epExam(rows, examIndex) {
  const topicUsage = new Map()
  return {
    _id: 140001 + examIndex,
    deviceId: '__EP_PACKAGE_TEMPLATE__',
    platform: 'system',
    epId: EP_ID,
    outlineId: OUTLINE_ID,
    packageId: PACKAGE_ID,
    exam: 'SAT',
    examCode: 'SAT',
    subject: 'SAT',
    jurisdiction: 'US',
    level: 'High School',
    examStatus: 'READY',
    overviewStatus: 'DONE',
    totalCount: rows.length,
    questions: rows.map((row, index) => {
      const question = compactQuestion(row)
      const topic = topicForExamQuestion(row, topicUsage) || topics.find((item) => item.section === row.section)
      const storage = topicStorage.get(topic.id)
      return {
        id: 15000000 + examIndex * 1000 + index + 1,
        index,
        topicGroupId: storage.topicGroupId,
        topicId: storage.topicId,
        sectionId: row.section === 'Math' ? 'math' : 'reading-writing',
        sectionTitle: row.section,
        module: row.module === 'M2' ? 'Module 2' : 'Module 1',
        route: String(row.route || 'standard').toLowerCase(),
        contentDomain: row.contentDomain,
        officialSkill: row.officialSkill,
        teachingTopic: row.teachingTopic,
        difficulty: String(row.difficulty || '').toUpperCase(),
        secondaryClassification: '',
        isScored: true,
        maximumRawPoints: 1,
        responseType: epResponseType(question.options),
        type: epResponseType(question.options),
        stem: question.question,
        options: optionRecord(question.options),
        correctAnswer: answerValue(question),
        explanation: question.explanation || '',
        stimulusMaterial: null,
        attachments: [],
        scoreDetail: null,
        userAnswer: null,
        isCorrect: -1,
      }
    }),
    result: null,
    submittedAt: null,
    completedAt: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  }
}

const epExams = [epExam(mockOneRows, 0), epExam(mockTwoRows, 1)]

function mockExam(rows, id) {
  return {
    id,
    title: id.endsWith('1') ? 'Digital SAT Full-Length Practice Test 1' : 'Digital SAT Full-Length Practice Test 2',
    questions: rows.map((row) => ({
      ...compactQuestion(row),
      module: row.module,
      route: row.route,
      questionNumber: Number(row.questionNumber),
      sequence: Number(row.examSequence),
      responseType: row.responseType,
      distractorRationale: row.distractorRationale,
      estimatedTimeSeconds: Number(row.estimatedTimeSeconds || 0),
    })),
  }
}

await mkdir(resolve(root, 'public/data/sat/quizzes'), { recursive: true })
await mkdir(resolve(root, 'public/data/ep-v2/epPreparations'), { recursive: true })
await mkdir(resolve(root, 'public/data/ep-v2/epTopicContents'), { recursive: true })
await mkdir(resolve(root, 'public/data/ep-v2/epExams'), { recursive: true })
await mkdir(resolve(root, 'src/data'), { recursive: true })
await writeFile(resolve(root, 'public/data/sat/topics.json'), JSON.stringify(manifest))
for (const topic of topics) {
  await writeFile(resolve(root, `public/data/sat/quizzes/${topic.id}.json`), JSON.stringify({ topicId: topic.id, questions: standaloneQuizByTopic.get(topic.id) }))
}
await writeFile(resolve(root, 'public/data/sat/quizzes/unmatched.json'), JSON.stringify({ questions: unmatched, rejectedQuestions: rejectedQuizQuestions }))
await writeFile(resolve(root, 'src/data/satMockExam1.json'), JSON.stringify(mockExam(mockOneRows, 'sat_mock_exam_1')))
await writeFile(resolve(root, 'src/data/satMockExam2.json'), JSON.stringify(mockExam(mockTwoRows, 'sat_mock_exam_2')))
await writeFile(resolve(root, 'public/data/ep-v2/epPreparations/2001.json'), JSON.stringify(epPreparation))
await writeFile(resolve(root, 'public/data/ep-v2/epTopicContents/index.json'), JSON.stringify({
  collection: 'epTopicContents',
  uniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'],
  documents: epTopicContents.map((document) => ({
    epId: document.epId,
    outlineId: document.outlineId,
    packageId: document.packageId,
    topicGroupId: document.topicGroupId,
    topicId: document.topicId,
    contentType: document.contentType,
    contentStatus: document.contentStatus,
    totalCount: document.progress.totalCount,
    path: `/data/ep-v2/epTopicContents/${document.topicId}-${document.contentType}.json`,
  })),
}))
for (const document of epTopicContents) {
  await writeFile(resolve(root, `public/data/ep-v2/epTopicContents/${document.topicId}-${document.contentType}.json`), JSON.stringify(document))
}
await writeFile(resolve(root, 'public/data/ep-v2/epExams/index.json'), JSON.stringify({
  collection: 'epExams',
  joinKeys: ['epId', 'outlineId', 'packageId'],
  documents: epExams.map((exam, index) => ({
    _id: exam._id,
    epId: exam.epId,
    outlineId: exam.outlineId,
    packageId: exam.packageId,
    totalCount: index === 0 ? 120 : exam.totalCount,
    path: `/data/ep-v2/epExams/${index + 1}.json`,
  })),
}))
for (const [index, exam] of epExams.entries()) {
  // Practice Test 10 is imported from the official user-supplied PDFs by
  // scripts/import-sat-practice-test-10.py and must not be overwritten here.
  if (index === 0) continue
  await writeFile(resolve(root, `public/data/ep-v2/epExams/${index + 1}.json`), JSON.stringify(exam))
}
await writeFile(resolve(root, 'public/data/ep-v2/storage-contract.json'), JSON.stringify({
  schemaVersion: 'EP_V2',
  collections: ['epPreparations', 'epTopicContents', 'epExams'],
  packageTemplateKey: 'packageId',
  preparationToContent: ['epId', 'outlineId', 'packageId'],
  topicLocator: ['topicGroupId', 'topicId'],
  preparationToMockExam: ['epId', 'outlineId', 'packageId'],
  topicContentUniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'],
  contentTypes: ['studyGuide', 'flashCard', 'quiz'],
  questionPlacement: {
    studyGuidePractice: { contentType: 'studyGuide', path: 'payload.items', type: 'CHECK_QUESTION' },
    standaloneQuiz: { contentType: 'quiz', path: 'payload.questions', quizType: 'QUIZ' },
  },
  questionIdentityField: 'sourceQuestionId',
  questionInventory: QUESTION_INVENTORY,
  topicImportanceFields: ['importanceScore', 'priority', 'domainWeightPercent', 'mappedQuestionCount', 'domainWeightIndex', 'topicFrequencyIndex'],
  importanceModel: IMPORTANCE_MODEL,
}))
const emptyOptions = renderableQuizRows.filter(({ question }) => question.options.length < 2).length
const report = {
  topics: topics.length,
  flashcards: manifest.totals.flashcards,
  sourcePracticeQuestions: renderableQuizRows.length,
  rejectedPracticeQuestions: rejectedQuizQuestions.length,
  mappedPracticeQuestions: manifest.totals.mappedPracticeQuestions,
  studyGuidePracticeQuestions: QUESTION_INVENTORY.studyGuidePracticeQuestionCount,
  standaloneQuizQuestions: QUESTION_INVENTORY.standaloneQuizQuestionCount,
  unmatchedPracticeQuestions: unmatched.length,
  sourceQuestionsWithoutOptions: emptyOptions,
  mockExamOneQuestions: mockOneRows.length,
  mockExamTwoQuestions: mockTwoRows.length,
  topicsWithoutVideo: topics.filter((topic) => !topic.video.url).length,
  topicsWithoutStudyGuide: topics.filter((topic) => !Object.keys(topic.studyGuide || {}).length).length,
  topicsWithoutFlashcards: topics.filter((topic) => !topic.flashcards.length).length,
  topicImportance: {
    scoreRange: [Math.min(...topics.map((topic) => topic.importanceScore)), Math.max(...topics.map((topic) => topic.importanceScore))],
    priorities: Object.fromEntries(['CORE', 'LIKELY', 'POSSIBLE'].map((priority) => [priority, topics.filter((topic) => topic.priority === priority).length])),
    sourceQuestionCount: renderableQuizRows.length,
    mappedQuestionCount: renderableQuizRows.length - unmatched.length,
  },
  questionInventory: QUESTION_INVENTORY,
}
console.log(JSON.stringify(report, null, 2))
