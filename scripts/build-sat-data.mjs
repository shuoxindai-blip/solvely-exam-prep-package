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

function questionParts(questionText, answer) {
  const markers = [...questionText.matchAll(/(?:^|\n)\s*([A-D])\)\s*/g)]
  if (markers.length < 2) {
    return { stem: questionText.trim(), options: [], correctIndex: -1 }
  }

  const stem = questionText.slice(0, markers[0].index).trim()
  const options = markers.map((marker, index) => {
    const start = marker.index + marker[0].length
    const end = markers[index + 1]?.index ?? questionText.length
    return questionText.slice(start, end).trim()
  })
  const answerLetter = String(answer || '').trim().match(/[A-D]/i)?.[0]?.toUpperCase()
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

const guideRows = parseCsv(await readFile(resolve(root, 'resources/sat-study-guides-flashcards.csv'), 'utf8'))
const videoRows = parseCsv(await readFile(resolve(root, 'resources/sat-video-links.csv'), 'utf8'))
const quizRows = parseCsv(await readFile(resolve(root, 'resources/sat-master-questions.csv'), 'utf8'))
const mockOneRows = parseCsv(await readFile(resolve(root, 'resources/sat-mock-exam-1.csv'), 'utf8'))
const mockTwoRows = parseCsv(await readFile(resolve(root, 'resources/sat-mock-exam-2.csv'), 'utf8'))

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

const questionsByTopic = new Map(topics.map((topic) => [topic.id, []]))
const unmatched = []
for (const row of quizRows) {
  const topic = topicForQuestion(row)
  const question = compactQuestion(row)
  if (topic) questionsByTopic.get(topic.id).push(question)
  else unmatched.push(question)
}
for (const topic of topics) topic.quizCount = questionsByTopic.get(topic.id).length

const sectionMap = new Map()
for (const topic of topics) {
  const key = `${topic.section}::${topic.domain}`
  if (!sectionMap.has(key)) sectionMap.set(key, { id: normalize(key).replaceAll(' ', '-'), title: topic.domain, examSection: topic.section, topicIds: [] })
  sectionMap.get(key).topicIds.push(topic.id)
}

const manifest = {
  exam: 'Digital SAT',
  generatedFrom: 'SAT complete exam-prep materials',
  totals: {
    topics: topics.length,
    flashcards: topics.reduce((total, topic) => total + topic.flashcards.length, 0),
    quizQuestions: quizRows.length,
    mappedQuizQuestions: quizRows.length - unmatched.length,
    mockExams: 2,
  },
  sections: [...sectionMap.values()],
  topics,
}

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
await mkdir(resolve(root, 'src/data'), { recursive: true })
await writeFile(resolve(root, 'public/data/sat/topics.json'), JSON.stringify(manifest))
for (const topic of topics) {
  await writeFile(resolve(root, `public/data/sat/quizzes/${topic.id}.json`), JSON.stringify({ topicId: topic.id, questions: questionsByTopic.get(topic.id) }))
}
await writeFile(resolve(root, 'public/data/sat/quizzes/unmatched.json'), JSON.stringify({ questions: unmatched }))
await writeFile(resolve(root, 'src/data/satMockExam1.json'), JSON.stringify(mockExam(mockOneRows, 'sat_mock_exam_1')))
await writeFile(resolve(root, 'src/data/satMockExam2.json'), JSON.stringify(mockExam(mockTwoRows, 'sat_mock_exam_2')))

const emptyOptions = quizRows.filter((row) => questionParts(row.questionText, row.answer).options.length < 2).length
const report = {
  topics: topics.length,
  flashcards: manifest.totals.flashcards,
  quizQuestions: quizRows.length,
  mappedQuizQuestions: manifest.totals.mappedQuizQuestions,
  unmatchedQuizQuestions: unmatched.length,
  quizQuestionsWithoutOptions: emptyOptions,
  mockExamOneQuestions: mockOneRows.length,
  mockExamTwoQuestions: mockTwoRows.length,
  topicsWithoutVideo: topics.filter((topic) => !topic.video.url).length,
  topicsWithoutStudyGuide: topics.filter((topic) => !Object.keys(topic.studyGuide || {}).length).length,
  topicsWithoutFlashcards: topics.filter((topic) => !topic.flashcards.length).length,
}
console.log(JSON.stringify(report, null, 2))
