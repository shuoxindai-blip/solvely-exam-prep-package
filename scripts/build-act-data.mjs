import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = process.env.ACT_SOURCE_DIR || '/Users/mac/Desktop'

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

function choiceValues(row) {
  return [row.choice1, row.choice2, row.choice3, row.choice4]
    .filter((value) => String(value || '').trim())
    .map((value) => String(value).trim())
}

function embeddedChoiceLabels(row) {
  const values = choiceValues(row)
  if (!values.length) return []
  const matches = [...String(row.questionText || '').matchAll(/(?:^|\n)\s*([A-Z])\)\s+/g)]
  const labels = matches.slice(-values.length).map((match) => match[1])
  return labels.length === values.length && new Set(labels).size === labels.length ? labels : []
}

function optionRecord(row, labels = []) {
  const values = choiceValues(row)
  const resolvedLabels = labels.length === values.length
    ? labels
    : values.map((_, index) => String.fromCharCode(65 + index))
  return Object.fromEntries(values.map((value, index) => [resolvedLabels[index], value]))
}

function sectionId(section) {
  return normalize(section).replaceAll(' ', '-')
}

function longestCommonPrefix(values) {
  if (!values.length) return ''
  let prefix = values[0]
  for (const value of values.slice(1)) {
    let index = 0
    const limit = Math.min(prefix.length, value.length)
    while (index < limit && prefix[index] === value[index]) index += 1
    prefix = prefix.slice(0, index)
    if (!prefix) break
  }
  const boundary = prefix.lastIndexOf('\n\n')
  return boundary > 0 ? prefix.slice(0, boundary).trim() : ''
}

function withoutChoices(row) {
  const value = String(row.questionText || '')
  const labels = embeddedChoiceLabels(row)
  if (!labels.length) return value.trim()
  const matches = [...value.matchAll(/(?:^|\n)\s*([A-Z])\)\s+/g)]
  const firstChoice = matches.at(-labels.length)
  return (firstChoice?.index == null ? value : value.slice(0, firstChoice.index)).trim()
}

const MATCH_STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

function phraseTokens(value) {
  return normalize(value).split(' ').filter((token) => token && !MATCH_STOP_WORDS.has(token))
}

function phraseSimilarity(left, right) {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return .92
  const leftTokens = new Set(phraseTokens(left))
  const rightTokens = new Set(phraseTokens(right))
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size))
}

const guides = parseCsv(await readFile(resolve(sourceRoot, 'ACT_study_guides_flashcards_235_topics_20_each.csv'), 'utf8'))
const videos = parseCsv(await readFile(resolve(sourceRoot, 'act_atomic_video_links.csv'), 'utf8'))
const practiceRows = parseCsv(await readFile(resolve(sourceRoot, 'ACT_parallel_practice_master_6600.csv'), 'utf8'))
const mockOneRows = parseCsv(await readFile(resolve(sourceRoot, 'act_mock_exam_1.csv'), 'utf8'))
const mockTwoRows = parseCsv(await readFile(resolve(sourceRoot, 'act_mock_exam_2.csv'), 'utf8'))

const videosById = new Map(videos.map((video) => [video.id, video]))
const topics = guides.sort((a, b) => Number(a.order) - Number(b.order)).map((row, index) => {
  const video = videosById.get(row.lesson_id) || videos[index] || {}
  const flashcardBundle = safeJson(row.flashcards_json, {})
  return {
    id: row.lesson_id,
    order: Number(row.order || index + 1),
    section: video.section || 'English',
    domain: video.reporting_category || row.topic_title,
    skill: String(video.content_domain || row.topic_title).split('｜')[0],
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
  if (!topic) throw new Error(`Unmapped ACT practice question ${row.questionId}: ${row.atomicTopic}`)
  questionsByTopic.get(topic.id).push(row)
}

const OFFICIAL_DOMAIN_WEIGHTS = Object.freeze({
  'Production of Writing': 40.5,
  'Knowledge of Language': 20.5,
  'Conventions of Standard English': 40.5,
  'Preparing for Higher Math': 80,
  'Integrating Essential Skills': 20,
  Modeling: 20,
  'Key Ideas and Details': 48,
  'Craft and Structure': 29.5,
  'Integration of Knowledge and Ideas': 22.5,
  'Interpretation of Data': 44,
  'Scientific Investigation': 25,
  'Evaluation of Models, Inferences, and Experimental Results': 31,
  Writing: 100,
})

const maximumWeightBySection = Object.fromEntries([...new Set(topics.map((topic) => topic.section))].map((section) => {
  const weights = topics.filter((topic) => topic.section === section).map((topic) => OFFICIAL_DOMAIN_WEIGHTS[topic.domain] || (section === 'Writing' ? 100 : 20))
  return [section, Math.max(...weights)]
}))
const maximumFrequencyByDomain = Object.fromEntries([...new Set(topics.map((topic) => topic.domain))].map((domain) => [
  domain,
  Math.max(...topics.filter((topic) => topic.domain === domain).map((topic) => questionsByTopic.get(topic.id).length)),
]))

function priorityFor(score) {
  if (score >= 80) return 'CORE'
  if (score >= 55) return 'LIKELY'
  return 'POSSIBLE'
}

for (const topic of topics) {
  const domainWeightPercent = OFFICIAL_DOMAIN_WEIGHTS[topic.domain] || (topic.section === 'Writing' ? 100 : 20)
  const domainWeightIndex = domainWeightPercent / maximumWeightBySection[topic.section]
  const mappedQuestionCount = questionsByTopic.get(topic.id).length
  const topicFrequencyIndex = mappedQuestionCount / maximumFrequencyByDomain[topic.domain]
  const importanceScore = Math.round(100 * (.65 * domainWeightIndex + .35 * topicFrequencyIndex))
  Object.assign(topic, { domainWeightPercent, domainWeightIndex: Number(domainWeightIndex.toFixed(4)), mappedQuestionCount, topicFrequencyIndex: Number(topicFrequencyIndex.toFixed(4)), importanceScore, priority: priorityFor(importanceScore) })
}

const groupMap = new Map()
for (const topic of topics) {
  const key = `${topic.section}::${topic.domain}`
  if (!groupMap.has(key)) groupMap.set(key, { id: normalize(key).replaceAll(' ', '-'), title: topic.domain, examSection: topic.section, topicIds: [] })
  groupMap.get(key).topicIds.push(topic.id)
}

const EP_ID = 300001
const OUTLINE_ID = 300002
const PACKAGE_ID = 3001
const generatedAt = '2026-09-03T00:00:00.000Z'
const storageGroups = [...groupMap.values()].map((group, index) => ({ ...group, storageId: 310001 + index }))
const topicStorage = new Map(topics.map((topic, index) => {
  const group = storageGroups.find((item) => item.topicIds.includes(topic.id))
  return [topic.id, { topicId: 320001 + index, topicGroupId: group.storageId }]
}))

const IMPORTANCE_MODEL = {
  schemaVersion: 'ACT_TOPIC_IMPORTANCE_V1',
  source: 'Official enhanced ACT reporting-category ranges + mapped ACT practice-bank frequency',
  sourceQuestionCount: practiceRows.length,
  domainWeightContribution: .65,
  topicFrequencyContribution: .35,
  domainWeightNormalization: 'official reporting-category midpoint / highest midpoint in the same ACT section',
  topicFrequencyNormalization: 'mapped topic question count / highest mapped topic question count in the same reporting category',
  thresholds: { core: 80, likely: 55, possible: 0 },
  officialDomainWeights: OFFICIAL_DOMAIN_WEIGHTS,
}
const studyGuidePracticeCount = topics.length * 2
const QUESTION_INVENTORY = {
  schemaVersion: 'ACT_PRACTICE_INVENTORY_V1',
  sourceQuestionCount: practiceRows.length,
  mappedQuestionCount: practiceRows.length,
  studyGuidePracticeQuestionCount: studyGuidePracticeCount,
  standaloneQuizQuestionCount: practiceRows.length - studyGuidePracticeCount,
  overlapQuestionCount: 0,
  selectionRule: 'Two mapped questions per ACT lesson are used as Study Guide exit-ticket checks and removed from the standalone Topic Quiz.',
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
  exam: 'ACT', examCode: 'ACT', subject: 'ACT',
  course: { id: null, schoolId: null, name: 'ACT Prep 2026', code: 'ACT' },
  type: 'PUBLIC-EXAM', metadata: { schemaVersion: 'EP_V2', totals, importanceModel: IMPORTANCE_MODEL, questionInventory: QUESTION_INVENTORY, note: 'ACT package template generated from the complete Web exam-prep materials.' },
  language: 'en', country: 'US', region: '', deletedAt: null,
  outline: { outlineId: OUTLINE_ID, status: 'READY', topicGroups: storageGroups.map((group) => ({
    id: group.storageId, originTopicGroupId: group.id, sectionId: sectionId(group.examSection), sectionTitle: group.examSection, title: group.title,
    relevanceScore: Math.round(group.topicIds.reduce((sum, id) => sum + topics.find((topic) => topic.id === id).importanceScore, 0) / group.topicIds.length),
    domainWeightPercent: OFFICIAL_DOMAIN_WEIGHTS[group.title] || 20,
    topics: group.topicIds.map((id) => {
      const topic = topics.find((item) => item.id === id)
      return { id: topicStorage.get(id).topicId, originTopicId: id, title: topic.title, description: topic.summary, relevanceScore: topic.importanceScore, importanceScore: topic.importanceScore, domainWeightPercent: topic.domainWeightPercent, mappedQuestionCount: topic.mappedQuestionCount, domainWeightIndex: topic.domainWeightIndex, topicFrequencyIndex: topic.topicFrequencyIndex, priority: topic.priority }
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
  return { id, sourceQuestionId: row.questionId, topicId: topicStorage.get(topic.id).topicId, type: Object.keys(options).length ? (kind === 'CHECK_QUESTION' ? 'CHECK_QUESTION' : 'MULTIPLE_CHOICE') : 'STUDENT_PRODUCED_RESPONSE', ...(kind === 'QUIZ' ? { quizType: 'QUIZ' } : {}), stem: row.questionText, options, correctAnswer: String(row.answer || '').trim(), explanation: row.answerExplanation || '', userAnswer: null, isCorrect: -1 }
}

const contentDocuments = topics.flatMap((topic, topicIndex) => {
  const questions = questionsByTopic.get(topic.id)
  const studyQuestions = questions.slice(0, 2)
  const quizQuestions = questions.slice(2)
  return [
    { ...baseTopicDocument(topic, 'studyGuide', studyQuestions.length), payload: { content: topic.studyGuide, items: studyQuestions.map((row, index) => epQuestion(row, topic, 35000000 + topicIndex * 100 + index, 'CHECK_QUESTION')), videoLesson: { title: topic.video.title, coverUrl: topic.video.cover, playbackUrl: topic.video.url, durationSeconds: 480, description: topic.summary } }, lastViewedQuestionId: null, lastViewedAt: null },
    { ...baseTopicDocument(topic, 'flashCard', topic.flashcards.length), payload: { cards: topic.flashcards.map((card, index) => ({ id: 33000000 + topicIndex * 100 + index, topicId: topicStorage.get(topic.id).topicId, type: 'FLASH_CARD', info: card.front, backInfo: card.back, imageMarkdown: card.image_markdown || '', cardType: 'BASIC', userStatus: '' })) } },
    { ...baseTopicDocument(topic, 'quiz', quizQuestions.length), payload: { questions: quizQuestions.map((row, index) => epQuestion(row, topic, 36000000 + topicIndex * 100 + index)) } },
  ]
})

function passageMap(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (!row.passageId) continue
    if (!grouped.has(row.passageId)) grouped.set(row.passageId, [])
    grouped.get(row.passageId).push(withoutChoices(row))
  }
  return new Map([...grouped].map(([id, values]) => [id, longestCommonPrefix(values)]))
}

function epExam(rows, index) {
  const passages = passageMap(rows)
  return {
    _id: 340001 + index, deviceId: '__EP_PACKAGE_TEMPLATE__', platform: 'system', epId: EP_ID, outlineId: OUTLINE_ID, packageId: PACKAGE_ID,
    exam: 'ACT', examCode: 'ACT', subject: 'ACT', jurisdiction: 'US', level: 'High School', examStatus: 'READY', overviewStatus: 'DONE', totalCount: rows.length,
    questions: rows.map((row, rowIndex) => {
      const exactTopic = topicAliases.get(normalize(row.teachingTopic))
      const candidates = topics.filter((item) => item.section === row.section)
      const rankedTopics = candidates.map((item) => {
        const titleScore = Math.max(
          phraseSimilarity(row.teachingTopic, item.title),
          phraseSimilarity(row.teachingTopic, item.atomicTopic),
          phraseSimilarity(row.teachingTopic, item.strategyName),
          phraseSimilarity(row.officialSkill, item.title),
          phraseSimilarity(row.officialSkill, item.atomicTopic),
        )
        const domainBonus = normalize(item.domain) === normalize(row.contentDomain) ? .12 : 0
        return { item, score: titleScore + domainBonus }
      }).sort((left, right) => right.score - left.score || left.item.order - right.item.order)
      const topic = exactTopic || rankedTopics[0]?.item || topics.find((item) => item.section === row.section)
      const full = withoutChoices(row)
      const passage = passages.get(row.passageId) || ''
      const stem = passage && full.startsWith(passage) ? full.slice(passage.length).trim() : full
      const labels = embeddedChoiceLabels(row)
      return {
        id: 37000000 + index * 1000 + rowIndex, index: rowIndex, topicGroupId: topicStorage.get(topic.id).topicGroupId, topicId: topicStorage.get(topic.id).topicId,
        sectionId: sectionId(row.section), sectionTitle: row.section, module: 'Module 1', route: 'standard', contentDomain: row.contentDomain, officialSkill: row.officialSkill, teachingTopic: row.teachingTopic, difficulty: String(row.difficulty || '').toUpperCase(), secondaryClassification: row.secondaryClassification || '',
        isScored: String(row.isScored).toLowerCase() !== 'false', maximumRawPoints: 1, responseType: 'MULTIPLE_CHOICE', type: 'MULTIPLE_CHOICE', stem, options: optionRecord(row, labels), correctAnswer: String(row.answer || '').trim(), explanation: row.answerExplanation || '',
        stimulusMaterial: passage ? { id: row.passageId, title: row.passageTitle, type: row.passageType, body: passage, pictureUrl: row.pictureKey || '' } : null,
        attachments: row.pictureKey ? [{ type: 'image', url: row.pictureKey }] : [], scoreDetail: null, userAnswer: null, isCorrect: -1,
      }
    }),
    result: null, submittedAt: null, completedAt: null, createdAt: generatedAt, updatedAt: generatedAt,
  }
}

const exams = [epExam(mockOneRows, 0), epExam(mockTwoRows, 1)]
const outputRoot = resolve(root, 'public/data/act/ep-v2')
await mkdir(resolve(outputRoot, 'epPreparations'), { recursive: true })
await mkdir(resolve(outputRoot, 'epTopicContents'), { recursive: true })
await mkdir(resolve(outputRoot, 'epExams'), { recursive: true })
await writeFile(resolve(outputRoot, 'epPreparations/3001.json'), JSON.stringify(preparation))
await writeFile(resolve(outputRoot, 'epTopicContents/index.json'), JSON.stringify({ collection: 'epTopicContents', uniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'], documents: contentDocuments.map((document) => ({ epId: document.epId, outlineId: document.outlineId, packageId: document.packageId, topicGroupId: document.topicGroupId, topicId: document.topicId, contentType: document.contentType, contentStatus: document.contentStatus, totalCount: document.progress.totalCount, path: `/data/act/ep-v2/epTopicContents/${document.topicId}-${document.contentType}.json` })) }))
for (const document of contentDocuments) await writeFile(resolve(outputRoot, `epTopicContents/${document.topicId}-${document.contentType}.json`), JSON.stringify(document))
for (const [index, exam] of exams.entries()) await writeFile(resolve(outputRoot, `epExams/${index + 1}.json`), JSON.stringify(exam))
await writeFile(resolve(outputRoot, 'epExams/index.json'), JSON.stringify({ collection: 'epExams', documents: exams.map((exam, index) => ({ _id: exam._id, epId: exam.epId, outlineId: exam.outlineId, packageId: exam.packageId, totalCount: exam.totalCount, path: `/data/act/ep-v2/epExams/${index + 1}.json` })) }))
await writeFile(resolve(outputRoot, 'storage-contract.json'), JSON.stringify({ schemaVersion: 'EP_V2', collections: ['epPreparations', 'epTopicContents', 'epExams'], packageTemplateKey: 'packageId', preparationToContent: ['epId', 'outlineId', 'packageId'], topicLocator: ['topicGroupId', 'topicId'], preparationToMockExam: ['epId', 'outlineId', 'packageId'], topicContentUniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType'], contentTypes: ['studyGuide', 'flashCard', 'quiz'], questionPlacement: { studyGuidePractice: { contentType: 'studyGuide', path: 'payload.items', type: 'CHECK_QUESTION' }, standaloneQuiz: { contentType: 'quiz', path: 'payload.questions', quizType: 'QUIZ' } }, questionIdentityField: 'sourceQuestionId', questionInventory: QUESTION_INVENTORY, topicImportanceFields: ['importanceScore', 'priority', 'domainWeightPercent', 'mappedQuestionCount', 'domainWeightIndex', 'topicFrequencyIndex'], importanceModel: IMPORTANCE_MODEL }))

console.log(JSON.stringify({ topics: topics.length, flashcards: totals.flashcards, practiceQuestions: practiceRows.length, mockExamQuestions: exams[0].totalCount, diagnosticSourceQuestions: exams[1].totalCount, sections: Object.fromEntries(['English', 'Mathematics', 'Reading', 'Science', 'Writing'].map((section) => [section, topics.filter((topic) => topic.section === section).length])), priorities: Object.fromEntries(['CORE', 'LIKELY', 'POSSIBLE'].map((priority) => [priority, topics.filter((topic) => topic.priority === priority).length])) }, null, 2))
