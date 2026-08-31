<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HighlightablePassage from '../components/HighlightablePassage.vue'
import MathReferenceSheet from '../components/MathReferenceSheet.vue'
import ScientificCalculator from '../components/ScientificCalculator.vue'
import { loadEpExam } from '../data/satData'
import type { EpExam } from '../types/epV2'

type SectionKind = 'reading' | 'math'
type ExamStage = 'exam' | 'review' | 'break' | 'complete' | 'results'
type HighlightColor = 'yellow' | 'pink' | 'blue'
type HighlightUnderline = 'solid' | 'dashed' | 'dotted' | 'none'

type TextHighlight = {
  id: string
  start: number
  end: number
  color: HighlightColor
  underline?: HighlightUnderline
  note?: string
}

type ModuleDefinition = {
  id: string
  sectionNumber: number
  moduleNumber: number
  section: SectionKind
  title: string
  total: number
  duration: number
}

type Question = {
  prompt: string
  passage: string
  options: string[]
  correctIndex: number
  answer: string
  explanation: string
  difficulty: string
  domain: string
  graph?: boolean
  diagram?: boolean
}

type SourceQuestion = {
  question: string
  options: string[]
  correctIndex: number
  answer: string
  explanation: string
  difficulty: string
  section: string
  domain: string
  skill: string
  teachingTopic: string
  module: string
  questionNumber: number
  responseType: string
}

type SourceExam = { id: string; title: string; questions: SourceQuestion[] }

const modules: ModuleDefinition[] = [
  { id: 'reading-1', sectionNumber: 1, moduleNumber: 1, section: 'reading', title: 'Reading and Writing', total: 27, duration: 32 * 60 },
  { id: 'reading-2', sectionNumber: 1, moduleNumber: 2, section: 'reading', title: 'Reading and Writing', total: 27, duration: 32 * 60 },
  { id: 'math-1', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Math', total: 22, duration: 35 * 60 },
  { id: 'math-2', sectionNumber: 2, moduleNumber: 2, section: 'math', title: 'Math', total: 22, duration: 35 * 60 },
]

const route = useRoute()
const router = useRouter()
const examId = computed(() => String(route.params.examId) === '2' ? 2 : 1)
const activeEpExam = ref<EpExam | null>(null)
const examLoadError = ref('')

function adaptEpExam(exam: EpExam, index: number): SourceExam {
  const moduleCounts = new Map<string, number>()
  return {
    id: String(exam._id),
    title: `Digital SAT Full-Length Practice Test ${index + 1}`,
    questions: exam.questions.map((question) => {
      const module = question.module === 'Module 2' ? 'M2' : 'M1'
      const moduleKey = `${question.sectionTitle}:${module}`
      const questionNumber = (moduleCounts.get(moduleKey) ?? 0) + 1
      moduleCounts.set(moduleKey, questionNumber)
      const optionEntries = Object.entries(question.options).sort(([left], [right]) => left.localeCompare(right))
      return {
        question: question.stem,
        options: optionEntries.map(([, option]) => option),
        correctIndex: optionEntries.findIndex(([letter]) => letter === question.correctAnswer),
        answer: question.correctAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty,
        section: question.sectionTitle,
        domain: question.contentDomain,
        skill: question.officialSkill,
        teachingTopic: question.teachingTopic,
        module,
        questionNumber,
        responseType: question.responseType,
      }
    }),
  }
}

const activeExam = computed<SourceExam>(() => activeEpExam.value
  ? adaptEpExam(activeEpExam.value, examId.value - 1)
  : { id: '', title: 'Loading Digital SAT Mock Exam…', questions: [] })

async function loadActiveExam() {
  examLoadError.value = ''
  activeEpExam.value = null
  try {
    activeEpExam.value = await loadEpExam(examId.value)
  } catch (error) {
    examLoadError.value = error instanceof Error ? error.message : 'Unable to load the mock exam.'
  }
}

watch(examId, () => { void loadActiveExam() })

function sourceQuestionFor(module: ModuleDefinition, number: number) {
  const section = module.section === 'reading' ? 'Reading and Writing' : 'Math'
  const moduleCode = module.moduleNumber === 1 ? 'M1' : 'M2'
  return activeExam.value.questions.find((question) => question.section === section && question.module === moduleCode && question.questionNumber === number)
}

function displayQuestion(source: SourceQuestion | undefined): Question {
  if (!source) return { prompt: 'Question unavailable', passage: '', options: [], correctIndex: -1, answer: '', explanation: '', difficulty: '', domain: '' }
  if (source.section === 'Reading and Writing') {
    const markers = ['Which choice', 'According to', 'Based on the', 'What is the']
    const splitAt = Math.max(...markers.map((marker) => source.question.lastIndexOf(marker)))
    if (splitAt > 20) {
      return { ...source, passage: source.question.slice(0, splitAt).trim(), prompt: source.question.slice(splitAt).trim(), graph: false, diagram: false }
    }
  }
  return { ...source, passage: '', prompt: source.question.replace(/\nEnter your answer\.?$/i, ''), graph: false, diagram: false }
}

const stage = ref<ExamStage>('exam')
const moduleIndex = ref(0)
const currentNumber = ref(1)
const answers = reactive<Record<string, number | null>>({})
const responses = reactive<Record<string, string>>({})
const eliminated = reactive<Record<string, Set<number>>>({})
const review = reactive(new Set<string>())
const highlights = reactive<Record<string, TextHighlight[]>>({})
const highlighterEnabled = ref(false)
const eliminationMode = ref(false)
const calculatorOpen = ref(false)
const referenceOpen = ref(false)
const navigatorOpen = ref(false)
const directionsOpen = ref(false)
const moreOpen = ref(false)
const timerVisible = ref(true)
const toastMessage = ref('')
const recommendationRating = ref<number | null>(null)
const challengeRating = ref<number | null>(null)
const feedbackText = ref('')
const feedbackSubmitted = ref(false)
const timeRemaining = ref(modules[0].duration)
const breakRemaining = ref(9 * 60 + 52)
const questionTimeSeconds = reactive<Record<string, number>>({})
const leftWidth = ref(47.25)
const passageScroller = ref<HTMLElement | null>(null)
const questionScroller = ref<HTMLElement | null>(null)
let countdownId: number | undefined
let toastId: number | undefined

const currentModule = computed(() => modules[moduleIndex.value])
const currentSourceQuestion = computed(() => sourceQuestionFor(currentModule.value, currentNumber.value))
const currentQuestion = computed<Question>(() => displayQuestion(currentSourceQuestion.value))
const questionKey = computed(() => `${currentModule.value.id}-${currentNumber.value}`)
const sectionLabel = computed(() => `Section ${currentModule.value.sectionNumber}, Module ${currentModule.value.moduleNumber}`)
const timeLabel = computed(() => formatTime(timeRemaining.value))
const breakTimeLabel = computed(() => formatTime(breakRemaining.value))
const answeredNumbers = computed(() => {
  const values = new Set<number>()
  for (let number = 1; number <= currentModule.value.total; number += 1) {
    if (isAnsweredKey(`${currentModule.value.id}-${number}`)) values.add(number)
  }
  return values
})

function normalize(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function isAnsweredKey(key: string) {
  return (answers[key] !== undefined && answers[key] !== null) || Boolean(responses[key]?.trim())
}

function correctAnswerFor(module: ModuleDefinition, number: number) {
  return sourceQuestionFor(module, number)?.correctIndex ?? -1
}

function isCorrectFor(module: ModuleDefinition, number: number) {
  const key = `${module.id}-${number}`
  const source = sourceQuestionFor(module, number)
  if (!source) return false
  if (source.options.length) return answers[key] === source.correctIndex
  return normalize(responses[key]) === normalize(source.answer)
}

function topicFor(module: ModuleDefinition, number: number) {
  return sourceQuestionFor(module, number)?.domain ?? (module.section === 'reading' ? 'Reading and Writing' : 'Math')
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

const moduleStats = computed(() =>
  modules.map((module) => {
    let correct = 0
    let incorrect = 0
    let seconds = 0
    const cells = Array.from({ length: module.total }, (_, index) => {
      const number = index + 1
      const key = `${module.id}-${number}`
      seconds += questionTimeSeconds[key] ?? 0
      if (!isAnsweredKey(key)) return { number, status: 'omitted' }
      if (isCorrectFor(module, number)) {
        correct += 1
        return { number, status: 'correct' }
      }
      incorrect += 1
      return { number, status: 'incorrect' }
    })
    const attempted = correct + incorrect
    return {
      ...module,
      correct,
      incorrect,
      omitted: module.total - attempted,
      attempted,
      averageSeconds: attempted ? Math.round(seconds / attempted) : 0,
      cells,
    }
  }),
)

const subjectStats = computed(() =>
  (['reading', 'math'] as SectionKind[]).map((section) => {
    const stats = moduleStats.value.filter((module) => module.section === section)
    const total = stats.reduce((sum, module) => sum + module.total, 0)
    const correct = stats.reduce((sum, module) => sum + module.correct, 0)
    const incorrect = stats.reduce((sum, module) => sum + module.incorrect, 0)
    const attempted = correct + incorrect
    const seconds = stats.reduce((sum, module) => sum + module.averageSeconds * module.attempted, 0)
    return {
      section,
      label: section === 'reading' ? 'Reading and Writing' : 'Math',
      total,
      correct,
      incorrect,
      omitted: total - attempted,
      attempted,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      averageSeconds: attempted ? Math.round(seconds / attempted) : 0,
      score: 200 + Math.round(((correct / total) * 600) / 10) * 10,
    }
  }),
)

const totalStats = computed(() => {
  const total = moduleStats.value.reduce((sum, module) => sum + module.total, 0)
  const correct = moduleStats.value.reduce((sum, module) => sum + module.correct, 0)
  const incorrect = moduleStats.value.reduce((sum, module) => sum + module.incorrect, 0)
  const attempted = correct + incorrect
  return {
    total,
    correct,
    incorrect,
    unattempted: total - attempted,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    score: subjectStats.value.reduce((sum, subject) => sum + subject.score, 0),
  }
})

const topicStats = computed(() => {
  const groups = new Map<string, { section: SectionKind; label: string; attempts: number; correct: number; seconds: number[] }>()
  for (const module of modules) {
    for (let number = 1; number <= module.total; number += 1) {
      const label = topicFor(module, number)
      const group = groups.get(label) ?? { section: module.section, label, attempts: 0, correct: 0, seconds: [] }
      const key = `${module.id}-${number}`
      if (isAnsweredKey(key)) {
        group.attempts += 1
        if (isCorrectFor(module, number)) group.correct += 1
        group.seconds.push(questionTimeSeconds[key] ?? 0)
      }
      groups.set(label, group)
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    accuracy: group.attempts ? Math.round((group.correct / group.attempts) * 100) : 0,
    medianSeconds: median(group.seconds),
  }))
})

const weakestTopics = computed(() =>
  [...topicStats.value].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts).slice(0, 5),
)

const difficultyStats = computed(() =>
  (['reading', 'math'] as SectionKind[]).map((section) => {
    const buckets = ['Easy', 'Medium', 'Hard'].map((label) => ({ label, seconds: [] as number[] }))
    modules
      .filter((module) => module.section === section)
      .forEach((module) => {
        for (let number = 1; number <= module.total; number += 1) {
          const key = `${module.id}-${number}`
          if (isAnsweredKey(key)) buckets[(number - 1) % 3].seconds.push(questionTimeSeconds[key] ?? 0)
        }
      })
    return {
      section,
      label: section === 'reading' ? 'English' : 'Math',
      values: buckets.map((bucket) => ({ ...bucket, averageSeconds: bucket.seconds.length ? Math.round(bucket.seconds.reduce((sum, value) => sum + value, 0) / bucket.seconds.length) : 0 })),
    }
  }),
)

const completedDate = computed(() =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
)

function formatDuration(value: number) {
  if (!value) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function keyFor(number: number) {
  return `${currentModule.value.id}-${number}`
}

function selectAnswer(index: number) {
  answers[questionKey.value] = index
}

function setResponse(event: Event) {
  responses[questionKey.value] = (event.target as HTMLInputElement).value
}

function toggleEliminated(index: number) {
  const active = eliminated[questionKey.value] ?? new Set<number>()
  if (!eliminated[questionKey.value]) eliminated[questionKey.value] = active
  active.has(index) ? active.delete(index) : active.add(index)
}

function toggleEliminationMode() {
  eliminationMode.value = !eliminationMode.value
}

function goToQuestion(number: number) {
  currentNumber.value = Math.max(1, Math.min(currentModule.value.total, number))
  navigatorOpen.value = false
  closeTransientTools()
  void nextTick(() => {
    passageScroller.value?.scrollTo({ top: 0 })
    questionScroller.value?.scrollTo({ top: 0 })
  })
}

function nextQuestion() {
  if (stage.value !== 'exam') return
  if (currentNumber.value < currentModule.value.total) goToQuestion(currentNumber.value + 1)
  else openReview()
}

function previousQuestion() {
  if (stage.value === 'review') {
    stage.value = 'exam'
    return
  }
  if (currentNumber.value > 1) goToQuestion(currentNumber.value - 1)
}

function openReview() {
  stage.value = 'review'
  navigatorOpen.value = false
  calculatorOpen.value = false
  referenceOpen.value = false
  highlighterEnabled.value = false
}

function startModule(index: number) {
  moduleIndex.value = index
  currentNumber.value = 1
  timeRemaining.value = modules[index].duration
  stage.value = 'exam'
  navigatorOpen.value = false
  timerVisible.value = true
  closeTransientTools()
}

function advanceFromReview() {
  if (moduleIndex.value === 1) {
    stage.value = 'break'
    navigatorOpen.value = false
    return
  }
  if (moduleIndex.value < modules.length - 1) startModule(moduleIndex.value + 1)
  else openPackageScoreReport()
}

function resumeAfterBreak() {
  startModule(2)
}

function restartExam() {
  Object.keys(answers).forEach((key) => delete answers[key])
  Object.keys(responses).forEach((key) => delete responses[key])
  Object.keys(eliminated).forEach((key) => delete eliminated[key])
  Object.keys(highlights).forEach((key) => delete highlights[key])
  Object.keys(questionTimeSeconds).forEach((key) => delete questionTimeSeconds[key])
  review.clear()
  recommendationRating.value = null
  challengeRating.value = null
  feedbackText.value = ''
  feedbackSubmitted.value = false
  eliminationMode.value = false
  moduleIndex.value = 0
  currentNumber.value = 1
  timeRemaining.value = modules[0].duration
  breakRemaining.value = 9 * 60 + 52
  stage.value = 'exam'
  closeTransientTools()
}

function openResults() {
  openPackageScoreReport()
}

function openPackageScoreReport() {
  void router.push({ name: 'package', query: { tab: 'results', view: 'score' }, hash: '#course-0' })
}

function backToCompletion() {
  stage.value = 'complete'
  void nextTick(() => window.scrollTo({ top: 0 }))
}

function exitExam() {
  void router.push({ name: 'package', query: { tab: 'mock' }, hash: '#course-0' })
}

function submitFeedback() {
  if (recommendationRating.value === null || challengeRating.value === null) {
    showToast('Please answer both required rating questions.')
    return
  }
  feedbackSubmitted.value = true
  showToast('Thanks — your feedback has been recorded.')
}

function downloadReport() {
  window.print()
}

function toggleReview() {
  review.has(questionKey.value) ? review.delete(questionKey.value) : review.add(questionKey.value)
}

function toggleHighlightMode() {
  highlighterEnabled.value = !highlighterEnabled.value
  moreOpen.value = false
}

function toggleCalculator() {
  calculatorOpen.value = !calculatorOpen.value
  moreOpen.value = false
}

function toggleReference() {
  referenceOpen.value = !referenceOpen.value
  moreOpen.value = false
}

function closeTransientTools() {
  calculatorOpen.value = false
  referenceOpen.value = false
  highlighterEnabled.value = false
  directionsOpen.value = false
  moreOpen.value = false
}

function updateHighlights(value: TextHighlight[]) {
  highlights[questionKey.value] = value
}

function showToast(message: string) {
  toastMessage.value = message
  if (toastId) window.clearTimeout(toastId)
  toastId = window.setTimeout(() => (toastMessage.value = ''), 2400)
}

function beginResize(event: PointerEvent) {
  const onMove = (moveEvent: PointerEvent) => {
    leftWidth.value = Math.min(64, Math.max(35, (moveEvent.clientX / window.innerWidth) * 100))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.classList.remove('is-resizing')
  }
  document.body.classList.add('is-resizing')
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (event.key === 'Escape') {
    navigatorOpen.value = false
    directionsOpen.value = false
    moreOpen.value = false
    referenceOpen.value = false
    return
  }
  if (stage.value !== 'exam' || calculatorOpen.value || target?.closest('button, input, select, textarea, [contenteditable], .user-highlight')) return
  if (currentQuestion.value.options.length && ['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault()
    selectAnswer(Number(event.key) - 1)
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    nextQuestion()
  }
}

onMounted(async () => {
  document.body.classList.add('mock-exam-route')
  await loadActiveExam()
  countdownId = window.setInterval(() => {
    if ((stage.value === 'exam' || stage.value === 'review') && timeRemaining.value > 0) timeRemaining.value -= 1
    if (stage.value === 'exam') questionTimeSeconds[questionKey.value] = (questionTimeSeconds[questionKey.value] ?? 0) + 1
    if (stage.value === 'break' && breakRemaining.value > 0) breakRemaining.value -= 1
  }, 1000)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.classList.remove('mock-exam-route')
  if (countdownId) window.clearInterval(countdownId)
  if (toastId) window.clearTimeout(toastId)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main v-if="examLoadError" class="completion-page">
    <section class="completion-card"><h1>Unable to load this mock exam</h1><p>{{ examLoadError }}</p><button class="view-results-button" type="button" @click="exitExam">Back to SAT package</button></section>
  </main>

  <main v-else-if="!activeEpExam" class="completion-page">
    <section class="completion-card"><p>Loading Digital SAT Mock Exam {{ examId }}…</p></section>
  </main>

  <main v-else-if="stage === 'break'" class="break-screen">
    <button class="save-leave-button" type="button" @click="exitExam"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>Save and Leave</button>
    <div class="break-layout">
      <section class="break-timer-column">
        <div class="oneprep-wordmark"><span aria-hidden="true">●</span>Solvely SAT</div>
        <div class="break-timer-card"><span>Break Time:</span><strong>{{ breakTimeLabel }}</strong></div>
        <button class="resume-button" type="button" @click="resumeAfterBreak">Resume Testing</button>
      </section>
      <section class="break-copy">
        <h1>Practice Test Break</h1>
        <p>You can resume this practice test as soon as you're ready to move on. On test day, you'll wait until the clock counts down.</p>
        <h2>On Test Day…</h2>
        <p>After the break, a “Resume Testing” button will appear and you'll start the next section.</p>
        <ul><li>Do not disturb students who are still testing.</li><li>Do not exit the app or close your laptop.</li><li>Do not access phones, smartwatches, textbooks, notes, or the internet.</li><li>Do not eat or drink near any testing device.</li><li>Do not speak in the testing room; outside the room, do not discuss the exam with anyone.</li></ul>
      </section>
    </div>
    <div v-if="toastMessage" class="toast break-toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else-if="stage === 'complete'" class="completion-page">
    <section class="completion-card">
      <button class="completion-back" type="button" @click="exitExam"><span aria-hidden="true">‹</span> Back to SAT package</button>
      <div class="completion-mark" aria-hidden="true">✓</div>
      <h1>Congratulations!</h1>
      <p>You've completed</p>
      <h2>{{ activeExam.title }}</h2>
      <button class="view-results-button" type="button" @click="openResults">View Results</button>

      <form class="feedback-card" @submit.prevent="submitFeedback">
        <fieldset>
          <legend>How likely are you to recommend this SAT mock exam to a friend? <span aria-hidden="true">*</span></legend>
          <div class="rating-row" role="radiogroup" aria-label="Recommendation rating">
            <button v-for="rating in 11" :key="`recommend-${rating - 1}`" type="button" :class="{ selected: recommendationRating === rating - 1 }" :aria-pressed="recommendationRating === rating - 1" @click="recommendationRating = rating - 1">{{ rating - 1 }}</button>
          </div>
          <div class="rating-labels"><span>trash</span><span>amazinggg</span></div>
        </fieldset>

        <fieldset>
          <legend>How much did that challenge you? <span aria-hidden="true">*</span></legend>
          <div class="rating-row" role="radiogroup" aria-label="Challenge rating">
            <button v-for="rating in 11" :key="`challenge-${rating - 1}`" type="button" :class="{ selected: challengeRating === rating - 1 }" :aria-pressed="challengeRating === rating - 1" @click="challengeRating = rating - 1">{{ rating - 1 }}</button>
          </div>
          <div class="rating-labels"><span>light work</span><span>pretty hard bruh</span></div>
        </fieldset>

        <label class="feedback-label" for="completion-feedback">Anything else you want to tell us? <span>(optional - we read all replies)</span></label>
        <textarea id="completion-feedback" v-model="feedbackText" rows="5" />
        <button class="feedback-submit" type="submit" :disabled="feedbackSubmitted">{{ feedbackSubmitted ? 'Submitted' : 'Submit' }} <span aria-hidden="true">→</span></button>
        <p v-if="feedbackSubmitted" class="feedback-success" role="status">Thanks — your feedback has been recorded.</p>
      </form>
    </section>
    <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else-if="stage === 'results'" class="results-page">
    <article class="results-shell">
      <button class="report-back" type="button" @click="exitExam"><span aria-hidden="true">‹</span> Back to SAT package</button>

      <header class="report-title-row">
        <div class="report-title-copy">
          <span class="report-title-icon" aria-hidden="true"><i /><i /><i /></span>
          <div><h1>{{ activeExam.title }}</h1><p>All modules</p></div>
        </div>
        <div class="report-title-actions"><span>Completed on {{ completedDate }}</span><button type="button" @click="downloadReport"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v3h14v-3" /></svg>Download report</button></div>
      </header>

      <section class="report-disclaimer">
        <div class="report-brand-mark" aria-hidden="true">S</div>
        <div><h2>Practice score disclaimer</h2><p>This mock exam is calibrated to the current Digital SAT structure. Its score is an estimated practice result and is not an official College Board score.</p></div>
      </section>

      <section class="report-section" aria-labelledby="overview-title">
        <h2 id="overview-title" class="report-section-title"><span aria-hidden="true">◔</span>Overview</h2>
        <div class="analysis-banner"><div><strong>Your complete analysis is ready.</strong><span>Every number below reflects this practice session.</span></div><span class="analysis-banner-badge">98 questions</span></div>
        <div class="score-grid">
          <div class="score-card total-score-card"><span>Estimated Total Score</span><strong>{{ totalStats.score }}</strong><small>400–1600</small><div class="subject-score-row"><div v-for="subject in subjectStats" :key="subject.section"><span>{{ subject.label }}</span><strong>{{ subject.score }}</strong><small>200–800</small></div></div></div>
          <div class="score-card distribution-card"><div class="distribution-labels"><span>Practice range</span><strong>You</strong></div><svg viewBox="0 0 520 210" role="img" aria-label="Estimated score distribution"><defs><linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aeeaff" stop-opacity=".65" /><stop offset="1" stop-color="#effaff" stop-opacity=".18" /></linearGradient></defs><path d="M15 185C75 180 105 161 142 127C184 88 210 43 260 39C310 43 336 88 378 127C415 161 445 180 505 185V198H15Z" fill="url(#curveFill)" /><path d="M15 185C75 180 105 161 142 127C184 88 210 43 260 39C310 43 336 88 378 127C415 161 445 180 505 185" fill="none" stroke="#54c7f1" stroke-width="3" /><line x1="280" y1="28" x2="280" y2="194" stroke="#171717" stroke-width="2" stroke-dasharray="7 7" /><circle cx="280" cy="105" r="8" fill="#111" /></svg><p>Estimated score based on {{ totalStats.correct }} correct answers across all four modules.</p></div>
        </div>
        <div class="summary-stat-grid"><div><span>Correct</span><strong>{{ totalStats.correct }}<small>/{{ totalStats.total }}</small></strong></div><div><span>Wrong</span><strong>{{ totalStats.incorrect }}</strong></div><div><span>Accuracy</span><strong>{{ totalStats.accuracy }}%</strong></div><div><span>Unattempted</span><strong>{{ totalStats.unattempted }}</strong></div></div>
      </section>

      <section class="report-section" aria-labelledby="module-title">
        <h2 id="module-title" class="report-section-title"><span aria-hidden="true">▦</span>Module performance</h2>
        <div class="module-report-grid">
          <article v-for="module in moduleStats" :key="module.id" class="module-report-card">
            <h3>{{ module.section === 'reading' ? 'R&W' : 'Math' }} – Module {{ module.moduleNumber }}<span v-if="module.moduleNumber === 2"> (Easy)</span></h3>
            <div class="module-counts"><span><b>{{ module.correct }}</b>correct</span><span><b>{{ module.incorrect }}</b>incorrect</span><span><b>{{ module.omitted }}</b>omitted</span></div>
            <div class="module-cell-grid"><span v-for="cell in module.cells" :key="cell.number" :class="cell.status" :title="`Question ${cell.number}: ${cell.status}`">{{ cell.number }}</span></div>
            <p>Avg <strong>{{ formatDuration(module.averageSeconds) }}</strong> / {{ module.section === 'reading' ? '1:11' : '1:35' }}</p>
          </article>
        </div>
      </section>

      <section class="report-section" aria-labelledby="accuracy-title">
        <h2 id="accuracy-title" class="report-section-title"><span aria-hidden="true">◎</span>Accuracy</h2>
        <div class="accuracy-card">
          <div v-for="subject in subjectStats" :key="subject.section" class="accuracy-subject-row"><div><strong>{{ subject.label }}</strong><span>{{ subject.correct }} correct · {{ subject.incorrect }} wrong · {{ subject.omitted }} unattempted</span></div><div class="accuracy-track" aria-hidden="true"><span :style="{ width: `${subject.accuracy}%` }" /></div><b>{{ subject.accuracy }}%</b></div>
        </div>
      </section>

      <section class="report-section" aria-labelledby="time-title">
        <h2 id="time-title" class="report-section-title"><span aria-hidden="true">◷</span>Time management</h2>
        <div class="pacing-card">
          <h3>Pacing by topic</h3>
          <p>Each row compares your median time per attempted question with the recommended pace for that subject.</p>
          <div class="pacing-columns">
            <div v-for="section in ['reading', 'math']" :key="section" class="pacing-column"><h4>{{ section === 'reading' ? 'English' : 'Math' }}</h4><div v-for="topic in topicStats.filter((item) => item.section === section)" :key="topic.label" class="pacing-row"><div><span>{{ topic.label }}</span><small>{{ topic.attempts }} attempted</small></div><div class="pacing-track"><span class="benchmark" :style="{ width: `${section === 'reading' ? 59 : 79}%` }" /><i :style="{ left: `${Math.min(96, Math.max(2, (topic.medianSeconds / 120) * 100))}%` }" /></div><strong>{{ formatDuration(topic.medianSeconds) }}</strong></div></div>
          </div>
        </div>

        <div class="confidence-card">
          <h3>Confidence quadrant</h3><p>Time per question runs left to right; accuracy runs bottom to top. Each dot is a skill topic.</p>
          <div class="quadrant-grid">
            <div v-for="section in ['reading', 'math']" :key="`quadrant-${section}`" class="quadrant-column"><h4>{{ section === 'reading' ? 'English' : 'Math' }}</h4><div class="quadrant-chart"><span class="quad-label proficient">Proficient</span><span class="quad-label inefficient">Inefficient</span><span class="quad-label careless">Careless</span><span class="quad-label struggling">Struggling</span><i v-for="topic in topicStats.filter((item) => item.section === section)" :key="topic.label" class="quadrant-dot" :class="{ correct: topic.accuracy >= 50 }" :style="{ left: `${Math.min(94, Math.max(5, (topic.medianSeconds / 120) * 100))}%`, top: `${Math.min(91, Math.max(7, 100 - topic.accuracy))}%` }" :title="`${topic.label}: ${topic.accuracy}% at ${formatDuration(topic.medianSeconds)}`" /></div></div>
          </div>
        </div>
      </section>

      <section class="report-section" aria-labelledby="skill-title">
        <h2 id="skill-title" class="report-section-title"><span aria-hidden="true">▥</span>Skill breakdown</h2>
        <div class="weakest-card"><h3>5 topics costing the most points</h3><ol><li v-for="(topic, index) in weakestTopics" :key="topic.label"><span class="topic-rank">{{ String(index + 1).padStart(2, '0') }}</span><div><small>{{ topic.accuracy < 60 ? 'Needs work' : 'On track' }} · {{ topic.section === 'reading' ? 'Reading & Writing' : 'Math' }} · {{ topic.attempts }} attempts</small><strong>{{ topic.label }}</strong></div><b>{{ topic.accuracy }}%</b></li></ol></div>
        <div class="skill-cards"><article v-for="section in ['reading', 'math']" :key="`skills-${section}`"><h3>{{ section === 'reading' ? 'English' : 'Math' }}</h3><p>Accuracy by topic</p><div v-for="topic in topicStats.filter((item) => item.section === section)" :key="topic.label" class="skill-row"><div><span>{{ topic.label }}</span><small>{{ topic.attempts }} attempts</small></div><div class="skill-track"><i :style="{ left: `${topic.accuracy}%` }" /></div><strong>{{ topic.accuracy }}%</strong></div></article></div>
        <div class="difficulty-cards"><article v-for="subject in difficultyStats" :key="subject.section"><h3>{{ subject.label }}</h3><p>Time per question by difficulty</p><div class="difficulty-body"><div class="time-ring"><strong>{{ formatDuration(subjectStats.find((item) => item.section === subject.section)?.averageSeconds ?? 0) }}</strong><span>average</span></div><div class="difficulty-list"><div v-for="value in subject.values" :key="value.label"><span>{{ value.label }}</span><strong>{{ formatDuration(value.averageSeconds) }}</strong><small>{{ value.seconds.length }} attempted</small></div></div></div></article></div>
      </section>
    </article>
    <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else class="exam-app" :class="{ 'review-stage': stage === 'review' }" :style="{ '--split': `${leftWidth}%` }">
    <header class="exam-header">
      <div class="header-left">
        <button class="package-exit-control" type="button" aria-label="Back to SAT package" @click="exitExam">←</button>
        <button class="directions-button" type="button" :aria-expanded="directionsOpen" @click="directionsOpen = !directionsOpen">Directions<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
        <div v-if="directionsOpen" class="header-popover directions-popover"><strong>{{ currentModule.title }}</strong><p v-if="currentModule.section === 'reading'">Choose the best answer to each question. You can return to any question before the module ends.</p><p v-else>Solve each problem and choose the best answer. Calculator and reference tools are available for this section.</p></div>
      </div>
      <div class="timer-wrap"><strong v-if="timerVisible" class="timer" aria-live="polite">{{ timeLabel }}</strong><span v-else class="timer-placeholder">Timer hidden</span><button type="button" @click="timerVisible = !timerVisible">{{ timerVisible ? 'Hide' : 'Show' }}</button></div>
      <div class="header-tools">
        <button class="tool-button" :class="{ active: highlighterEnabled }" type="button" :aria-pressed="highlighterEnabled" :aria-label="highlighterEnabled ? 'Turn off highlight mode' : 'Turn on highlight mode'" @click="toggleHighlightMode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16 9.8-9.8a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19H5v-3Z" /><path d="M13.5 7.5 16.5 10.5M4 21h16" /></svg><span>Highlight</span></button>
        <button v-if="currentModule.section === 'math'" class="tool-button" :class="{ active: calculatorOpen }" type="button" :aria-pressed="calculatorOpen" @click="toggleCalculator"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M8.5 6h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01" /></svg><span>Calculator</span></button>
        <button v-if="currentModule.section === 'math'" class="tool-button" :class="{ active: referenceOpen }" type="button" :aria-pressed="referenceOpen" @click="toggleReference"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l3 3v15H7zM15 3v4h4M10 11h5M10 15h5" /></svg><span>Reference</span></button>
        <div class="more-wrap"><button class="tool-button" type="button" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="19" r="1.3" fill="currentColor" /></svg><span>More</span></button><div v-if="moreOpen" class="header-popover more-popover"><button type="button">Line reader</button><button type="button">Question text size</button><button type="button">Keyboard shortcuts</button></div></div>
      </div>
    </header>

    <template v-if="stage === 'exam' && currentModule.section === 'reading'">
      <section class="exam-workspace">
        <article ref="passageScroller" class="passage-panel" aria-label="Reading passage">
          <div class="passage-inner" :class="{ 'graph-question': currentQuestion.graph }">
            <figure v-if="currentQuestion.graph" class="graph-figure" aria-label="Coffee shop density and laptop usage graph">
              <figcaption>Coffee Shop Density and<br />Average Laptop Usage Time</figcaption>
              <svg class="graph" viewBox="0 0 500 420" role="img" aria-labelledby="graph-title">
                <title id="graph-title">Coffee Shop Density and Average Laptop Usage Time</title>
                <g class="plot-area"><g class="grid-lines"><path d="M95 30H430M95 73.3H430M95 116.7H430M95 160H430M95 203.3H430M95 246.7H430M95 290H430" /></g><path class="axis" d="M95 21V290H440M89 290H101M89 246.7H101M89 203.3H101M89 160H101M89 116.7H101M89 73.3H101M89 30H101" /><g class="axis-labels"><text x="83" y="296">0</text><text x="74" y="252">2</text><text x="74" y="209">4</text><text x="74" y="166">6</text><text x="74" y="123">8</text><text x="65" y="80">10</text><text x="65" y="36">12</text><text x="91" y="315">0</text><text x="199" y="315">10</text><text x="309" y="315">20</text><text x="420" y="315">30</text><text class="x-title" x="264" y="346" text-anchor="middle">Number of coffee shops within 1 kilometer</text><text class="y-title" x="23" y="160" text-anchor="middle" transform="rotate(-90 23 160)">Average daily laptop</text><text class="y-title" x="42" y="160" text-anchor="middle" transform="rotate(-90 42 160)">usage per person (hours)</text></g><polyline class="winter-line" points="95,225 205,214 315,182 425,160" /><rect class="winter-dot" x="90" y="220" width="10" height="10" /><rect class="winter-dot" x="200" y="209" width="10" height="10" /><rect class="winter-dot" x="310" y="177" width="10" height="10" /><rect class="winter-dot" x="420" y="155" width="10" height="10" /><polyline class="summer-line" points="95,247 205,203 315,138 425,52" /><path class="summer-dot" d="m95 240 7 7-7 7-7-7Z" /><path class="summer-dot" d="m205 196 7 7-7 7-7-7Z" /><path class="summer-dot" d="m315 131 7 7-7 7-7-7Z" /><path class="summer-dot" d="m425 45 7 7-7 7-7-7Z" /></g>
                <g class="legend"><rect x="25" y="367" width="310" height="36" /><path class="winter-line" d="M46 385h50" /><rect class="winter-dot" x="66" y="380" width="10" height="10" /><text x="108" y="391">Winter</text><path class="summer-line" d="M183 385h50" /><path class="summer-dot" d="m208 378 7 7-7 7-7-7Z" /><text x="246" y="391">Summer</text></g>
              </svg>
            </figure>
            <HighlightablePassage :key="questionKey" :text="currentQuestion.passage" :enabled="highlighterEnabled" :model-value="highlights[questionKey] ?? []" :extra-class="currentQuestion.graph ? 'graph-copy' : ''" @update:model-value="updateHighlights" />
          </div>
        </article>
        <div class="splitter" role="separator" aria-orientation="vertical" :aria-valuenow="Math.round(leftWidth)" tabindex="0" @pointerdown="beginResize"><span><i /><i /><i /></span></div>
        <article ref="questionScroller" class="question-panel" aria-label="Answer choices"><div class="question-shell">
          <div class="question-toolbar"><span class="number-badge">{{ currentNumber }}</span><button class="review-button" :class="{ active: review.has(questionKey) }" type="button" @click="toggleReview"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2.5h12v17l-6-4-6 4v-17Z" /></svg>Mark for Review</button><button class="report-button" type="button" @click="showToast('Thanks. This question has been reported for review.')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m1 1h11l-2.2 4L17 13H6" /></svg>Report</button><button class="elimination-mode-button" :class="{ active: eliminationMode }" type="button" :aria-pressed="eliminationMode" :aria-label="eliminationMode ? 'Hide answer elimination controls' : 'Show answer elimination controls'" :title="eliminationMode ? 'Hide answer elimination controls' : 'Eliminate answer choices'" @click="toggleEliminationMode"><span aria-hidden="true">ABC</span></button></div>
          <h1>{{ currentQuestion.prompt }}</h1>
          <div class="choices" role="radiogroup" :aria-label="currentQuestion.prompt"><div v-for="(option, index) in currentQuestion.options" :key="`${questionKey}-${index}`" class="choice-row" :class="{ selected: answers[questionKey] === index, eliminated: eliminated[questionKey]?.has(index), 'elimination-mode': eliminationMode }"><button class="choice-card" type="button" role="radio" :aria-checked="answers[questionKey] === index" @click="selectAnswer(index)"><span class="choice-letter">{{ String.fromCharCode(65 + index) }}</span><span class="choice-copy">{{ option }}</span></button><button v-if="eliminationMode" class="eliminate-button" type="button" :aria-label="`${eliminated[questionKey]?.has(index) ? 'Restore' : 'Cross out'} answer ${String.fromCharCode(65 + index)}`" :aria-pressed="eliminated[questionKey]?.has(index) ?? false" @click="toggleEliminated(index)"><span>{{ String.fromCharCode(65 + index) }}</span></button></div></div>
          <p class="keyboard-tip">Tip:&nbsp; press <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> to pick an answer, then <kbd class="enter-key">Enter</kbd> to go to the next question</p>
        </div></article>
      </section>
    </template>

    <template v-else-if="stage === 'exam' && currentModule.section === 'math'">
      <section class="math-workspace" :class="{ 'calculator-visible': calculatorOpen }">
        <div v-if="calculatorOpen" class="math-calculator-pane"><ScientificCalculator @close="calculatorOpen = false" /></div><div v-if="calculatorOpen" class="math-splitter" aria-hidden="true"><span><i /><i /><i /></span></div>
        <article ref="questionScroller" class="math-question-panel" aria-label="Math question"><div class="math-question-shell" :class="{ 'diagram-question': currentQuestion.diagram }">
          <div class="question-toolbar"><span class="number-badge">{{ currentNumber }}</span><button class="review-button" :class="{ active: review.has(questionKey) }" type="button" @click="toggleReview"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2.5h12v17l-6-4-6 4v-17Z" /></svg>Mark for Review</button><button class="report-button" type="button" @click="showToast('Thanks. This question has been reported for review.')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m1 1h11l-2.2 4L17 13H6" /></svg>Report</button><button class="elimination-mode-button" :class="{ active: eliminationMode }" type="button" :aria-pressed="eliminationMode" :aria-label="eliminationMode ? 'Hide answer elimination controls' : 'Show answer elimination controls'" :title="eliminationMode ? 'Hide answer elimination controls' : 'Eliminate answer choices'" @click="toggleEliminationMode"><span aria-hidden="true">ABC</span></button></div>
          <figure v-if="currentQuestion.diagram" class="circle-diagram"><svg viewBox="0 0 620 560" role="img" aria-label="Circle with intersecting lines through O"><circle cx="310" cy="260" r="210" /><path d="M228 66 393 458M395 69 226 457" /><text x="201" y="67">S</text><text x="397" y="67">R</text><text x="198" y="489">P</text><text x="401" y="489">Q</text><text x="321" y="280">O</text></svg><figcaption>Note: Figure not drawn to scale.</figcaption></figure>
          <HighlightablePassage :key="questionKey" :text="currentQuestion.passage" :enabled="highlighterEnabled" :model-value="highlights[questionKey] ?? []" extra-class="math-stem-copy" @update:model-value="updateHighlights" />
          <h1>{{ currentQuestion.prompt }}</h1>
          <div v-if="currentQuestion.options.length" class="choices math-choices" role="radiogroup" :aria-label="currentQuestion.prompt"><div v-for="(option, index) in currentQuestion.options" :key="`${questionKey}-${index}`" class="choice-row" :class="{ selected: answers[questionKey] === index, eliminated: eliminated[questionKey]?.has(index), 'elimination-mode': eliminationMode }"><button class="choice-card" type="button" role="radio" :aria-checked="answers[questionKey] === index" @click="selectAnswer(index)"><span class="choice-letter">{{ String.fromCharCode(65 + index) }}</span><span class="choice-copy">{{ option }}</span></button><button v-if="eliminationMode" class="eliminate-button" type="button" :aria-label="`${eliminated[questionKey]?.has(index) ? 'Restore' : 'Cross out'} answer ${String.fromCharCode(65 + index)}`" :aria-pressed="eliminated[questionKey]?.has(index) ?? false" @click="toggleEliminated(index)"><span>{{ String.fromCharCode(65 + index) }}</span></button></div></div>
          <div v-else class="student-response-field"><label :for="`response-${questionKey}`">Student-produced response</label><input :id="`response-${questionKey}`" inputmode="decimal" :value="responses[questionKey] || ''" placeholder="Enter your answer" @input="setResponse" /><small>You may enter an integer, decimal, or fraction.</small></div>
          <p v-if="currentQuestion.options.length" class="keyboard-tip">Tip:&nbsp; press <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> to pick an answer, then <kbd class="enter-key">Enter</kbd> to go to the next question</p>
        </div></article>
      </section>
    </template>

    <section v-else-if="stage === 'review'" class="review-page"><div class="review-shell">
      <h1>Check Your Work</h1><p>On test day, you won't be able to move on to the next module until time expires.<br />For these practice questions, you can click <strong>Next</strong> when you're ready to move on.</p>
      <section class="review-card" :aria-label="`${sectionLabel}: ${currentModule.title}`"><div class="review-card-header"><h2>{{ sectionLabel }}: {{ currentModule.title }}</h2><div class="review-legend"><span><i class="unanswered-key" />Unanswered</span><span><i class="review-key" />For Review</span></div></div><div class="review-grid"><button v-for="number in currentModule.total" :key="number" type="button" :class="{ answered: answeredNumbers.has(number), current: currentNumber === number, review: review.has(keyFor(number)) }" @click="stage = 'exam'; goToQuestion(number)">{{ number }}</button></div></section>
    </div></section>

    <footer class="exam-footer">
      <button class="question-count" type="button" :aria-expanded="navigatorOpen" @click="navigatorOpen = !navigatorOpen">{{ currentNumber }} of {{ currentModule.total }}<svg viewBox="0 0 18 18" aria-hidden="true"><path :d="navigatorOpen ? 'm4 11 5-5 5 5' : 'm4 7 5 5 5-5'" /></svg></button>
      <div v-if="navigatorOpen" class="navigator-card"><button class="navigator-close" type="button" aria-label="Close question navigator" @click="navigatorOpen = false">×</button><h2>{{ sectionLabel }}:<br />{{ currentModule.title }}</h2><div class="navigator-rule" /><div class="navigator-legend"><span><i class="unanswered-key" />Unanswered</span><span><i class="review-key" />For Review</span></div><div class="question-grid"><button v-for="number in currentModule.total" :key="number" type="button" :class="{ answered: answeredNumbers.has(number), current: currentNumber === number, review: review.has(keyFor(number)) }" @click="stage = 'exam'; goToQuestion(number)">{{ number }}</button></div></div>
      <div class="footer-actions"><button v-if="stage === 'review'" type="button" @click="previousQuestion">Back</button><button v-else type="button" :disabled="currentNumber <= 1" @click="previousQuestion">Previous</button><button type="button" @click="stage === 'review' ? advanceFromReview() : nextQuestion()">Next</button></div>
    </footer>
    <MathReferenceSheet v-if="referenceOpen && currentModule.section === 'math'" @close="referenceOpen = false" />
    <div v-if="toastMessage" class="toast" role="status">{{ toastMessage }}</div>
  </main>
</template>
