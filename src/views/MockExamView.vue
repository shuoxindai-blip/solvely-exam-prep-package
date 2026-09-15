<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HighlightablePassage from '../components/HighlightablePassage.vue'
import MathText from '../components/MathText.vue'
import MathReferenceSheet from '../components/MathReferenceSheet.vue'
import PdfReferenceSheet from '../components/PdfReferenceSheet.vue'
import ScientificCalculator from '../components/ScientificCalculator.vue'
import { loadEpExam } from '../data/satData'
import { buildSatDiagnosticExam, SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION } from '../data/satDiagnostic'
import { getSatPracticeTest10ScoreRange } from '../data/satPracticeTest10Scoring'
import { loadActEpExam } from '../data/actData'
import { buildActDiagnosticExam, ACT_DIAGNOSTIC_SECTION_COUNTS } from '../data/actDiagnostic'
import { loadApEpExam } from '../data/apData'
import { AP_CALCULUS_BC_DIAGNOSTIC_QUESTION_COUNT, buildApDiagnosticExam } from '../data/apDiagnostic'
import { loadAbiturEpExam } from '../data/abiturData'
import { ABITUR_MATHEMATIK_DIAGNOSTIC_QUESTION_COUNT, buildAbiturDiagnosticExam } from '../data/abiturDiagnostic'
import { abiturNotenpunkte } from '../data/abiturReport'
import { getApReferenceSheet, isApExamSlug } from '../data/apReferenceSheets'
import type { EpExam } from '../types/epV2'
import { parseActPassage, type TextReference } from '../utils/actReference'

type SectionKind = 'reading' | 'math' | 'english' | 'science'
type ExamStage = 'exam' | 'review' | 'break' | 'complete' | 'results'
type HighlightColor = 'yellow' | 'pink' | 'blue'
type HighlightUnderline = 'solid' | 'dashed' | 'dotted' | 'none'
type ToolTooltipPlacement = 'above' | 'below'

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
  referenceHighlights: TextReference[]
  passageTitle?: string
  passageType?: string
  pictureUrl?: string
  options: string[]
  optionLabels: string[]
  optionPictureUrls: string[]
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
  optionLabels: string[]
  optionPictureUrls: string[]
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
  stimulusMaterial?: {
    id?: string
    title?: string
    type?: string
    body?: string
    pictureUrl?: string
  } | null
}

type SourceExam = { id: string; title: string; questions: SourceQuestion[] }

const fullLengthModules: ModuleDefinition[] = [
  { id: 'reading-1', sectionNumber: 1, moduleNumber: 1, section: 'reading', title: 'Reading and Writing', total: 33, duration: 39 * 60 },
  { id: 'reading-2', sectionNumber: 1, moduleNumber: 2, section: 'reading', title: 'Reading and Writing', total: 33, duration: 39 * 60 },
  { id: 'math-1', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Math', total: 27, duration: 43 * 60 },
  { id: 'math-2', sectionNumber: 2, moduleNumber: 2, section: 'math', title: 'Math', total: 27, duration: 43 * 60 },
]
const legacySatFullLengthModules: ModuleDefinition[] = [
  { id: 'reading-1', sectionNumber: 1, moduleNumber: 1, section: 'reading', title: 'Reading and Writing', total: 27, duration: 32 * 60 },
  { id: 'reading-2', sectionNumber: 1, moduleNumber: 2, section: 'reading', title: 'Reading and Writing', total: 27, duration: 32 * 60 },
  { id: 'math-1', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Math', total: 22, duration: 35 * 60 },
  { id: 'math-2', sectionNumber: 2, moduleNumber: 2, section: 'math', title: 'Math', total: 22, duration: 35 * 60 },
]
const diagnosticModules: ModuleDefinition[] = [
  { id: 'diagnostic-reading', sectionNumber: 1, moduleNumber: 1, section: 'reading', title: 'Reading and Writing', total: SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION, duration: 0 },
  { id: 'diagnostic-math', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Math', total: SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION, duration: 0 },
]
const actFullLengthModules: ModuleDefinition[] = [
  { id: 'act-english', sectionNumber: 1, moduleNumber: 1, section: 'english', title: 'English', total: 50, duration: 35 * 60 },
  { id: 'act-mathematics', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Mathematics', total: 45, duration: 50 * 60 },
  { id: 'act-reading', sectionNumber: 3, moduleNumber: 1, section: 'reading', title: 'Reading', total: 36, duration: 40 * 60 },
  { id: 'act-science', sectionNumber: 4, moduleNumber: 1, section: 'science', title: 'Science', total: 40, duration: 40 * 60 },
]
const actDiagnosticModules: ModuleDefinition[] = [
  { id: 'act-diagnostic-english', sectionNumber: 1, moduleNumber: 1, section: 'english', title: 'English', total: ACT_DIAGNOSTIC_SECTION_COUNTS.English, duration: 0 },
  { id: 'act-diagnostic-mathematics', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Mathematics', total: ACT_DIAGNOSTIC_SECTION_COUNTS.Mathematics, duration: 0 },
  { id: 'act-diagnostic-reading', sectionNumber: 3, moduleNumber: 1, section: 'reading', title: 'Reading', total: ACT_DIAGNOSTIC_SECTION_COUNTS.Reading, duration: 0 },
  { id: 'act-diagnostic-science', sectionNumber: 4, moduleNumber: 1, section: 'science', title: 'Science', total: ACT_DIAGNOSTIC_SECTION_COUNTS.Science, duration: 0 },
]
const apCalculusBcModules: ModuleDefinition[] = [
  { id: 'ap-calculus-bc-mcq', sectionNumber: 1, moduleNumber: 1, section: 'math', title: 'Multiple Choice', total: 42, duration: 105 * 60 },
  { id: 'ap-calculus-bc-frq', sectionNumber: 2, moduleNumber: 1, section: 'math', title: 'Free Response', total: 6, duration: 90 * 60 },
]
const apCalculusBcDiagnosticModules: ModuleDefinition[] = [
  { id: 'ap-calculus-bc-diagnostic', sectionNumber: 1, moduleNumber: 1, section: 'math', title: 'Multiple Choice', total: AP_CALCULUS_BC_DIAGNOSTIC_QUESTION_COUNT, duration: 0 },
]
const abiturMathematikModules: ModuleDefinition[] = [
  { id: 'abitur-mathematik', sectionNumber: 1, moduleNumber: 1, section: 'math', title: 'Mathematik', total: 23, duration: 300 * 60 },
]
const abiturMathematikDiagnosticModules: ModuleDefinition[] = [
  { id: 'abitur-mathematik-diagnostic', sectionNumber: 1, moduleNumber: 1, section: 'math', title: 'Mathematik', total: ABITUR_MATHEMATIK_DIAGNOSTIC_QUESTION_COUNT, duration: 0 },
]

const route = useRoute()
const router = useRouter()
const examSlug = computed(() => String(route.query.exam || '').trim().toLowerCase())
const isAnyApExam = computed(() => isApExamSlug(examSlug.value))
const apReferenceSheet = computed(() => getApReferenceSheet(examSlug.value))
const isDiagnostic = computed(() => String(route.query.mode || '') === 'diagnostic')
const isActExam = computed(() => examSlug.value === 'act')
const isApExam = computed(() => examSlug.value === 'ap-calculus-bc')
const isAbiturExam = computed(() => examSlug.value === 'abitur-mathematik')
const examName = computed(() => isAbiturExam.value ? 'Abitur Mathematik' : isApExam.value ? 'AP Calculus BC' : isActExam.value ? 'ACT' : 'SAT')
const packageHash = computed(() => isAbiturExam.value ? '#course-3' : isApExam.value ? '#course-2' : isActExam.value ? '#course-1' : '#course-0')
const examQuery = computed(() => isAbiturExam.value ? { exam: 'abitur-mathematik' } : isApExam.value ? { exam: 'ap-calculus-bc' } : isActExam.value ? { exam: 'act' } : {})
const examId = computed(() => String(route.params.examId) === '2' ? 2 : 1)
const modules = computed(() => isAbiturExam.value
  ? (isDiagnostic.value ? abiturMathematikDiagnosticModules : abiturMathematikModules)
  : isApExam.value
  ? (isDiagnostic.value ? apCalculusBcDiagnosticModules : apCalculusBcModules)
  : isActExam.value
  ? (isDiagnostic.value ? actDiagnosticModules : actFullLengthModules)
  : (isDiagnostic.value ? diagnosticModules : examId.value === 1 ? fullLengthModules : legacySatFullLengthModules))
const activeEpExam = ref<EpExam | null>(null)
const examLoadError = ref('')

function adaptEpExam(exam: EpExam, index: number, diagnostic = false): SourceExam {
  const moduleCounts = new Map<string, number>()
  return {
    id: String(exam._id),
    title: diagnostic
      ? `Free ${examName.value} Diagnostic Test`
      : isAbiturExam.value ? 'Abitur Mathematik eA Full-Length Practice Test' : isApExam.value ? 'AP Calculus BC Full-Length Practice Test' : isActExam.value ? 'ACT Full-Length Practice Test' : index === 0 ? 'Digital SAT Practice Test 10' : `Digital SAT Full-Length Practice Test ${index + 1}`,
    questions: exam.questions.map((question) => {
      const module = question.module === 'Module 2' ? 'M2' : 'M1'
      const moduleKey = `${question.sectionTitle}:${module}`
      const questionNumber = (moduleCounts.get(moduleKey) ?? 0) + 1
      moduleCounts.set(moduleKey, questionNumber)
      const optionEntries = Object.entries(question.options).sort(([left], [right]) => left.localeCompare(right))
      return {
        question: question.stem,
        options: optionEntries.map(([, option]) => option),
        optionLabels: optionEntries.map(([letter]) => letter),
        optionPictureUrls: optionEntries.map(([letter]) => question.optionPictureUrls?.[letter] ?? ''),
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
        stimulusMaterial: question.stimulusMaterial as SourceQuestion['stimulusMaterial'],
      }
    }),
  }
}

const activeExam = computed<SourceExam>(() => activeEpExam.value
  ? adaptEpExam(
      isDiagnostic.value
        ? (isAbiturExam.value ? buildAbiturDiagnosticExam(activeEpExam.value) : isApExam.value ? buildApDiagnosticExam(activeEpExam.value) : isActExam.value ? buildActDiagnosticExam(activeEpExam.value) : buildSatDiagnosticExam(activeEpExam.value))
        : activeEpExam.value,
      examId.value - 1,
      isDiagnostic.value,
    )
  : { id: '', title: `Loading ${examName.value} Practice Test…`, questions: [] })

async function loadActiveExam() {
  examLoadError.value = ''
  activeEpExam.value = null
  try {
    activeEpExam.value = await (isAbiturExam.value
      ? loadAbiturEpExam()
      : isApExam.value
      ? loadApEpExam(1)
      : isActExam.value
      ? loadActEpExam(isDiagnostic.value ? 2 : examId.value)
      : loadEpExam(examId.value))
  } catch (error) {
    examLoadError.value = error instanceof Error ? error.message : 'Unable to load the mock exam.'
  }
}

watch([examId, isActExam, isApExam, isAbiturExam, isDiagnostic], () => { void loadActiveExam() })

function sourceQuestionFor(module: ModuleDefinition, number: number) {
  const section = isActExam.value || isApExam.value || isAbiturExam.value
    ? module.title
    : module.section === 'reading' ? 'Reading and Writing' : 'Math'
  const moduleCode = module.moduleNumber === 1 ? 'M1' : 'M2'
  return activeExam.value.questions.find((question) => question.section === section && (isActExam.value || isApExam.value || isAbiturExam.value || question.module === moduleCode) && question.questionNumber === number)
}

function displayQuestion(source: SourceQuestion | undefined): Question {
  if (!source) return { prompt: 'Question unavailable', passage: '', referenceHighlights: [], options: [], optionLabels: [], optionPictureUrls: [], correctIndex: -1, answer: '', explanation: '', difficulty: '', domain: '' }
  if (isActExam.value) {
    const parsedPassage = parseActPassage(source.stimulusMaterial?.body ?? '', source.question)
    return {
      ...source,
      ...parsedPassage,
      passageTitle: source.stimulusMaterial?.title,
      passageType: source.stimulusMaterial?.type,
      pictureUrl: source.stimulusMaterial?.pictureUrl,
      prompt: source.question,
      graph: false,
      diagram: false,
    }
  }
  if (source.section === 'Reading and Writing') {
    const markers = ['Which choice', 'Which completion', 'Which quotation', 'Which finding', 'According to', 'Based on the', 'What is the', 'How would']
    const splitAt = Math.max(...markers.map((marker) => source.question.lastIndexOf(marker)))
    if (splitAt > 20) {
      return {
        ...source,
        passage: source.question.slice(0, splitAt).trim(),
        referenceHighlights: [],
        pictureUrl: source.stimulusMaterial?.pictureUrl,
        passageTitle: source.stimulusMaterial?.title,
        passageType: source.stimulusMaterial?.type,
        prompt: source.question.slice(splitAt).trim(),
        graph: false,
        diagram: false,
      }
    }
  }
  return {
    ...source,
    passage: '',
    referenceHighlights: [],
    pictureUrl: source.stimulusMaterial?.pictureUrl,
    passageTitle: source.stimulusMaterial?.title,
    passageType: source.stimulusMaterial?.type,
    prompt: source.question.replace(/\nEnter your answer\.?$/i, ''),
    graph: false,
    diagram: false,
  }
}

const stage = ref<ExamStage>('exam')
const moduleIndex = ref(0)
const currentNumber = ref(1)
const answers = reactive<Record<string, number | null>>({})
const responses = reactive<Record<string, string>>({})
const eliminated = reactive<Record<string, Set<number>>>({})
const review = reactive(new Set<string>())
const highlights = reactive<Record<string, TextHighlight[]>>({})
const failedStimulusVisuals = reactive(new Set<string>())
const highlighterEnabled = ref(false)
const eliminationMode = ref(false)
const calculatorOpen = ref(false)
const calculatorPoppedOut = ref(false)
const referenceOpen = ref(false)
const navigatorOpen = ref(false)
const lineReaderEnabled = ref(false)
const lineReaderY = ref(46)
const moreOpen = ref(false)
const shortcutsOpen = ref(false)
const reportOpen = ref(false)
const reportIssue = ref('Other issue')
const reportDetails = ref('')
const darkMode = ref(false)
const isFullscreen = ref(false)
const timerVisible = ref(!isDiagnostic.value)
const toastMessage = ref('')
const timeRemaining = ref(modules.value[0].duration)
const diagnosticElapsedSeconds = ref(0)
const breakRemaining = ref(isActExam.value ? 15 * 60 : 10 * 60)
const questionTimeSeconds = reactive<Record<string, number>>({})
const leftWidth = ref(47.25)
const passageScroller = ref<HTMLElement | null>(null)
const questionScroller = ref<HTMLElement | null>(null)
const toolTooltipElement = ref<HTMLElement | null>(null)
const toolTooltip = reactive({
  visible: false,
  text: '',
  placement: 'below' as ToolTooltipPlacement,
  x: 0,
  y: 0,
  arrowX: 0,
})
let countdownId: number | undefined
let toastId: number | undefined

const reportIssues = [
  'Problem with the question wording',
  'Answer choices are incorrect or incomplete',
  'Question content is missing',
  'Image or graph did not load',
  'Page is stuck or not responding',
  'Other issue',
]

const currentModule = computed(() => modules.value[moduleIndex.value])
const showReferenceTool = computed(() => isAbiturExam.value
  ? false
  : isAnyApExam.value
  ? Boolean(apReferenceSheet.value)
  : currentModule.value.section === 'math')
watch(showReferenceTool, (visible) => {
  if (!visible) referenceOpen.value = false
})
const currentSourceQuestion = computed(() => sourceQuestionFor(currentModule.value, currentNumber.value))
const currentQuestion = computed<Question>(() => displayQuestion(currentSourceQuestion.value))
const optionShortcutLabels = computed(() => currentQuestion.value.optionLabels.join(', ') || 'Listed choice')
const optionShortcutRange = computed(() => currentQuestion.value.options.length ? `1–${currentQuestion.value.options.length}` : '1–4')
const eliminationBadge = computed(() => currentQuestion.value.optionLabels.slice(0, 3).join('') || 'ABC')
const questionKey = computed(() => `${currentModule.value.id}-${currentNumber.value}`)
const usesPassageLayout = computed(() => currentModule.value.section !== 'math')
const activeSectionKinds = computed<SectionKind[]>(() => isActExam.value
  ? ['english', 'math', 'reading', 'science']
  : isApExam.value || isAbiturExam.value ? ['math'] : ['reading', 'math'])
function sectionName(section: SectionKind) {
  if (section === 'english') return 'English'
  if (section === 'reading') return isActExam.value ? 'Reading' : 'Reading and Writing'
  if (section === 'science') return 'Science'
  return isAbiturExam.value ? 'Mathematik' : isApExam.value ? 'AP Calculus BC' : isActExam.value ? 'Mathematics' : 'Math'
}
const sectionLabel = computed(() =>
  isAbiturExam.value
    ? currentModule.value.title
    : isActExam.value || isApExam.value || isDiagnostic.value
    ? `Section ${currentModule.value.sectionNumber}`
    : `Section ${currentModule.value.sectionNumber}, Module ${currentModule.value.moduleNumber}`,
)
const primaryActionLabel = computed(() => {
  if (stage.value !== 'review') return 'Next'
  if (moduleIndex.value === modules.value.length - 1) return isDiagnostic.value ? 'Submit Diagnostic' : 'Finish Test'
  return isActExam.value || isApExam.value || isAbiturExam.value || isDiagnostic.value ? 'Next Section' : 'Next'
})
const timeLabel = computed(() => formatTime(timeRemaining.value))
const displayedTimerLabel = computed(() => isDiagnostic.value ? formatTime(diagnosticElapsedSeconds.value) : timeLabel.value)
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
  const acceptedAnswers = source.answer.split(';').map(normalize).filter(Boolean)
  return acceptedAnswers.includes(normalize(responses[key]))
}

function topicFor(module: ModuleDefinition, number: number) {
  return sourceQuestionFor(module, number)?.domain ?? sectionName(module.section)
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

const moduleStats = computed(() =>
  modules.value.map((module) => {
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
  activeSectionKinds.value.map((section) => {
    const stats = moduleStats.value.filter((module) => module.section === section)
    const total = stats.reduce((sum, module) => sum + module.total, 0)
    const correct = stats.reduce((sum, module) => sum + module.correct, 0)
    const incorrect = stats.reduce((sum, module) => sum + module.incorrect, 0)
    const attempted = correct + incorrect
    const seconds = stats.reduce((sum, module) => sum + module.averageSeconds * module.attempted, 0)
    const satScoreRange = !isDiagnostic.value && examId.value === 1 && !isAbiturExam.value && !isApExam.value && !isActExam.value
      ? getSatPracticeTest10ScoreRange(section === 'math' ? 'math' : 'reading', correct)
      : null
    return {
      section,
      label: sectionName(section),
      total,
      correct,
      incorrect,
      omitted: total - attempted,
      attempted,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      averageSeconds: attempted ? Math.round(seconds / attempted) : 0,
      score: isAbiturExam.value
        ? abiturNotenpunkte((correct / Math.max(1, total)) * 100)
        : isApExam.value
        ? Math.max(1, Math.min(5, Math.round(1 + (correct / Math.max(1, total)) * 4)))
        : isActExam.value
        ? Math.max(1, Math.min(36, Math.round(1 + (correct / Math.max(1, total)) * 35)))
        : satScoreRange
        ? Math.round((satScoreRange.lower + satScoreRange.upper) / 20) * 10
        : 200 + Math.round(((correct / Math.max(1, total)) * 600) / 10) * 10,
      scoreRange: satScoreRange,
    }
  }),
)

const totalStats = computed(() => {
  const total = moduleStats.value.reduce((sum, module) => sum + module.total, 0)
  const correct = moduleStats.value.reduce((sum, module) => sum + module.correct, 0)
  const incorrect = moduleStats.value.reduce((sum, module) => sum + module.incorrect, 0)
  const attempted = correct + incorrect
  const satRanges = subjectStats.value.map((subject) => subject.scoreRange).filter((range): range is { lower: number; upper: number } => Boolean(range))
  return {
    total,
    correct,
    incorrect,
    unattempted: total - attempted,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    score: isAbiturExam.value
      ? subjectStats.value[0]?.score ?? 0
      : isApExam.value
      ? subjectStats.value[0]?.score ?? 1
      : isActExam.value
      ? Math.round(subjectStats.value.filter((subject) => ['english', 'math', 'reading'].includes(subject.section)).reduce((sum, subject) => sum + subject.score, 0) / 3)
      : subjectStats.value.reduce((sum, subject) => sum + subject.score, 0),
    scoreRange: satRanges.length === 2
      ? {
          lower: satRanges.reduce((sum, range) => sum + range.lower, 0),
          upper: satRanges.reduce((sum, range) => sum + range.upper, 0),
        }
      : null,
  }
})

const topicStats = computed(() => {
  const groups = new Map<string, { section: SectionKind; label: string; attempts: number; correct: number; seconds: number[] }>()
  for (const module of modules.value) {
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
  activeSectionKinds.value.map((section) => {
    const buckets = ['Easy', 'Medium', 'Hard'].map((label) => ({ label, seconds: [] as number[] }))
    modules.value
      .filter((module) => module.section === section)
      .forEach((module) => {
        for (let number = 1; number <= module.total; number += 1) {
          const key = `${module.id}-${number}`
          if (isAnsweredKey(key)) buckets[(number - 1) % 3].seconds.push(questionTimeSeconds[key] ?? 0)
        }
      })
    return {
      section,
      label: sectionName(section),
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
  if (failedStimulusVisuals.has(questionKey.value)) {
    showToast('Reload the figure before answering this question.')
    return
  }
  answers[questionKey.value] = index
}

function choiceLabel(index: number) {
  return currentQuestion.value.optionLabels[index] ?? String.fromCharCode(65 + index)
}

function setResponse(event: Event) {
  if (failedStimulusVisuals.has(questionKey.value)) {
    showToast('Reload the figure before answering this question.')
    return
  }
  responses[questionKey.value] = (event.target as HTMLInputElement).value
}

function toggleEliminated(index: number) {
  if (failedStimulusVisuals.has(questionKey.value)) return
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
  calculatorPoppedOut.value = false
  referenceOpen.value = false
  highlighterEnabled.value = false
}

function startModule(index: number) {
  moduleIndex.value = index
  currentNumber.value = 1
  timeRemaining.value = modules.value[index].duration
  stage.value = 'exam'
  navigatorOpen.value = false
  closeTransientTools()
}

function advanceFromReview() {
  const failedKey = [...failedStimulusVisuals].find((key) => key.startsWith(`${currentModule.value.id}-`))
  if (failedKey) {
    const failedQuestionNumber = Number(failedKey.slice(currentModule.value.id.length + 1))
    stage.value = 'exam'
    goToQuestion(failedQuestionNumber)
    showToast('A required figure did not load. Reload the page before submitting this section.')
    return
  }
  if (!isDiagnostic.value && ((isApExam.value && moduleIndex.value === 0) || (!isApExam.value && !isActExam.value && moduleIndex.value === 1))) {
    stage.value = 'break'
    navigatorOpen.value = false
    return
  }
  if (moduleIndex.value < modules.value.length - 1) startModule(moduleIndex.value + 1)
  else {
    navigatorOpen.value = false
    closeTransientTools()
    openPackageScoreReport()
  }
}

function resumeAfterBreak() {
  startModule(isApExam.value ? 1 : 2)
}

function restartExam() {
  Object.keys(answers).forEach((key) => delete answers[key])
  Object.keys(responses).forEach((key) => delete responses[key])
  Object.keys(eliminated).forEach((key) => delete eliminated[key])
  Object.keys(highlights).forEach((key) => delete highlights[key])
  Object.keys(questionTimeSeconds).forEach((key) => delete questionTimeSeconds[key])
  review.clear()
  eliminationMode.value = false
  moduleIndex.value = 0
  currentNumber.value = 1
  timeRemaining.value = modules.value[0].duration
  diagnosticElapsedSeconds.value = 0
  timerVisible.value = !isDiagnostic.value
  breakRemaining.value = isActExam.value ? 15 * 60 : 10 * 60
  lineReaderEnabled.value = false
  stage.value = 'exam'
  closeTransientTools()
}

function openResults() {
  openPackageScoreReport()
}

function openPackageScoreReport() {
  const access = route.query.access === 'member' ? 'member' : 'free'
  void router.push({
    name: 'package',
    query: isDiagnostic.value
      ? {
          access,
          tab: 'study',
          reportSource: 'diagnostic',
          diagnosticState: 'scoring',
          courseState: 'in-progress',
          ...examQuery.value,
        }
      : { access, tab: 'study', practiceState: 'scoring', courseState: 'in-progress', ...examQuery.value },
    hash: packageHash.value,
  })
}

function backToCompletion() {
  stage.value = 'complete'
  void nextTick(() => window.scrollTo({ top: 0 }))
}

function exitExam() {
  const access = route.query.access === 'member' ? 'member' : 'free'
  const submitted = stage.value === 'complete'
  void router.push({
    name: 'package',
    query: isDiagnostic.value
      ? {
          access,
          tab: 'study',
          reportSource: 'diagnostic',
          diagnosticState: submitted ? 'scoring' : 'in-progress',
          courseState: 'in-progress',
          ...examQuery.value,
        }
      : {
          access,
          tab: 'study',
          practiceState: submitted ? 'scoring' : 'in-progress',
          courseState: 'in-progress',
          ...examQuery.value,
        },
    hash: packageHash.value,
  })
}

function downloadReport() {
  window.print()
}

function toggleReview() {
  review.has(questionKey.value) ? review.delete(questionKey.value) : review.add(questionKey.value)
}

function toggleHighlightMode() {
  highlighterEnabled.value = !highlighterEnabled.value
}

function toggleCalculator() {
  calculatorOpen.value = !calculatorOpen.value
  if (!calculatorOpen.value) calculatorPoppedOut.value = false
  if (calculatorOpen.value) referenceOpen.value = false
  moreOpen.value = false
}

function toggleReference() {
  if (!showReferenceTool.value) return
  referenceOpen.value = !referenceOpen.value
  if (referenceOpen.value) {
    calculatorOpen.value = false
    calculatorPoppedOut.value = false
  }
  moreOpen.value = false
}

function toggleLineReader() {
  lineReaderEnabled.value = !lineReaderEnabled.value
  moreOpen.value = false
}

function moveLineReader(event: PointerEvent) {
  if (!lineReaderEnabled.value) return
  const panel = event.currentTarget as HTMLElement
  const rect = panel.getBoundingClientRect()
  lineReaderY.value = Math.max(8, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100))
}

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function showToolTooltip(event: Event, text: string, placement: ToolTooltipPlacement) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  const estimatedWidth = Math.min(window.innerWidth - 32, Math.max(220, text.length * 6.4 + 32))
  const halfWidth = estimatedWidth / 2
  const center = rect.left + rect.width / 2
  toolTooltip.text = text
  toolTooltip.placement = placement
  toolTooltip.x = Math.max(16 + halfWidth, Math.min(window.innerWidth - 16 - halfWidth, center))
  toolTooltip.y = placement === 'above' ? rect.top - 10 : rect.bottom + 10
  toolTooltip.arrowX = estimatedWidth / 2 + center - toolTooltip.x
  toolTooltip.visible = true
  void nextTick(() => {
    if (!toolTooltip.visible || toolTooltip.text !== text || !toolTooltipElement.value) return
    const width = toolTooltipElement.value.offsetWidth
    const clampedCenter = Math.max(16 + width / 2, Math.min(window.innerWidth - 16 - width / 2, center))
    toolTooltip.x = clampedCenter
    toolTooltip.arrowX = Math.max(13, Math.min(width - 13, width / 2 + center - clampedCenter))
  })
}

function hideToolTooltip() {
  toolTooltip.visible = false
}

async function toggleFullscreen() {
  moreOpen.value = false
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    showToast('Fullscreen is not available in this browser.')
  }
}

function openKeyboardShortcuts() {
  moreOpen.value = false
  shortcutsOpen.value = true
}

function openQuestionReport() {
  moreOpen.value = false
  reportIssue.value = 'Other issue'
  reportDetails.value = ''
  reportOpen.value = true
}

function submitQuestionReport() {
  reportOpen.value = false
  showToast('Thank you for helping us improve!')
}

function closeTransientTools() {
  calculatorOpen.value = false
  calculatorPoppedOut.value = false
  referenceOpen.value = false
  moreOpen.value = false
  highlighterEnabled.value = false
  hideToolTooltip()
}

function updateHighlights(value: TextHighlight[]) {
  highlights[questionKey.value] = value
}

function markStimulusVisualLoaded() {
  failedStimulusVisuals.delete(questionKey.value)
}

function markStimulusVisualFailed() {
  failedStimulusVisuals.add(questionKey.value)
  delete answers[questionKey.value]
  delete responses[questionKey.value]
  showToast('This figure could not be loaded. Reload the page before answering.')
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
    referenceOpen.value = false
    moreOpen.value = false
    shortcutsOpen.value = false
    reportOpen.value = false
    hideToolTooltip()
    return
  }
  if (event.key === '?' && !target?.closest('input, select, textarea, [contenteditable]')) {
    event.preventDefault()
    openKeyboardShortcuts()
    return
  }
  if (stage.value !== 'exam' || calculatorOpen.value || shortcutsOpen.value || reportOpen.value || target?.closest('button, input, select, textarea, [contenteditable], .user-highlight')) return

  const optionKey = event.key.toUpperCase()
  const labeledOptionIndex = currentQuestion.value.optionLabels.findIndex((label) => label.toUpperCase() === optionKey)
  const numericOptionIndex = Number(event.key) - 1
  const optionIndex = labeledOptionIndex >= 0 ? labeledOptionIndex : numericOptionIndex
  if (currentQuestion.value.options.length && optionIndex >= 0 && optionIndex < currentQuestion.value.options.length && event.altKey) {
    event.preventDefault()
    toggleEliminated(optionIndex)
    return
  }
  if (currentQuestion.value.options.length && optionIndex >= 0 && optionIndex < currentQuestion.value.options.length) {
    event.preventDefault()
    selectAnswer(optionIndex)
    return
  }
  if (currentQuestion.value.options.length && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    const selected = answers[questionKey.value]
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = selected == null
      ? (direction > 0 ? 0 : currentQuestion.value.options.length - 1)
      : Math.min(currentQuestion.value.options.length - 1, Math.max(0, selected + direction))
    selectAnswer(nextIndex)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    previousQuestion()
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    nextQuestion()
    return
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
    if (stage.value === 'exam' || stage.value === 'review') {
      if (isDiagnostic.value) diagnosticElapsedSeconds.value += 1
      else if (timeRemaining.value > 0) timeRemaining.value -= 1
    }
    if (stage.value === 'exam') questionTimeSeconds[questionKey.value] = (questionTimeSeconds[questionKey.value] ?? 0) + 1
    if (stage.value === 'break' && breakRemaining.value > 0) breakRemaining.value -= 1
  }, 1000)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', syncFullscreenState)
})

function syncFullscreenState() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

watch(darkMode, (enabled) => {
  document.body.classList.toggle('mock-exam-dark', enabled)
})

onBeforeUnmount(() => {
  document.body.classList.remove('mock-exam-route', 'mock-exam-dark')
  if (countdownId) window.clearInterval(countdownId)
  if (toastId) window.clearTimeout(toastId)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})
</script>

<template>
  <main v-if="examLoadError" class="completion-page">
    <section class="completion-card"><h1>Unable to load this practice test</h1><p>{{ examLoadError }}</p><button class="view-results-button" type="button" @click="exitExam">Back to {{ examName }} package</button></section>
  </main>

  <main v-else-if="!activeEpExam" class="completion-page">
    <section class="completion-card"><p>Loading {{ isDiagnostic ? `Free ${examName} Diagnostic Test` : `${examName} Full-Length Practice Test` }}…</p></section>
  </main>

  <main v-else-if="stage === 'break'" class="break-screen" :class="{ 'dark-mode': darkMode }">
    <button class="save-leave-button" type="button" @click="exitExam"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>Save and Leave</button>
    <div class="break-layout">
      <section class="break-timer-column">
        <div class="oneprep-wordmark">
          <img
            src="/assets/solvely-ai-logo.jpeg"
            alt=""
            width="34"
            height="34"
          />
          Solvely {{ examName }}
        </div>
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
    <div v-if="toastMessage" class="exam-toast break-toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else-if="stage === 'complete'" class="completion-page">
    <section class="completion-card">
      <button class="completion-back" type="button" @click="exitExam"><span aria-hidden="true">‹</span> Back to {{ examName }} package</button>
      <div class="completion-mark" aria-hidden="true">✓</div>
      <h1>Congratulations!</h1>
      <p>You've completed</p>
      <h2>{{ activeExam.title }}</h2>
      <p class="completion-encouragement">Great work — every completed test brings you one step closer to your best score.</p>
      <p class="completion-summary">{{ totalStats.total }} {{ isAbiturExam ? 'tasks' : 'questions' }} submitted · Your detailed results are being prepared.</p>
      <button class="view-results-button" type="button" @click="openResults">View Results</button>
    </section>
    <div v-if="toastMessage" class="exam-toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else-if="stage === 'results'" class="results-page">
    <article class="results-shell">
      <button class="report-back" type="button" @click="exitExam"><span aria-hidden="true">‹</span> Back to {{ examName }} package</button>

      <header class="report-title-row">
        <div class="report-title-copy">
          <span class="report-title-icon" aria-hidden="true"><i /><i /><i /></span>
          <div><h1>{{ activeExam.title }}</h1><p>All modules</p></div>
        </div>
        <div class="report-title-actions"><span>Completed on {{ completedDate }}</span><button type="button" @click="downloadReport"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v3h14v-3" /></svg>Download report</button></div>
      </header>

      <section class="report-disclaimer">
        <div class="report-brand-mark" aria-hidden="true">S</div>
        <div><h2>Practice score disclaimer</h2><p>{{ isAbiturExam ? 'This practice test follows an IQB-aligned cross-state eA blueprint. Its 0–15 Notenpunkte result is an estimate and not an official state Abitur grade.' : isActExam ? 'This practice test follows the current ACT structure with Science. Its score is an estimate and is not an official ACT score.' : examId === 1 && !isDiagnostic ? 'This result uses the College Board Practice Test 10 paper-version raw-score conversion table. Section and total scores are shown as ranges and are estimates, not official College Board scores.' : 'This practice test is calibrated to the current Digital SAT structure. Its score is an estimate and is not an official College Board score.' }}</p></div>
      </section>

      <section class="report-section" aria-labelledby="overview-title">
        <h2 id="overview-title" class="report-section-title"><span aria-hidden="true">◔</span>Overview</h2>
        <div class="analysis-banner"><div><strong>Your complete analysis is ready.</strong><span>Every number below reflects this practice session.</span></div><span class="analysis-banner-badge">{{ totalStats.total }} questions</span></div>
        <div class="score-grid">
          <div class="score-card total-score-card"><span>Estimated Total Score</span><strong>{{ totalStats.scoreRange ? `${totalStats.scoreRange.lower}–${totalStats.scoreRange.upper}` : totalStats.score }}</strong><small>400–1600</small><div class="subject-score-row"><div v-for="subject in subjectStats" :key="subject.section"><span>{{ subject.label }}</span><strong>{{ subject.scoreRange ? `${subject.scoreRange.lower}–${subject.scoreRange.upper}` : subject.score }}</strong><small>200–800</small></div></div></div>
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
    <div v-if="toastMessage" class="exam-toast" role="status">{{ toastMessage }}</div>
  </main>

  <main v-else class="exam-app" :class="{ 'review-stage': stage === 'review', 'dark-mode': darkMode }" :style="{ '--split': `${leftWidth}%` }">
    <header class="exam-header">
      <div class="header-left" aria-hidden="true" />
      <div class="timer-wrap">
        <span v-if="timerVisible" class="timer-value-row">
          <strong class="timer" :aria-label="isDiagnostic ? `Elapsed time ${displayedTimerLabel}` : `Time remaining ${displayedTimerLabel}`" aria-live="polite">{{ displayedTimerLabel }}</strong>
          <span v-if="isDiagnostic" class="timer-help" tabindex="0" aria-label="About the diagnostic timer">?<span class="timer-tooltip" role="tooltip">This untimed diagnostic tracks how long you have been working. The full-length practice test uses a countdown timer.</span></span>
        </span>
        <span v-else class="timer-placeholder">Timer hidden</span>
        <button class="timer-toggle" type="button" @click="timerVisible = !timerVisible">{{ timerVisible ? 'Hide' : 'Show' }}</button>
      </div>
      <div class="header-tools">
        <button class="tool-button" :class="{ active: highlighterEnabled }" type="button" :aria-pressed="highlighterEnabled" :aria-label="highlighterEnabled ? 'Turn off highlight mode' : 'Turn on highlight mode'" @mouseenter="showToolTooltip($event, 'Highlight and annotate text', 'below')" @mouseleave="hideToolTooltip" @focus="showToolTooltip($event, 'Highlight and annotate text', 'below')" @blur="hideToolTooltip" @click="toggleHighlightMode"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16 9.8-9.8a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19H5v-3Z" /><path d="M13.5 7.5 16.5 10.5M4 21h16" /></svg><span>Highlight</span></button>
        <button v-if="isActExam && usesPassageLayout" class="tool-button" :class="{ active: lineReaderEnabled }" type="button" :aria-pressed="lineReaderEnabled" :aria-label="lineReaderEnabled ? 'Turn off line reader' : 'Turn on line reader'" @mouseenter="showToolTooltip($event, 'Focus on one line of text at a time', 'below')" @mouseleave="hideToolTooltip" @focus="showToolTooltip($event, 'Focus on one line of text at a time', 'below')" @blur="hideToolTooltip" @click="toggleLineReader"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg><span>Line Reader</span></button>
        <button v-if="currentModule.section === 'math'" class="tool-button" :class="{ active: calculatorOpen }" type="button" :aria-pressed="calculatorOpen" @click="toggleCalculator"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M8.5 6h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01" /></svg><span>Calculator</span></button>
        <button v-if="showReferenceTool" class="tool-button" :class="{ active: referenceOpen }" type="button" :aria-pressed="referenceOpen" @click="toggleReference"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l3 3v15H7zM15 3v4h4M10 11h5M10 15h5" /></svg><span>Reference</span></button>
        <button class="tool-button" :class="{ active: moreOpen }" type="button" aria-haspopup="menu" :aria-expanded="moreOpen" @click="toggleMore"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg><span>More</span></button>
        <div v-if="moreOpen" class="exam-more-menu" role="menu" aria-label="More exam options">
          <button type="button" role="menuitem" @click="exitExam"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg><span>Save and Exit</span></button>
          <button type="button" role="menuitem" @click="toggleFullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /></svg><span>{{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}</span></button>
          <button type="button" role="menuitem" @click="openKeyboardShortcuts"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M6 10h1M10 10h1M14 10h1M18 10h.01M6 14h8M16 14h2" /></svg><span>Keyboard shortcuts</span></button>
          <button v-if="stage === 'exam'" type="button" role="menuitem" @click="openQuestionReport"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m1 1h11l-2.2 4L17 13H6" /></svg><span>Report an issue</span></button>
          <button type="button" role="menuitem" @click="darkMode = !darkMode; moreOpen = false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.2 8.2 0 1 0 20 15.5Z" /></svg><span>Switch to {{ darkMode ? 'light' : 'dark' }} mode</span></button>
        </div>
      </div>
    </header>

    <template v-if="stage === 'exam' && usesPassageLayout">
      <section class="exam-workspace">
        <article ref="passageScroller" class="passage-panel" :aria-label="`${currentModule.title} passage`" @pointermove="moveLineReader">
          <div class="passage-inner" :class="{ 'graph-question': currentQuestion.graph }">
            <header v-if="isActExam && (currentQuestion.passageTitle || currentQuestion.passageType)" class="act-passage-heading">
              <span>{{ currentQuestion.passageType }}</span>
              <h1>{{ currentQuestion.passageTitle }}</h1>
            </header>
            <img v-if="currentQuestion.pictureUrl && !failedStimulusVisuals.has(questionKey)" class="act-stimulus-image" :src="currentQuestion.pictureUrl" :alt="`${currentQuestion.passageTitle || currentModule.title} figure`" @load="markStimulusVisualLoaded" @error="markStimulusVisualFailed" />
            <div v-if="currentQuestion.pictureUrl && failedStimulusVisuals.has(questionKey)" class="stimulus-visual-error" role="alert"><strong>Figure unavailable</strong><span>Reload the page before answering this question.</span></div>
            <HighlightablePassage :key="questionKey" :text="currentQuestion.passage" :enabled="highlighterEnabled" :model-value="highlights[questionKey] ?? []" :reference-highlights="currentQuestion.referenceHighlights" :extra-class="currentQuestion.graph ? 'graph-copy' : ''" @update:model-value="updateHighlights" />
            <div v-if="lineReaderEnabled" class="line-reader-overlay" :style="{ '--line-y': `${lineReaderY}%` }" aria-hidden="true"><span /></div>
          </div>
        </article>
        <div class="splitter" role="separator" aria-orientation="vertical" :aria-valuenow="Math.round(leftWidth)" tabindex="0" @pointerdown="beginResize"><span><i /><i /><i /></span></div>
        <article ref="questionScroller" class="question-panel" aria-label="Answer choices"><div class="question-shell">
          <div class="question-toolbar"><span class="number-badge">{{ currentNumber }}</span><button class="review-button" :class="{ active: review.has(questionKey) }" type="button" @click="toggleReview"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2.5h12v17l-6-4-6 4v-17Z" /></svg>Mark for Review</button><button class="elimination-mode-button" :class="{ active: eliminationMode }" type="button" :aria-pressed="eliminationMode" :aria-label="eliminationMode ? 'Hide answer elimination controls' : 'Show answer elimination controls'" @mouseenter="showToolTooltip($event, 'Cross out answer choices you think are wrong', 'above')" @mouseleave="hideToolTooltip" @focus="showToolTooltip($event, 'Cross out answer choices you think are wrong', 'above')" @blur="hideToolTooltip" @click="toggleEliminationMode"><span aria-hidden="true">{{ eliminationBadge }}</span></button></div>
          <h1><MathText :text="currentQuestion.prompt" /></h1>
          <div class="choices" role="radiogroup" :aria-label="currentQuestion.prompt"><div v-for="(option, index) in currentQuestion.options" :key="`${questionKey}-${index}`" class="choice-row" :class="{ selected: answers[questionKey] === index, eliminated: eliminated[questionKey]?.has(index), 'elimination-mode': eliminationMode }"><button class="choice-card" type="button" role="radio" :aria-checked="answers[questionKey] === index" :disabled="failedStimulusVisuals.has(questionKey)" @click="selectAnswer(index)"><span class="choice-letter">{{ choiceLabel(index) }}</span><span class="choice-copy"><img v-if="currentQuestion.optionPictureUrls[index]" class="choice-option-image" :src="currentQuestion.optionPictureUrls[index]" :alt="`Answer choice ${choiceLabel(index)}`" /><MathText v-else :text="option" /></span></button><button v-if="eliminationMode" class="eliminate-button" type="button" :aria-label="`${eliminated[questionKey]?.has(index) ? 'Restore' : 'Cross out'} answer ${choiceLabel(index)}`" :aria-pressed="eliminated[questionKey]?.has(index) ?? false" :disabled="failedStimulusVisuals.has(questionKey)" @click="toggleEliminated(index)"><span>{{ choiceLabel(index) }}</span></button></div></div>
          <p class="keyboard-tip">Tip:&nbsp; press <kbd v-for="index in currentQuestion.options.length" :key="`passage-shortcut-${index}`">{{ index }}</kbd> to pick an answer, then <kbd class="enter-key">Enter</kbd> to go to the next question</p>
        </div></article>
      </section>
    </template>

    <template v-else-if="stage === 'exam' && currentModule.section === 'math'">
      <section class="math-workspace" :class="{ 'calculator-visible': calculatorOpen && !calculatorPoppedOut }">
        <div v-if="calculatorOpen" class="math-calculator-pane" :class="{ 'popped-out-host': calculatorPoppedOut }"><ScientificCalculator @close="calculatorOpen = false; calculatorPoppedOut = false" @popout-change="calculatorPoppedOut = $event" /></div><div v-if="calculatorOpen && !calculatorPoppedOut" class="math-splitter" aria-hidden="true"><span><i /><i /><i /></span></div>
        <article ref="questionScroller" class="math-question-panel" aria-label="Math question"><div class="math-question-shell" :class="{ 'diagram-question': currentQuestion.diagram }">
          <div class="question-toolbar"><span class="number-badge">{{ currentNumber }}</span><button class="review-button" :class="{ active: review.has(questionKey) }" type="button" @click="toggleReview"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2.5h12v17l-6-4-6 4v-17Z" /></svg>Mark for Review</button><button class="elimination-mode-button" :class="{ active: eliminationMode }" type="button" :aria-pressed="eliminationMode" :aria-label="eliminationMode ? 'Hide answer elimination controls' : 'Show answer elimination controls'" @mouseenter="showToolTooltip($event, 'Cross out answer choices you think are wrong', 'above')" @mouseleave="hideToolTooltip" @focus="showToolTooltip($event, 'Cross out answer choices you think are wrong', 'above')" @blur="hideToolTooltip" @click="toggleEliminationMode"><span aria-hidden="true">{{ eliminationBadge }}</span></button></div>
          <img v-if="currentQuestion.pictureUrl && !failedStimulusVisuals.has(questionKey)" class="math-stimulus-image" :src="currentQuestion.pictureUrl" :alt="`${currentQuestion.passageTitle || currentModule.title} figure`" @load="markStimulusVisualLoaded" @error="markStimulusVisualFailed" />
          <div v-if="(currentQuestion.pictureUrl || currentQuestion.optionPictureUrls.some(Boolean)) && failedStimulusVisuals.has(questionKey)" class="stimulus-visual-error" role="alert"><strong>Figure unavailable</strong><span>Reload the page before answering this question.</span></div>
          <figure v-if="currentQuestion.diagram" class="circle-diagram"><svg viewBox="0 0 620 560" role="img" aria-label="Circle with intersecting lines through O"><circle cx="310" cy="260" r="210" /><path d="M228 66 393 458M395 69 226 457" /><text x="201" y="67">S</text><text x="397" y="67">R</text><text x="198" y="489">P</text><text x="401" y="489">Q</text><text x="321" y="280">O</text></svg><figcaption>Note: Figure not drawn to scale.</figcaption></figure>
          <HighlightablePassage :key="questionKey" :text="currentQuestion.passage" :enabled="highlighterEnabled" :model-value="highlights[questionKey] ?? []" :reference-highlights="currentQuestion.referenceHighlights" extra-class="math-stem-copy" @update:model-value="updateHighlights" />
          <h1><MathText :text="currentQuestion.prompt" /></h1>
          <div v-if="currentQuestion.options.length" class="choices math-choices" role="radiogroup" :aria-label="currentQuestion.prompt"><div v-for="(option, index) in currentQuestion.options" :key="`${questionKey}-${index}`" class="choice-row" :class="{ selected: answers[questionKey] === index, eliminated: eliminated[questionKey]?.has(index), 'elimination-mode': eliminationMode }"><button class="choice-card" type="button" role="radio" :aria-checked="answers[questionKey] === index" :disabled="failedStimulusVisuals.has(questionKey)" @click="selectAnswer(index)"><span class="choice-letter">{{ choiceLabel(index) }}</span><span class="choice-copy"><img v-if="currentQuestion.optionPictureUrls[index]" class="choice-option-image" :src="currentQuestion.optionPictureUrls[index]" :alt="`Answer choice ${choiceLabel(index)}`" @load="markStimulusVisualLoaded" @error="markStimulusVisualFailed" /><MathText v-else :text="option" /></span></button><button v-if="eliminationMode" class="eliminate-button" type="button" :aria-label="`${eliminated[questionKey]?.has(index) ? 'Restore' : 'Cross out'} answer ${choiceLabel(index)}`" :aria-pressed="eliminated[questionKey]?.has(index) ?? false" :disabled="failedStimulusVisuals.has(questionKey)" @click="toggleEliminated(index)"><span>{{ choiceLabel(index) }}</span></button></div></div>
          <div v-else class="student-response-field">
            <label :for="`response-${questionKey}`">{{ isAbiturExam ? 'Written response' : 'Student-produced response' }}</label>
            <textarea v-if="isAbiturExam" :id="`response-${questionKey}`" :value="responses[questionKey] || ''" :disabled="failedStimulusVisuals.has(questionKey)" rows="8" placeholder="Schreiben Sie Ihren Lösungsweg und Ihre Begründung…" @input="setResponse" />
            <input v-else :id="`response-${questionKey}`" inputmode="decimal" :value="responses[questionKey] || ''" :disabled="failedStimulusVisuals.has(questionKey)" placeholder="Enter your answer" @input="setResponse" />
            <small>{{ isAbiturExam ? 'Show the relevant calculations, reasoning, and units.' : 'You may enter an integer, decimal, or fraction.' }}</small>
          </div>
          <p v-if="currentQuestion.options.length" class="keyboard-tip">Tip:&nbsp; press <kbd v-for="index in currentQuestion.options.length" :key="`math-shortcut-${index}`">{{ index }}</kbd> to pick an answer, then <kbd class="enter-key">Enter</kbd> to go to the next question</p>
        </div></article>
      </section>
    </template>

    <section v-else-if="stage === 'review'" class="review-page"><div class="review-shell">
      <h1>Check Your Work</h1>
      <p v-if="isDiagnostic">Review the {{ currentModule.total }} questions in this section. You can return to any question before moving on.</p>
      <p v-else-if="isActExam">On test day, you won't be able to return to this section after moving on.<br />For this practice test, click <strong>Next Section</strong> when you're ready.</p>
      <p v-else-if="isAbiturExam">Review all {{ currentModule.total }} tasks before submitting. Your written responses are saved as you work.</p>
      <p v-else>On test day, you won't be able to move on to the next module until time expires.<br />For these practice questions, you can click <strong>Next</strong> when you're ready to move on.</p>
      <section class="review-card" :aria-label="`${sectionLabel}: ${currentModule.title}`"><div class="review-card-header"><h2>{{ sectionLabel }}: {{ currentModule.title }}</h2><div class="review-legend"><span><i class="unanswered-key" />Unanswered</span><span><i class="review-key" />For Review</span></div></div><div class="review-grid"><button v-for="number in currentModule.total" :key="number" type="button" :class="{ answered: answeredNumbers.has(number), current: currentNumber === number, review: review.has(keyFor(number)) }" @click="stage = 'exam'; goToQuestion(number)">{{ number }}</button></div></section>
    </div></section>

    <footer class="exam-footer">
      <button class="question-count" type="button" :aria-expanded="navigatorOpen" @click="navigatorOpen = !navigatorOpen">{{ currentNumber }} of {{ currentModule.total }}<svg viewBox="0 0 18 18" aria-hidden="true"><path :d="navigatorOpen ? 'm4 11 5-5 5 5' : 'm4 7 5 5 5-5'" /></svg></button>
      <div v-if="navigatorOpen" class="navigator-card"><button class="navigator-close" type="button" aria-label="Close question navigator" @click="navigatorOpen = false">×</button><h2>{{ sectionLabel }}:<br />{{ currentModule.title }}</h2><div class="navigator-rule" /><div class="navigator-legend"><span><i class="unanswered-key" />Unanswered</span><span><i class="review-key" />For Review</span></div><div class="question-grid"><button v-for="number in currentModule.total" :key="number" type="button" :class="{ answered: answeredNumbers.has(number), current: currentNumber === number, review: review.has(keyFor(number)) }" @click="stage = 'exam'; goToQuestion(number)">{{ number }}</button></div></div>
      <div class="footer-actions"><button v-if="stage === 'review'" type="button" @click="previousQuestion">Back</button><button v-else type="button" :disabled="currentNumber <= 1" @click="previousQuestion">Previous</button><button type="button" @click="stage === 'review' ? advanceFromReview() : nextQuestion()">{{ primaryActionLabel }}</button></div>
    </footer>
    <PdfReferenceSheet
      v-if="referenceOpen && apReferenceSheet"
      :title="apReferenceSheet.title"
      :src="apReferenceSheet.src"
      @close="referenceOpen = false"
    />
    <MathReferenceSheet
      v-else-if="referenceOpen && !isAnyApExam && !isAbiturExam && currentModule.section === 'math'"
      @close="referenceOpen = false"
    />

    <div v-if="shortcutsOpen" class="exam-dialog-backdrop" role="presentation" @click.self="shortcutsOpen = false">
      <section class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-dialog-title">
        <header><h2 id="shortcut-dialog-title">Keyboard shortcuts</h2><button type="button" aria-label="Close keyboard shortcuts" @click="shortcutsOpen = false">×</button></header>
        <dl>
          <div><dt>Previous question</dt><dd><kbd>←</kbd></dd></div>
          <div><dt>Next question</dt><dd><kbd>→</kbd></dd></div>
          <div><dt>Select answer choice</dt><dd><kbd>{{ optionShortcutLabels }}</kbd><kbd>{{ optionShortcutRange }}</kbd></dd></div>
          <div><dt>Move selected choice</dt><dd><kbd>↑</kbd><kbd>↓</kbd></dd></div>
          <div><dt>Cross out answer choice</dt><dd><kbd>Alt / ⌥</kbd><span>+</span><kbd>{{ optionShortcutLabels }}</kbd><kbd>{{ optionShortcutRange }}</kbd></dd></div>
          <div><dt>Open keyboard shortcuts</dt><dd><kbd>?</kbd></dd></div>
        </dl>
      </section>
    </div>

    <div v-if="reportOpen" class="exam-dialog-backdrop" role="presentation" @click.self="reportOpen = false">
      <section class="question-report-dialog" role="dialog" aria-modal="true" aria-labelledby="question-report-title">
        <header><h2 id="question-report-title">Report an issue</h2><button type="button" aria-label="Close report form" @click="reportOpen = false">×</button></header>
        <label>
          <span>What went wrong?</span>
          <select v-model="reportIssue" autofocus>
            <option v-for="issue in reportIssues" :key="issue" :value="issue">{{ issue }}</option>
          </select>
        </label>
        <label>
          <span>Additional details <small>(optional)</small></span>
          <textarea v-model="reportDetails" rows="5" placeholder="Tell us what happened…" />
        </label>
        <footer><button type="button" @click="reportOpen = false">Cancel</button><button class="submit-report-button" type="button" @click="submitQuestionReport">Submit</button></footer>
      </section>
    </div>

    <div v-if="toastMessage" class="exam-toast" role="status">{{ toastMessage }}</div>
  </main>

  <Teleport to="body">
    <div v-if="toolTooltip.visible" ref="toolTooltipElement" class="exam-hover-tooltip" :class="`is-${toolTooltip.placement}`" :style="{ left: `${toolTooltip.x}px`, top: `${toolTooltip.y}px`, '--tooltip-arrow-x': `${toolTooltip.arrowX}px` }" role="tooltip">{{ toolTooltip.text }}</div>
  </Teleport>
</template>
