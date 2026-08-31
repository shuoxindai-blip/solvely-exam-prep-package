<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadEpExam, loadSatManifest } from '../data/satData'
import { buildReviewQuestions, buildSatReport } from '../data/satReport'
import { loadImprovePracticeProgress } from '../data/improvePracticeProgress'
import type { SatReportReviewQuestion } from '../data/satReport'
import type { EpExam } from '../types/epV2'
import type { SatManifest, SatTopic } from '../types/sat'

type CourseTab = 'overview' | 'study' | 'mock' | 'results'
type ResultView = 'score' | 'review' | 'improve'
type PracticeTestState = 'not-started' | 'in-progress' | 'scoring' | 'results'
type ReviewFilter = 'ALL' | 'INCORRECT' | 'CORRECT' | 'OMITTED'
type ReviewSectionFilter = 'ALL' | 'reading-writing' | 'math'
type Course = { family: string; label: string; title: string; topics: string; videos: string; questions: string; search: string }
type LastActivity =
  | { kind: 'learning'; examTitle: string; sectionTitle: string; itemTitle: string; resourceLabel: string; progressPercent: number; topicId: string }
  | { kind: 'exam'; examTitle: string; sectionTitle: string; itemTitle: string; moduleLabel: string; answered: number; total: number; examId: number }

const route = useRoute()
const router = useRouter()
const manifest = ref<SatManifest | null>(null)
const loadError = ref('')
const sidebarCollapsed = ref(false)
const activeTab = ref<CourseTab>('overview')
const searchQuery = ref('')
const familyFilter = ref('all')
const sectionFilter = ref<'Math' | 'Reading and Writing'>('Math')
const priorityFilter = ref('all')
const collapsedSections = ref(new Set<string>())
const resultExam = ref<EpExam | null>(null)
const resultLoadError = ref('')
const resultView = ref<ResultView>('score')
const reviewFilter = ref<ReviewFilter>('ALL')
const reviewSectionFilter = ref<ReviewSectionFilter>('ALL')
const selectedReviewQuestionId = ref<number | null>(null)
const improveSection = ref<'math' | 'reading-writing'>('math')
const improvePriority = ref<'ALL' | SatTopic['priority']>('ALL')
const improvePracticeProgress = ref<Record<string, number>>({})
const showLessonImportanceNote = ref(true)
const showImproveImportanceNote = ref(true)
const practiceTestState = ref<PracticeTestState>('in-progress')
const retakeDialog = ref<HTMLDialogElement | null>(null)
const lastActivity = ref<LastActivity>({ kind: 'learning', examTitle: 'SAT Prep 2026', sectionTitle: 'Advanced Math', itemTitle: 'Expansion, factoring, and completing the square', resourceLabel: 'Study Guide', progressPercent: 62, topicId: 'sat_math_advanced_equivalent_expressions_01' })
const isCourseOpen = computed(() => route.hash === '#course-0')
const isCourseStarted = computed(() => String(route.query.courseState || '') !== 'not-started')
const courseProgressPercent = computed(() => isCourseStarted.value ? 18 : 0)
const lastActivityDetail = computed(() => lastActivity.value.kind === 'learning'
  ? `${lastActivity.value.sectionTitle} · ${lastActivity.value.resourceLabel} · ${lastActivity.value.progressPercent}% complete`
  : `${lastActivity.value.sectionTitle} · ${lastActivity.value.moduleLabel} · ${lastActivity.value.answered} of ${lastActivity.value.total} answered`)
const lastActivityCta = computed(() => lastActivity.value.kind === 'learning' ? 'Continue learning' : 'Resume exam')

const resultReport = computed(() => resultExam.value ? buildSatReport(resultExam.value) : null)
const practiceTestStates: { id: PracticeTestState; label: string }[] = [
  { id: 'not-started', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'results', label: 'Results ready' },
]
const practiceTestCard = computed(() => {
  const report = resultReport.value
  const readingWritingScore = report?.sections.find((section) => section.sectionId === 'reading-writing')?.score ?? 650
  const mathScore = report?.sections.find((section) => section.sectionId === 'math')?.score ?? 630
  if (practiceTestState.value === 'not-started') return {
    stateLabel: 'Not started',
    description: 'Take a realistic full-length Digital SAT with the official section timing and module structure.',
    metrics: [{ value: '98', label: 'questions' }, { value: '134', label: 'min' }, { value: '4', label: 'modules' }],
    progressTitle: 'Progress', progressLabel: 'Ready to start', progressPercent: 0,
    helper: 'Your timer starts after setup', cta: 'Start Practice Test', disabled: false,
  }
  if (practiceTestState.value === 'scoring') return {
    stateLabel: 'Scoring',
    description: 'Your answers were submitted. We are preparing your score report and personalized recommendations.',
    metrics: [{ value: '98', label: 'answered' }, { value: '2h 09m', label: 'time used' }, { value: '4', label: 'modules' }],
    progressTitle: 'Status', progressLabel: 'Preparing score report', progressPercent: 36,
    helper: 'Usually ready in under a minute', cta: 'Scoring…', disabled: true,
  }
  if (practiceTestState.value === 'results') return {
    stateLabel: 'Results ready',
    description: 'Your score report is ready. Review your performance and practice the topics with the biggest opportunity.',
    metrics: [{ value: String(report?.totalScore ?? 1280), label: 'total score' }, { value: String(readingWritingScore), label: 'Reading & Writing' }, { value: String(mathScore), label: 'Math' }],
    progressTitle: 'Completed', progressLabel: report ? formatReportDate(report.completedAt) : 'Aug 21, 2026', progressPercent: 100,
    helper: `${report?.percentile ?? 70}th percentile`, cta: 'View Results', disabled: false,
  }
  return {
    stateLabel: 'In progress',
    description: 'Resume your saved attempt from Reading and Writing, Module 1.',
    metrics: [{ value: '98', label: 'questions' }, { value: '134', label: 'min' }, { value: '4', label: 'modules' }],
    progressTitle: 'Progress', progressLabel: '14 of 98 answered', progressPercent: 14.3,
    helper: 'Answers saved automatically', cta: 'Continue Practice Test', disabled: false,
  }
})
const reportQuestions = computed(() => resultExam.value && resultReport.value ? buildReviewQuestions(resultExam.value, resultReport.value) : [])
const confidenceTopics = computed(() => {
  const topicTitles = new Map((manifest.value?.topics ?? []).map((topic) => [topic.topicId, topic.title]))
  const groups = new Map<number, { topicId: number; sectionId: string; sectionTitle: string; domain: string; label: string; correct: number; attempts: number; total: number; omitted: number; seconds: number[] }>()
  reportQuestions.value.forEach((question) => {
    const group = groups.get(question.topicId) ?? {
      topicId: question.topicId,
      sectionId: question.sectionId,
      sectionTitle: question.sectionTitle,
      domain: question.contentDomain,
      label: topicTitles.get(question.topicId) ?? question.officialSkill,
      correct: 0,
      attempts: 0,
      total: 0,
      omitted: 0,
      seconds: [],
    }
    group.total += 1
    if (question.status === 'OMITTED') group.omitted += 1
    else {
      group.attempts += 1
      group.correct += question.status === 'CORRECT' ? 1 : 0
      if (question.timeSpentSeconds > 0) group.seconds.push(question.timeSpentSeconds)
    }
    groups.set(question.topicId, group)
  })
  return [...groups.values()].map((group) => {
    const section = resultReport.value?.sections.find((item) => item.sectionId === group.sectionId)
    const accuracy = group.attempts ? Math.round((group.correct / group.attempts) * 100) : 0
    const averageSeconds = group.seconds.length ? Math.round(group.seconds.reduce((sum, seconds) => sum + seconds, 0) / group.seconds.length) : 0
    const accuracyBenchmark = section?.accuracy ?? 75
    const timeBenchmark = section?.averageSeconds ?? 75
    const plottedSeconds = averageSeconds || timeBenchmark + 30
    const left = Math.min(93, Math.max(7, 50 + (plottedSeconds - timeBenchmark) * 1.8))
    const top = Math.min(92, Math.max(8, 50 + (accuracyBenchmark - accuracy) * 1.35))
    const highAccuracy = accuracy >= accuracyBenchmark
    const fastPace = averageSeconds > 0 && averageSeconds <= timeBenchmark
    return {
      ...group,
      accuracy,
      averageSeconds,
      left,
      top,
      quadrant: highAccuracy ? (fastPace ? 'proficient' : 'inefficient') : (fastPace ? 'careless' : 'struggling'),
      edgeRight: left > 72,
      edgeBottom: top > 72,
    }
  })
})
const sectionReviewQuestions = computed(() => reportQuestions.value.filter((question) => reviewSectionFilter.value === 'ALL' || question.sectionId === reviewSectionFilter.value))
const filteredReviewQuestions = computed(() => sectionReviewQuestions.value.filter((question) => reviewFilter.value === 'ALL' || question.status === reviewFilter.value))
const selectedReviewQuestion = computed(() => filteredReviewQuestions.value.find((question) => question.questionId === selectedReviewQuestionId.value) ?? filteredReviewQuestions.value[0] ?? null)
const selectedReviewQuestionPosition = computed(() => selectedReviewQuestion.value ? filteredReviewQuestions.value.findIndex((question) => question.questionId === selectedReviewQuestion.value?.questionId) : -1)
const reviewQuestionGroups = computed(() => {
  const groups = new Map<string, { key: string; sectionTitle: string; module: string; route: string; questions: SatReportReviewQuestion[] }>()
  filteredReviewQuestions.value.forEach((question) => {
    const key = `${question.sectionId}|${question.module}|${question.route}`
    const group = groups.get(key) ?? { key, sectionTitle: question.sectionTitle, module: question.module, route: question.route, questions: [] }
    group.questions.push(question)
    groups.set(key, group)
  })
  return [...groups.values()]
})
const improveTopics = computed(() => {
  if (!manifest.value || !resultExam.value || !resultReport.value) return []
  const resultByQuestionId = new Map(resultReport.value.questions.map((question) => [question.questionId, question]))
  return manifest.value.topics.map((topic) => {
    const questions = resultExam.value?.questions.filter((question) => question.topicId === topic.topicId) ?? []
    const results = questions.map((question) => resultByQuestionId.get(question.id)).filter(Boolean)
    const correct = results.filter((result) => result?.status === 'CORRECT').length
    const incorrect = results.filter((result) => result?.status === 'INCORRECT').length
    const omitted = results.filter((result) => result?.status === 'OMITTED').length
    const attempts = correct + incorrect
    const missed = incorrect + omitted
    const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0
    const averageSeconds = attempts ? Math.round(results.reduce((sum, result) => sum + (result?.timeSpentSeconds ?? 0), 0) / attempts) : 0
    return {
      ...topic,
      sectionId: topic.section === 'Math' ? 'math' as const : 'reading-writing' as const,
      contentDomain: topic.domain,
      description: topic.summary,
      accuracy,
      attempts,
      averageSeconds,
      missed,
      opportunityScore: Math.round(topic.importanceScore * (missed / Math.max(1, results.length))),
    }
  }).filter((topic) => topic.missed > 0).sort((left, right) => right.opportunityScore - left.opportunityScore || right.importanceScore - left.importanceScore)
})
const improveTopicSections = computed(() => {
  const topics = improveTopics.value.filter((topic) => topic.sectionId === improveSection.value && (improvePriority.value === 'ALL' || topic.priority === improvePriority.value))
  if (improvePriority.value !== 'ALL') return topics.length ? [{ id: `${improveSection.value}-${improvePriority.value}`, title: '', examSection: '', topics }] : []
  return [...new Set(topics.map((topic) => topic.contentDomain))].map((contentDomain) => ({
    id: `${improveSection.value}-${contentDomain}`,
    title: contentDomain,
    examSection: improveSection.value === 'math' ? 'Math' : 'Reading & Writing',
    topics: topics.filter((topic) => topic.contentDomain === contentDomain),
  }))
})

const courses: Course[] = [
  { family: 'sat', label: 'SAT', title: 'SAT Prep 2026', topics: '100', videos: '100', questions: '3,879', search: 'digital college admissions math reading writing' },
  { family: 'act', label: 'ACT', title: 'ACT Prep 2026', topics: '230+', videos: '230+', questions: '6,600+', search: 'college admissions english math reading science' },
  { family: 'ap', label: 'AP', title: 'AP Calculus AB', topics: '42+', videos: '42+', questions: '1,200+', search: 'advanced placement math calculus' },
  { family: 'ap', label: 'AP', title: 'AP Biology', topics: '55+', videos: '55+', questions: '1,600+', search: 'advanced placement biology science' },
  { family: 'ap', label: 'AP', title: 'AP United States History', topics: '45+', videos: '45+', questions: '1,400+', search: 'advanced placement us history' },
  { family: 'ap', label: 'AP', title: 'AP World History: Modern', topics: '42+', videos: '42+', questions: '1,300+', search: 'advanced placement world history modern' },
  { family: 'ap', label: 'AP', title: 'AP Psychology', topics: '40+', videos: '40+', questions: '1,200+', search: 'advanced placement psychology' },
  { family: 'ap', label: 'AP', title: 'AP Chemistry', topics: '50+', videos: '50+', questions: '1,500+', search: 'advanced placement chemistry science' },
  { family: 'ap', label: 'AP', title: 'AP Statistics', topics: '38+', videos: '38+', questions: '1,100+', search: 'advanced placement statistics math data' },
  { family: 'ap', label: 'AP', title: 'AP Human Geography', topics: '35+', videos: '35+', questions: '1,000+', search: 'advanced placement human geography' },
  { family: 'ap', label: 'AP', title: 'AP English Language and Composition', topics: '32+', videos: '32+', questions: '900+', search: 'advanced placement english language composition' },
  { family: 'ap', label: 'AP', title: 'AP Computer Science A', topics: '40+', videos: '40+', questions: '1,000+', search: 'advanced placement computer science programming' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Deutsch', topics: '26', videos: '26', questions: '1,100+', search: 'german deutsch germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Mathematik', topics: '32', videos: '32', questions: '1,200+', search: 'german mathematik mathematics math germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Englisch', topics: '24', videos: '24', questions: '950+', search: 'german englisch english germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Französisch', topics: '21', videos: '21', questions: '850+', search: 'german french französisch germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Biologie', topics: '25', videos: '25', questions: '1,100+', search: 'german biology biologie germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Chemie', topics: '22', videos: '22', questions: '950+', search: 'german chemistry chemie germany' },
  { family: 'abitur', label: 'ABITUR', title: 'Abitur Physik', topics: '20', videos: '20', questions: '850+', search: 'german physics physik germany' },
]

const filteredCourses = computed(() => {
  const terms = searchQuery.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return courses.filter((course) => {
    const haystack = `${course.title} ${course.search}`.toLowerCase()
    return (familyFilter.value === 'all' || course.family === familyFilter.value) && terms.every((term) => haystack.includes(term))
  })
})

const topicsBySection = computed(() => {
  if (!manifest.value) return []
  const byId = new Map(manifest.value.topics.map((topic) => [topic.id, topic]))
  const sections = manifest.value.sections
    .map((section) => ({ ...section, topics: section.topicIds.map((id) => byId.get(id)).filter(Boolean) as SatTopic[] }))
    .filter((section) => section.examSection === sectionFilter.value)
  if (priorityFilter.value === 'all') return sections.filter((section) => section.topics.length)
  const topics = sections
    .flatMap((section) => section.topics)
    .filter((topic) => topic.priority.toLowerCase() === priorityFilter.value)
    .sort((left, right) => right.importanceScore - left.importanceScore || right.mappedQuestionCount - left.mappedQuestionCount || left.order - right.order)
  return [{ id: `importance-${sectionFilter.value}-${priorityFilter.value}`, examSection: sectionFilter.value, title: '', topics }]
})

function topicProgress(topic: SatTopic) {
  if (topic.order <= 46) return 100
  if (topic.order <= 52) return topic.order === 50 ? 62 : topic.order % 2 ? 33 : 67
  return 0
}

function topicProgressLabel(topic: SatTopic) {
  const progress = topicProgress(topic)
  if (progress === 100) return '3 of 3 tools complete'
  if (progress > 0) return progress > 50 ? '2 of 3 tools complete' : '1 of 3 tools complete'
  return '0 of 3 tools complete'
}

function openCourse(course: Course) {
  if (course.family !== 'sat') return
  activeTab.value = 'overview'
  void router.push({ name: 'package', hash: '#course-0' })
}

function closeCourse() { void router.push({ name: 'package', hash: '#examCatalogTitle' }) }
function selectTab(tab: CourseTab) { activeTab.value = tab; window.scrollTo({ top: 0, behavior: 'smooth' }) }
function toggleSection(id: string) { const next = new Set(collapsedSections.value); next.has(id) ? next.delete(id) : next.add(id); collapsedSections.value = next }
function openTopic(topic: SatTopic, tool: 'study-guide' | 'flashcards' | 'quiz') { void router.push({ name: tool, params: { topicId: topic.id } }) }
function improveAnswered(topic: SatTopic) { return Math.min(topic.quizCount, Math.max(0, improvePracticeProgress.value[topic.id] ?? 0)) }
function improvePracticeState(topic: SatTopic) {
  const answered = improveAnswered(topic)
  return answered >= topic.quizCount ? 'review' : answered > 0 ? 'continue' : 'practice'
}
function improvePracticeLabel(topic: SatTopic) {
  const state = improvePracticeState(topic)
  return state === 'review' ? 'Review' : state === 'continue' ? 'Continue' : 'Practice'
}
function openImprovePractice(topic: SatTopic) { void router.push({ name: 'quiz', params: { topicId: topic.id }, query: { source: 'improve' } }) }
function dismissImportanceNote(note: 'lessons' | 'improve') {
  if (note === 'lessons') showLessonImportanceNote.value = false
  else showImproveImportanceNote.value = false
  try { window.localStorage.setItem(`solvely:sat:${note}-importance-note-dismissed`, '1') }
  catch { /* The notice still closes when browser storage is unavailable. */ }
}
function resumeLastActivity() {
  if (lastActivity.value.kind === 'learning') void router.push({ name: 'study-guide', params: { topicId: lastActivity.value.topicId } })
  else startMockExam(lastActivity.value.examId)
}
function continueOverviewStudy() { void router.push({ name: 'study-guide', params: { topicId: 'sat_math_algebra_systems_linear_01' } }) }
function startCourseLearning() { void router.push({ name: 'study-guide', params: { topicId: 'sat_math_algebra_systems_linear_01' } }) }
function startMockExam(examId: number) { void router.push({ name: 'mock-exam', params: { examId } }) }
function requestRetake() {
  if (retakeDialog.value && !retakeDialog.value.open) retakeDialog.value.showModal()
}
function closeRetakeConfirm() { retakeDialog.value?.close() }
function confirmRetake() {
  closeRetakeConfirm()
  practiceTestState.value = 'not-started'
  startMockExam(1)
}
function handlePracticeTestAction() {
  if (practiceTestState.value === 'scoring') return
  if (practiceTestState.value === 'results') {
    resultView.value = 'score'
    activeTab.value = 'results'
    void router.push({ name: 'package', query: { tab: 'results' }, hash: '#course-0' })
    return
  }
  startMockExam(1)
}
function toggleTheme() { document.body.classList.toggle('dark') }
function setResultView(view: ResultView) {
  resultView.value = view
  if (view === 'review' && selectedReviewQuestionId.value === null) selectedReviewQuestionId.value = reportQuestions.value[0]?.questionId ?? null
}
function setReviewFilter(filter: ReviewFilter) {
  reviewFilter.value = filter
  selectedReviewQuestionId.value = null
}
function setReviewSectionFilter(filter: ReviewSectionFilter) {
  reviewSectionFilter.value = filter
  selectedReviewQuestionId.value = null
}
function moveReviewQuestion(direction: -1 | 1) {
  if (!filteredReviewQuestions.value.length) return
  const current = Math.max(0, selectedReviewQuestionPosition.value)
  const next = Math.min(filteredReviewQuestions.value.length - 1, Math.max(0, current + direction))
  selectedReviewQuestionId.value = filteredReviewQuestions.value[next]?.questionId ?? null
}
function reviewTopic(question: SatReportReviewQuestion) { return manifest.value?.topics.find((topic) => topic.topicId === question.topicId) ?? null }
function reviewTopicTitle(question: SatReportReviewQuestion) { return reviewTopic(question)?.title ?? question.officialSkill }
function practiceReviewQuestion(question: SatReportReviewQuestion) {
  const topic = reviewTopic(question)
  if (topic) void router.push({ name: 'quiz', params: { topicId: topic.id } })
}
function optionEntries(question: SatReportReviewQuestion) { return Object.entries(question.options).sort(([left], [right]) => left.localeCompare(right)) }
function optionState(question: SatReportReviewQuestion, answer: string) {
  if (answer === question.correctAnswer) return 'correct'
  if (answer === question.userAnswer && question.status === 'INCORRECT') return 'incorrect'
  return 'neutral'
}
function formatReportTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}
function formatReportDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}
function formatReportDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function reviewStatusLabel(status: ReviewFilter) { return status === 'OMITTED' ? 'Unanswered' : status.charAt(0) + status.slice(1).toLowerCase() }
function priorityLabel(priority: SatTopic['priority']) { return priority.charAt(0) + priority.slice(1).toLowerCase() }

function syncTabFromRoute() {
  const requestedTab = String(route.query.tab || '')
  activeTab.value = requestedTab === 'study' || requestedTab === 'mock' || requestedTab === 'results' ? requestedTab : 'overview'
  if (activeTab.value === 'results') {
    const requestedView = String(route.query.view || '')
    resultView.value = requestedView === 'review' || requestedView === 'improve' ? requestedView : 'score'
  }
}

watch([() => route.hash, () => route.query.tab, () => route.query.view], () => {
  if (route.hash === '#course-0') syncTabFromRoute()
  else activeTab.value = 'overview'
})

onMounted(async () => {
  document.body.classList.add('package-route')
  syncTabFromRoute()
  try {
    showLessonImportanceNote.value = window.localStorage.getItem('solvely:sat:lessons-importance-note-dismissed') !== '1'
    showImproveImportanceNote.value = window.localStorage.getItem('solvely:sat:improve-importance-note-dismissed') !== '1'
  } catch { /* Keep both notices visible when browser storage is unavailable. */ }
  improvePracticeProgress.value = loadImprovePracticeProgress()
  try { manifest.value = await loadSatManifest() }
  catch (error) { loadError.value = error instanceof Error ? error.message : 'Unable to load SAT materials.' }
  try { resultExam.value = await loadEpExam(1) }
  catch (error) { resultLoadError.value = error instanceof Error ? error.message : 'Unable to load the SAT score report.' }
})

onBeforeUnmount(() => document.body.classList.remove('package-route', 'dark'))
</script>

<template>
  <svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">
    <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></symbol>
    <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z"/></symbol>
    <symbol id="i-mic" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></symbol>
    <symbol id="i-wand" viewBox="0 0 24 24"><path d="m15 4 5 5L8 21l-5-5zM6 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></symbol>
    <symbol id="i-exam" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 8h8M8 12h4M16 14l2 2M18 14l-2 2"/></symbol>
    <symbol id="i-game" viewBox="0 0 24 24"><path d="M7 8h10a5 5 0 0 1 4.6 6.9l-1.2 3a2.5 2.5 0 0 1-4.1.8L14.8 17H9.2l-1.5 1.7a2.5 2.5 0 0 1-4.1-.8l-1.2-3A5 5 0 0 1 7 8Z"/><path d="M7 12v4M5 14h4M16 13h.01M19 15h.01"/></symbol>
    <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M18 14v8M14 18h8"/></symbol>
    <symbol id="i-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
    <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 16.5A9 9 0 0 1 7.5 4 8 8 0 1 0 20 16.5Z"/></symbol>
    <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></symbol>
    <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V5M16 20v-8M22 20H2"/></symbol>
    <symbol id="i-spark" viewBox="0 0 24 24"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></symbol>
    <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></symbol>
    <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 2-2 6 6"/></symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
  </svg>

  <div :class="['app', 'solvely-home-app', { 'sidebar-collapsed': sidebarCollapsed }]">
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-row"><div class="brand-mark"><img class="brand-logo" src="/assets/solvely-ai-logo.jpeg" alt="" width="26" height="26" /></div><div class="brand">Solvely.ai</div><button class="sidebar-collapse" type="button" aria-label="Collapse sidebar" @click="sidebarCollapsed = true"><svg class="icon icon-sm" viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/><path d="M9 5v14M14.5 8.5 11 12l3.5 3.5"/></svg></button></div>
      <nav class="sidebar-nav">
        <button class="nav-button active" type="button"><svg class="icon"><use href="#i-home"/></svg><span class="nav-label">Home</span></button>
        <button class="nav-button" type="button" aria-disabled="true"><svg class="icon"><use href="#i-book"/></svg><span class="nav-label">AI Study</span></button>
        <button class="nav-button" type="button" aria-disabled="true"><svg class="icon"><use href="#i-mic"/></svg><span class="nav-label">AI Live Notes</span></button>
        <button class="nav-button" type="button" aria-disabled="true"><svg class="icon"><use href="#i-wand"/></svg><span class="nav-label">AI Writing Tools</span></button>
        <button class="nav-button" type="button" aria-disabled="true"><svg class="icon"><use href="#i-exam"/></svg><span class="nav-label">Exam Predictor</span></button>
        <button class="nav-button" type="button" aria-disabled="true"><svg class="icon"><use href="#i-game"/></svg><span class="nav-label">Mini Games</span></button>
      </nav>
      <div class="sidebar-spacer" />
      <div class="side-meta"><section class="app-download-card" aria-label="Download the Solvely app"><div class="app-store-links"><span class="app-store-entry"><a class="app-store-link apple-store" href="https://apps.apple.com/us/app/solvely-ai-study-tools/id6446930976" target="_blank" rel="noopener"><img src="/assets/download-on-app-store.svg" alt="Download on the App Store" width="96" height="32" /></a></span><span class="app-store-entry"><a class="app-store-link google-play" href="https://play.google.com/store/apps/details?id=com.solvely.photo.math.solver.calculator.ai" target="_blank" rel="noopener"><img src="/assets/get-it-on-google-play-trimmed.png" alt="Get it on Google Play" width="107" height="32" /></a></span></div><span class="app-qr-popover" role="tooltip"><img src="/assets/solvely-mobile-qr.svg" alt="" width="132" height="132" /><small>Scan to download Solvely</small></span></section><button class="upgrade" type="button" aria-disabled="true"><span class="discount">57%<br>OFF</span><span class="upgrade-label">⬆ Upgrade</span></button><div class="user-row"><div class="avatar"><svg class="icon icon-sm"><use href="#i-user"/></svg></div><span class="user-name">Anna</span><button class="theme-toggle" type="button" aria-label="Toggle dark mode" @click="toggleTheme"><svg class="icon"><use href="#i-moon"/></svg></button></div></div>
    </aside>

    <main>
      <div v-if="!isCourseOpen" class="extension-entry" aria-label="Solvely Chrome extension"><a class="extension-cta" href="https://chromewebstore.google.com/detail/aedglnfjjccpifohekdeoogffomjcikm" target="_blank" rel="noopener"><svg class="extension-browser-icon" viewBox="0 0 24 24"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z"/></svg><span>Get the Chrome Extension</span><span class="extension-tooltip">Solve anywhere on the web</span></a></div>
      <button v-if="!isCourseOpen" class="history-entry" type="button" aria-disabled="true"><svg class="icon"><use href="#i-history"/></svg><span>History</span></button>

      <div v-if="!isCourseOpen" class="workspace">
        <header class="hero"><h1>Solvely: Your AI Study Companion</h1><div class="workspace-mode-switch" role="tablist" aria-label="Choose workspace mode"><button class="workspace-mode-button" type="button" role="tab" aria-selected="false" aria-disabled="true"><svg class="icon"><use href="#i-book"/></svg><span>Study</span></button><button class="workspace-mode-button" type="button" role="tab" aria-selected="true"><svg class="icon"><use href="#i-target"/></svg><span>Exam Prep</span></button><button class="workspace-mode-button" type="button" role="tab" aria-selected="false" aria-disabled="true"><svg class="icon"><use href="#i-wand"/></svg><span>Writing</span></button></div></header>
        <section class="composer-shell" aria-label="Solvely learning composer"><div class="composer-input-wrap"><textarea class="composer-input" aria-label="Tell Solvely what you want to learn" placeholder="Choose an exam or describe what you are preparing for" /></div><div class="composer-toolbar"><button class="tool-button" type="button" aria-label="Attach files" aria-disabled="true"><svg class="icon"><use href="#i-upload"/></svg></button><button class="tool-button" type="button" aria-label="Upload images" aria-disabled="true"><svg class="icon"><use href="#i-image"/></svg></button><span class="toolbar-spacer"/><button class="send-button" type="button" disabled><svg class="icon"><use href="#i-spark"/></svg><span>Create plan</span></button></div></section>

        <section class="examples-section" aria-label="Exam prep examples"><div class="examples-heading"><div class="examples-copy"><h2>Exam prep plan</h2></div><p class="examples-description">Plan, practice, and track your exam progress.</p></div><div class="examples-grid four-up">
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Plan</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Daily study plan</h3><div class="example-preview exam-feature-visual exam-plan-visual"><section class="exam-visual-panel"><header class="exam-plan-header"><div><strong>Study Plan</strong><span class="exam-plan-meta">Exam: Aug 31, 2026<i/>6-day plan</span></div></header><div class="exam-plan-calendar"><span v-for="(day, index) in ['24','25','26','27','28','29','30']" :key="day" :class="['exam-plan-day',{ active:index===1 }]"><b>{{ day }}</b></span></div><div class="exam-plan-task-area"><div class="exam-plan-task-head"><span>6 days until exam</span><span>3 tasks</span></div><div class="exam-plan-task"><span class="exam-plan-check"/><span>Model Selection</span></div><div class="exam-plan-task done"><span class="exam-plan-check">✓</span><span>Stationarity Testing</span></div></div></section></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Review</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Core topics</h3><div class="example-preview exam-feature-visual exam-topics-visual"><div class="exam-topics-table"><div class="exam-topics-head"><span>Topic</span><span>Likelihood</span><span>Mastery</span></div><div v-for="(topicName,index) in ['Model Selection','Stationarity Testing','ARIMA Modeling','SARIMA Modeling','Dynamic Regression']" :key="topicName" class="exam-topic-row"><span>{{ topicName }}</span><strong class="exam-likelihood">{{ 98-index*2 }}%</strong><span class="exam-mastery"><strong>{{ index ? 0 : 30 }}%</strong><span class="exam-mastery-track"><i :style="{width:index ? '0%' : '30%'}"/></span></span></div></div></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Practice</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Mock exams</h3><div class="example-preview exam-feature-visual exam-mock-visual"><div class="exam-mock-visual-grid"><section v-for="exam in 2" :key="exam" class="exam-mock-visual-card"><span class="exam-mock-visual-icon"><svg class="icon"><use :href="exam === 1 ? '#i-target' : '#i-spark'"/></svg></span><div class="exam-mock-title-row"><strong>Mock Exam {{ exam }}</strong><span class="exam-mock-badge">{{ exam === 1 ? '≥90% likely' : '80–90% likely' }}</span></div><p>The must-know questions. Nail these first</p><p class="exam-mock-meta">34 mins · 25 Questions</p><span class="exam-mock-state">Not started</span><span class="exam-mock-button">Start exam →</span></section></div></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Assess</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Progress tracking</h3><div class="example-preview exam-feature-visual exam-result-shell"><div class="exam-result-progress"><i/></div><section class="exam-result-summary"><h4>FINAL Exam: Biology 101</h4><div class="exam-result-stats"><span>Points: <strong>21 / 26</strong></span><span>Percentage: <strong>81%</strong></span></div><div class="exam-result-analysis"><strong>Final exam analysis</strong><span>You demonstrated strong understanding of cell structure, genetics, and ecology.</span></div></section><section class="exam-result-question"><small>Multiple Choice · 1/26</small><h5>Where does the electron transport chain occur?</h5><div class="exam-result-answer wrong">A. Cytoplasm</div><div class="exam-result-answer correct">D. Inner mitochondrial membrane</div></section></div></button>
        </div></section>

        <section class="exam-catalog" aria-labelledby="examCatalogTitle"><div class="exam-catalog-heading"><div><h2 id="examCatalogTitle">Standardized test courses</h2></div><p>Topic study, mock exams, results, and targeted improvement.</p></div><section class="diagnostic-entry jump-back-entry" aria-labelledby="jumpBackTitle"><div class="diagnostic-entry-copy"><div class="diagnostic-entry-meta"><span>JUMP BACK IN</span><span>{{ lastActivity.examTitle }}</span></div><h3 id="jumpBackTitle">{{ lastActivity.itemTitle }}</h3><p>{{ lastActivityDetail }}</p></div><button class="diagnostic-entry-button" type="button" @click="resumeLastActivity">{{ lastActivityCta }}</button></section><div class="exam-catalog-toolbar"><label class="exam-search-wrap"><svg class="icon"><use href="#i-search"/></svg><input v-model="searchQuery" aria-label="Search standardized exam courses" placeholder="Search SAT, ACT, AP, Abitur..." /></label><label class="exam-filter-wrap"><span class="sr-only">Filter exam packages</span><select v-model="familyFilter" aria-label="Filter exam packages"><option value="all">All courses</option><option value="sat">SAT</option><option value="act">ACT</option><option value="ap">AP</option><option value="abitur">Abitur</option></select><svg class="icon"><use href="#i-chevron"/></svg></label></div><div class="course-grid" aria-label="Pre-made exam courses"><button v-for="course in filteredCourses" :key="course.title" :class="['course-card',{ 'sample-course':course.family !== 'sat' }]" type="button" :disabled="course.family !== 'sat'" :aria-label="course.family === 'sat' ? `Open ${course.title} course` : `${course.title} sample unavailable`" @click="openCourse(course)"><span class="course-family">{{ course.label }}</span><h3>{{ course.title }}</h3><p>{{ course.topics }} topics · {{ course.videos }} video lessons<br>{{ course.questions }} practice questions</p><span class="course-stats"><span>Full test</span><span>Score insights</span></span></button></div><p v-if="!filteredCourses.length" class="course-empty">No matching courses. Try another exam name.</p></section>
      </div>

      <section v-else class="course-workspace" aria-labelledby="courseWorkspaceTitle">
        <header class="course-package-hero">
          <div class="course-package-hero-inner">
          <span class="course-package-art" aria-hidden="true"><i/><i/><i/></span>
          <button class="course-back" type="button" @click="closeCourse"><svg class="icon"><use href="#i-chevron"/></svg><span>Back to courses</span></button>
          <div class="course-package-hero-main">
            <div class="course-package-copy">
              <h1 id="courseWorkspaceTitle">SAT Prep 2026</h1>
              <p>A focused SAT Prep 2026 plan with topic study tools, realistic mock exams, score reports, and targeted improvement.</p>
            </div>
            <aside class="course-progress-summary" aria-label="Course progress">
              <span class="course-progress-watermark" aria-hidden="true">{{ courseProgressPercent }}</span>
              <div class="course-progress-value"><strong>{{ courseProgressPercent }}%</strong><span>Course Progress</span></div>
              <div class="course-progress-track" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="courseProgressPercent"><i :style="{ width: `${courseProgressPercent}%` }"/></div>
            </aside>
          </div>
          <nav class="course-package-tabs" role="tablist" aria-label="Course sections"><button v-for="tab in ([['overview','Overview'],['study','Lessons'],['mock','Practice Tests'],['results','Results & Improve']] as [CourseTab,string][])" :key="tab[0]" class="course-package-tab" type="button" role="tab" :aria-selected="activeTab === tab[0]" @click="selectTab(tab[0])">{{ tab[1] }}</button></nav>
          </div>
        </header>
        <div class="course-workspace-body">
          <div class="course-package-panel" role="tabpanel" aria-live="polite">
          <div v-if="activeTab === 'overview'" class="course-overview-layout">
            <div class="course-overview-waterfall">
            <ol v-if="!isCourseStarted" class="course-start-path" aria-label="Your SAT prep path">
              <li class="course-start-step featured">
                <span class="course-start-number" aria-hidden="true">1</span>
                <div class="course-start-copy">
                  <span class="course-start-label">Lessons</span>
                  <h2>Learn With 100 Video Lessons</h2>
                  <p>Each topic pairs a video and written study guide with an exit-ticket check, plus flashcards and a quiz.</p>
                  <div class="course-start-tags" aria-label="Lesson tools"><span>Video Lesson</span><span>Study Guide</span><span>Exit Ticket</span><span>Flashcards</span><span>Topic Quiz</span></div>
                </div>
                <button class="course-start-action" type="button" @click="startCourseLearning">Start Learning</button>
              </li>
              <li class="course-start-step">
                <span class="course-start-number" aria-hidden="true">2</span>
                <div class="course-start-copy">
                  <span class="course-start-label">Practice Test</span>
                  <h2>Practice Like It’s Test Day</h2>
                  <p>Take one full-length practice test with the same timing, section order, and module structure as the Digital SAT.</p>
                  <div class="course-start-tags" aria-label="Practice test details"><span>98 Questions</span><span>134 Minutes</span><span>4 Modules</span></div>
                </div>
              </li>
              <li class="course-start-step">
                <span class="course-start-number" aria-hidden="true">3</span>
                <div class="course-start-copy">
                  <span class="course-start-label">Results &amp; Improve</span>
                  <h2>Know What to Improve Next</h2>
                  <p>Get a detailed score report, see your strengths and weaknesses, and practice adaptively with Topics to Improve.</p>
                  <div class="course-start-tags" aria-label="Result tools"><span>Score Report</span><span>Strengths &amp; Weaknesses</span><span>Adaptive Practice</span></div>
                </div>
              </li>
            </ol>

            <section v-if="isCourseStarted" class="course-hub-card">
              <header class="course-hub-head"><div><h2>Jump back in</h2></div><button class="course-link-button" type="button" @click="selectTab('study')">View plan</button></header>
              <div class="course-next-task"><span class="course-next-icon"><svg class="icon"><use href="#i-book"/></svg></span><div class="course-next-copy"><strong>Linear equations &amp; systems</strong><span>Study Guide · Section 3 of 6</span></div><button class="course-primary-small" type="button" @click="continueOverviewStudy">Continue</button></div>
            </section>

            <section v-if="isCourseStarted" class="course-hub-card">
              <header class="course-hub-head"><div><h2>Topics to improve</h2></div><button class="course-link-button" type="button" @click="selectTab('results')">View all</button></header>
              <div class="course-weak-list"><div v-for="topic in improveTopics.slice(0, 3)" :key="`overview-${topic.id}`" class="course-weak-row"><strong>{{ topic.title }}</strong><span :class="topic.priority.toLowerCase()">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span></div></div>
            </section>
            </div>
            <aside class="course-about-card" aria-labelledby="courseAboutTitle">
              <h2 id="courseAboutTitle">About this course</h2>
              <ul>
                <li><span class="course-about-icon"><svg class="icon" aria-hidden="true"><use href="#i-book"/></svg></span><span><strong>100</strong> video lessons</span></li>
                <li><span class="course-about-icon"><svg class="icon" aria-hidden="true"><use href="#i-grid"/></svg></span><span><strong>3,879</strong> practice questions</span></li>
                <li><span class="course-about-icon"><svg class="icon" aria-hidden="true"><use href="#i-exam"/></svg></span><span><strong>1</strong> full-length practice test with score analysis</span></li>
              </ul>
            </aside>
          </div>

          <section v-else-if="activeTab === 'study'" class="study-breakdown" aria-label="SAT lessons"><header class="study-breakdown-toolbar" aria-label="Filter lessons"><div class="study-breakdown-filters"><div class="study-filter-group"><span class="study-filter-label">Section</span><div class="study-section-switch" role="group" aria-label="SAT section"><button v-for="section in (['Math','Reading and Writing'] as const)" :key="section" type="button" :aria-pressed="sectionFilter === section" @click="sectionFilter = section">{{ section === 'Reading and Writing' ? 'Reading & Writing' : section }}</button></div></div><div class="study-filter-group importance"><span class="study-filter-label">Importance</span><div class="study-importance-chips" role="group" aria-label="Topic importance"><button v-for="filter in ([['all','All'],['core','Core'],['likely','Likely'],['possible','Possible']] as const)" :key="filter[0]" :class="filter[0]" type="button" :aria-pressed="priorityFilter === filter[0]" @click="priorityFilter = filter[0]"><i v-if="filter[0] !== 'all'"/>{{ filter[1] }}</button></div></div></div></header><div v-if="showLessonImportanceNote" class="study-priority-note"><svg class="icon" aria-hidden="true"><use href="#i-target"/></svg><span>Importance combines the official SAT content-domain weight ({{ Math.round((manifest?.importanceModel.domainWeightContribution ?? 0.65) * 100) }}%) with mapped frequency across {{ (manifest?.importanceModel.sourceQuestionCount ?? 3879).toLocaleString() }} practice questions ({{ Math.round((manifest?.importanceModel.topicFrequencyContribution ?? 0.35) * 100) }}%). Study progress is tracked separately.</span><button class="study-priority-note-close" type="button" aria-label="Dismiss importance explanation" title="Dismiss" @click="dismissImportanceNote('lessons')"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div><div v-if="loadError" class="study-topic-empty">{{ loadError }}</div><div v-else-if="!manifest" class="study-topic-empty">Loading SAT topics…</div><div v-else class="study-topic-sections"><section v-for="section in topicsBySection" :key="section.id" :class="['study-topic-section',{ collapsed:priorityFilter === 'all' && collapsedSections.has(section.id) }]" :aria-labelledby="priorityFilter === 'all' ? section.id : undefined" :aria-label="priorityFilter !== 'all' ? `${priorityFilter} topics sorted by importance` : undefined"><button v-if="priorityFilter === 'all'" class="study-section-head" type="button" :aria-expanded="!collapsedSections.has(section.id)" @click="toggleSection(section.id)"><h3 :id="section.id">{{ section.examSection }} · {{ section.title }}</h3><span class="study-section-meta"><span>{{ section.topics.length }} Topics</span><svg class="icon"><use href="#i-chevron"/></svg></span></button><div v-if="priorityFilter !== 'all' || !collapsedSections.has(section.id)" role="table"><div class="study-topic-table-head" role="row"><span role="columnheader">Topic Area</span><span role="columnheader">Progress</span></div><article v-for="topic in section.topics" :key="topic.id" class="study-topic-row" role="row" tabindex="0"><div class="study-topic-copy" role="cell"><strong>{{ topic.title }}</strong><span>{{ topic.summary }}</span><div class="study-topic-meta"><span :class="['study-topic-importance',topic.priority.toLowerCase()]">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span><span>{{ topic.mappedQuestionCount }} mapped questions</span><span>{{ topic.domain }}</span></div></div><div class="study-topic-progress" role="cell"><span class="study-topic-progress-copy"><strong>{{ topicProgress(topic) ? 'In progress' : 'Not started' }}</strong><span>{{ topicProgressLabel(topic) }}</span></span><span class="study-topic-progress-meter"><strong>{{ topicProgress(topic) }}%</strong><span class="study-topic-progress-track"><i :class="{complete:topicProgress(topic)===100}" :style="{width:`${topicProgress(topic)}%`}"/></span></span></div><aside class="study-topic-popover"><div class="study-topic-popover-head"><h4>{{ topic.title }}</h4><span :class="topic.priority.toLowerCase()">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span></div><p>{{ topic.summary }}</p><p class="study-topic-importance-detail">{{ topic.domainWeightPercent }}% official domain weight · {{ topic.mappedQuestionCount }} mapped questions</p><small>Study with</small><div class="study-topic-actions"><button class="study-topic-tool" type="button" @click="openTopic(topic,'study-guide')"><svg class="icon"><use href="#i-book"/></svg><span>Study Guide</span></button><button class="study-topic-tool" type="button" @click="openTopic(topic,'flashcards')"><svg class="icon"><use href="#i-grid"/></svg><span>Flashcards</span></button><button class="study-topic-tool" type="button" @click="openTopic(topic,'quiz')"><svg class="icon"><use href="#i-exam"/></svg><span>Quiz</span></button></div></aside></article></div></section></div></section>

          <div v-else-if="activeTab === 'mock'" class="mock-state-shell">
            <div class="mock-exam-card-grid">
              <article :class="['mock-entry-card',practiceTestState]">
                <div class="mock-entry-content">
                  <header class="mock-entry-head"><span class="mock-entry-number">Practice Test</span><span :class="['mock-entry-state',practiceTestState]"><i/>{{ practiceTestCard.stateLabel }}</span></header>
                  <div class="mock-entry-copy"><h3>Digital SAT Full-Length Practice Test 1</h3><p>{{ practiceTestCard.description }}</p></div>
                  <div class="mock-entry-metrics"><span v-for="metric in practiceTestCard.metrics" :key="metric.label"><strong>{{ metric.value }}</strong>{{ metric.label }}</span></div>
                  <div class="mock-entry-progress"><div><span>{{ practiceTestCard.progressTitle }}</span><strong>{{ practiceTestCard.progressLabel }}</strong></div><span class="mock-entry-progress-track"><i :style="{width:`${practiceTestCard.progressPercent}%`}"/></span></div>
                </div>
                <footer class="mock-entry-footer"><button class="mock-primary-action" type="button" :disabled="practiceTestCard.disabled" @click="handlePracticeTestAction"><svg class="icon" aria-hidden="true"><use href="#i-spark"/></svg><span>{{ practiceTestCard.cta }}</span></button><span>{{ practiceTestCard.helper }}</span></footer>
              </article>
            </div>
            <aside class="mock-demo-controller" aria-label="Practice test demo state controller">
              <header class="mock-demo-controller-head"><strong>Demo control</strong><span>Not product UI</span></header>
              <nav class="mock-state-nav" aria-label="Preview practice test card state">
                <button v-for="state in practiceTestStates" :key="state.id" :class="['mock-state-button',{ active:practiceTestState === state.id }]" type="button" :aria-pressed="practiceTestState === state.id" @click="practiceTestState = state.id">{{ state.label }}</button>
              </nav>
            </aside>
          </div>

          <div v-else class="results-experience">
            <header class="results-experience-head">
              <div class="results-view-switch" role="tablist" aria-label="Result views">
                <button type="button" role="tab" :aria-selected="resultView === 'score'" @click="setResultView('score')"><span class="results-view-icon"><svg class="icon" aria-hidden="true"><use href="#i-chart"/></svg></span><span class="results-view-copy"><strong>Score Report</strong><small>Scores &amp; performance</small></span></button>
                <button type="button" role="tab" :aria-selected="resultView === 'review'" @click="setResultView('review')"><span class="results-view-icon"><svg class="icon" aria-hidden="true"><use href="#i-exam"/></svg></span><span class="results-view-copy"><strong>Question Review</strong><small>{{ reportQuestions.length || 98 }} questions</small></span></button>
                <button type="button" role="tab" :aria-selected="resultView === 'improve'" @click="setResultView('improve')"><span class="results-view-icon"><svg class="icon" aria-hidden="true"><use href="#i-target"/></svg></span><span class="results-view-copy"><strong>Topics to Improve</strong><small>Adaptive practice</small></span></button>
              </div>
            </header>

            <div v-if="resultLoadError" class="results-empty">{{ resultLoadError }}</div>
            <div v-else-if="!resultReport" class="results-empty">Loading score report…</div>

            <div v-else-if="resultView === 'score'" class="score-report-view">
              <section class="score-report-card">
                <header class="score-report-cover"><span>SAT® Prep 2026</span><small>Score report</small></header>
                <div class="score-report-main">
                  <div class="score-report-total">
                    <span>Total score</span>
                    <strong>{{ resultReport.totalScore }}<small>/{{ resultReport.maximumScore }}</small></strong>
                    <div class="score-report-meta"><span>Score range <b>{{ resultReport.scoreRange[0] }}–{{ resultReport.scoreRange[1] }}</b></span><span>Average score <b>{{ resultReport.averageScore }}</b></span><em>{{ resultReport.percentile }}th percentile</em></div>
                  </div>
                  <div class="score-report-sections">
                    <article v-for="section in resultReport.sections" :key="section.sectionId">
                      <span>{{ section.sectionTitle }}</span><strong>{{ section.score }}<small>/{{ section.maximumScore }}</small></strong>
                      <p>Score range {{ section.scoreRange[0] }}–{{ section.scoreRange[1] }}<br>Average {{ section.averageScore }}</p>
                      <em>{{ section.percentile }}th percentile</em>
                    </article>
                  </div>
                </div>
              </section>

              <section class="report-ai-overview"><span class="report-ai-icon"><svg class="icon"><use href="#i-spark"/></svg></span><div><span>SAT Overview</span><p>{{ resultReport.overview }}</p></div></section>

              <section class="knowledge-report" aria-labelledby="knowledgeReportTitle">
                <header class="report-section-heading"><div><h3 id="knowledgeReportTitle">Knowledge and Skills</h3><p>Performance across the 8 content domains measured on the SAT.</p></div></header>
                <div class="knowledge-section-grid">
                  <article v-for="section in resultReport.sections" :key="`domain-${section.sectionId}`" class="knowledge-section-card">
                    <h4>{{ section.sectionTitle }}</h4>
                    <div v-for="domain in resultReport.domains.filter((item) => item.sectionId === section.sectionId)" :key="domain.contentDomain" class="knowledge-domain-row">
                      <div><strong>{{ domain.contentDomain }}</strong><span>{{ domain.total }} questions · {{ domain.accuracy }}% accuracy</span></div>
                      <span class="mastery-segments" :aria-label="`${domain.masteryLevel} of 5 mastery`"><i v-for="level in 5" :key="level" :class="{ active: level <= domain.masteryLevel }"/></span>
                    </div>
                  </article>
                </div>
              </section>

              <section class="report-performance-details">
                <header class="report-section-heading"><div><h3>Performance details</h3><p>See which SAT skills are both accurate and efficient—and where extra review can help.</p></div></header>
                <div class="report-stat-strip">
                  <div><span>Correct</span><strong>{{ resultReport.correct }}<small>/{{ reportQuestions.length }}</small></strong></div><div><span>Incorrect</span><strong>{{ resultReport.incorrect }}</strong></div><div><span>Unanswered</span><strong>{{ resultReport.omitted }}</strong></div><div><span>Accuracy</span><strong>{{ resultReport.accuracy }}%</strong></div><div><span>Time used</span><strong>{{ formatReportDuration(resultReport.durationSeconds) }}</strong></div>
                </div>
                <article class="report-confidence-model" aria-labelledby="reportConfidenceTitle">
                  <header class="report-confidence-head"><div><h4 id="reportConfidenceTitle">Confidence quadrant</h4><p>Each dot is a tested topic, compared with its section's average accuracy and pace. Hover or focus a dot for details.</p></div><div class="report-confidence-axes" aria-hidden="true"><span>↑ Accuracy</span><span>Time →</span></div></header>
                  <div class="report-confidence-grid">
                    <section v-for="section in resultReport.sections" :key="`confidence-${section.sectionId}`" class="report-confidence-column">
                      <header><h5>{{ section.sectionTitle }}</h5><span>{{ confidenceTopics.filter((topic) => topic.sectionId === section.sectionId).length }} topics</span></header>
                      <div class="report-confidence-chart" role="group" :aria-label="`${section.sectionTitle} topic confidence quadrant by accuracy and average response time`">
                        <span class="report-quad-label proficient">Proficient</span><span class="report-quad-label inefficient">Inefficient</span><span class="report-quad-label careless">Careless</span><span class="report-quad-label struggling">Struggling</span>
                        <button v-for="topic in confidenceTopics.filter((item) => item.sectionId === section.sectionId)" :key="topic.topicId" type="button" :class="['report-confidence-dot',topic.quadrant,{ 'edge-right':topic.edgeRight,'edge-bottom':topic.edgeBottom }]" :style="{ left: `${topic.left}%`, top: `${topic.top}%` }" :aria-label="`${topic.label}: ${topic.accuracy}% accuracy, ${topic.averageSeconds ? formatReportTime(topic.averageSeconds) : 'no recorded time'} average time`" :aria-describedby="`confidence-tooltip-${topic.topicId}`">
                          <span :id="`confidence-tooltip-${topic.topicId}`" class="report-confidence-tooltip" role="tooltip"><strong>{{ topic.label }}</strong><em>{{ topic.domain }}</em><span><small>Accuracy</small><b>{{ topic.accuracy }}%</b></span><span><small>Average time</small><b>{{ topic.averageSeconds ? formatReportTime(topic.averageSeconds) : '—' }}</b></span><span><small>Questions</small><b>{{ topic.attempts }}/{{ topic.total }} answered</b></span></span>
                        </button>
                      </div>
                    </section>
                  </div>
                </article>
              </section>

              <footer class="report-footer"><p>SAT® is a registered trademark of the College Board, which is not affiliated with or endorsed by this product. Practice scores are estimates, not official College Board scores.</p><div><button class="report-retake-button" type="button" @click="requestRetake">Retake</button><button class="report-practice-button" type="button" @click="setResultView('improve')">Practice Weak Topics</button></div></footer>
            </div>

            <div v-else-if="resultView === 'review'" class="question-review-view">
              <header class="study-breakdown-toolbar question-review-toolbar" aria-label="Filter reviewed questions">
                <div class="study-breakdown-filters">
                  <div class="study-filter-group">
                    <span class="study-filter-label">Section</span>
                    <div class="study-section-switch" role="group" aria-label="Filter by SAT section">
                      <button v-for="section in ([['ALL','All sections'],['reading-writing','Reading & Writing'],['math','Math']] as const)" :key="section[0]" type="button" :aria-pressed="reviewSectionFilter === section[0]" @click="setReviewSectionFilter(section[0])">{{ section[1] }}</button>
                    </div>
                  </div>
                  <div class="study-filter-group importance">
                    <span class="study-filter-label">Answer status</span>
                    <div class="study-importance-chips review-status-chips" role="group" aria-label="Filter by answer status">
                      <button v-for="filter in (['ALL','INCORRECT','OMITTED','CORRECT'] as ReviewFilter[])" :key="filter" :class="filter.toLowerCase()" type="button" :aria-pressed="reviewFilter === filter" @click="setReviewFilter(filter)"><i v-if="filter !== 'ALL'"/>{{ filter === 'ALL' ? 'All' : reviewStatusLabel(filter) }} <b>{{ filter === 'ALL' ? sectionReviewQuestions.length : sectionReviewQuestions.filter((question) => question.status === filter).length }}</b></button>
                    </div>
                  </div>
                </div>
              </header>

              <div v-if="selectedReviewQuestion" class="question-review-workspace">
                <aside class="review-question-navigator" aria-label="Question navigator">
                  <header><div><span>Question map</span><strong>{{ filteredReviewQuestions.length }} shown</strong></div><small>Choose a question to review</small></header>
                  <div class="review-question-groups">
                    <section v-for="group in reviewQuestionGroups" :key="group.key" class="review-question-group">
                      <header><div><strong>{{ group.sectionTitle }}</strong><span>{{ group.module }}</span></div></header>
                      <div class="review-question-number-grid">
                        <button v-for="question in group.questions" :key="question.questionId" type="button" :class="[question.status.toLowerCase(), { active: selectedReviewQuestion.questionId === question.questionId }]" :aria-label="`Question ${question.index + 1}, ${reviewStatusLabel(question.status)}`" :aria-current="selectedReviewQuestion.questionId === question.questionId ? 'true' : undefined" @click="selectedReviewQuestionId = question.questionId">{{ question.index + 1 }}</button>
                      </div>
                    </section>
                  </div>
                  <footer><span><i class="incorrect"/>Incorrect</span><span><i class="omitted"/>Unanswered</span><span><i class="correct"/>Correct</span></footer>
                </aside>

                <article class="review-question-detail">
                  <header class="review-question-header">
                    <div class="review-question-identity"><strong>Question {{ selectedReviewQuestion.index + 1 }}</strong><span>Time spent · {{ selectedReviewQuestion.timeSpentSeconds ? formatReportTime(selectedReviewQuestion.timeSpentSeconds) : '—' }}</span></div>
                    <div class="review-question-tags"><span>{{ selectedReviewQuestion.sectionTitle }}</span><span>{{ selectedReviewQuestion.module }}</span><span>{{ selectedReviewQuestion.difficulty }}</span><em :class="selectedReviewQuestion.status.toLowerCase()">{{ reviewStatusLabel(selectedReviewQuestion.status) }}</em></div>
                  </header>
                  <h3>{{ selectedReviewQuestion.stem }}</h3>
                  <div v-if="selectedReviewQuestion.responseType === 'MULTIPLE_CHOICE'" class="review-option-list">
                    <div v-for="([answer, copy]) in optionEntries(selectedReviewQuestion)" :key="answer" :class="['review-option', optionState(selectedReviewQuestion, answer)]"><i>{{ answer }}</i><span>{{ copy }}</span><b v-if="answer === selectedReviewQuestion.correctAnswer">Correct answer</b><b v-else-if="answer === selectedReviewQuestion.userAnswer">Your answer</b></div>
                  </div>
                  <div v-else class="review-produced-response"><div><span>Your answer</span><strong :class="selectedReviewQuestion.status.toLowerCase()">{{ selectedReviewQuestion.userAnswer ?? 'No answer' }}</strong></div><div><span>Correct answer</span><strong class="correct">{{ selectedReviewQuestion.correctAnswer }}</strong></div></div>
                  <section :class="['review-feedback-panel', selectedReviewQuestion.status.toLowerCase()]"><header><span>{{ selectedReviewQuestion.status === 'CORRECT' ? '✓' : selectedReviewQuestion.status === 'INCORRECT' ? '×' : '–' }}</span><strong>{{ selectedReviewQuestion.status === 'CORRECT' ? 'You got it right' : selectedReviewQuestion.status === 'INCORRECT' ? 'Review this answer' : 'You left this unanswered' }}</strong><em>{{ selectedReviewQuestion.earnedRawPoints }}/{{ selectedReviewQuestion.maximumRawPoints }} point</em></header><p><b>Explanation</b>{{ selectedReviewQuestion.explanation }}</p></section>
                  <section class="review-skill-panel">
                    <div><span>Skill to review</span><strong>{{ selectedReviewQuestion.officialSkill }}</strong><p>{{ selectedReviewQuestion.contentDomain }} · {{ reviewTopicTitle(selectedReviewQuestion) }}</p></div>
                    <button type="button" @click="practiceReviewQuestion(selectedReviewQuestion)">Practice this topic</button>
                  </section>
                  <footer class="review-detail-pagination"><button type="button" :disabled="selectedReviewQuestionPosition <= 0" @click="moveReviewQuestion(-1)">← Previous</button><span>{{ selectedReviewQuestionPosition + 1 }} of {{ filteredReviewQuestions.length }} in this view</span><button type="button" :disabled="selectedReviewQuestionPosition >= filteredReviewQuestions.length - 1" @click="moveReviewQuestion(1)">Next →</button></footer>
                </article>
              </div>
              <div v-else class="results-empty">No questions match these filters.</div>
              <footer class="report-footer"><p>SAT® is a registered trademark of the College Board, which is not affiliated with or endorsed by this product.</p><div><button class="report-retake-button" type="button" @click="requestRetake">Retake</button><button class="report-practice-button" type="button" @click="setResultView('improve')">Practice Weak Topics</button></div></footer>
            </div>

            <section v-else class="topics-improve-view study-breakdown" aria-label="Topics to improve">
              <header class="study-breakdown-toolbar" aria-label="Filter improvement topics"><div class="study-breakdown-filters"><div class="study-filter-group"><span class="study-filter-label">Section</span><div class="study-section-switch" role="group" aria-label="SAT section"><button v-for="section in (['math','reading-writing'] as const)" :key="section" type="button" :aria-pressed="improveSection === section" @click="improveSection = section">{{ section === 'math' ? 'Math' : 'Reading & Writing' }}</button></div></div><div class="study-filter-group importance"><span class="study-filter-label">Importance</span><div class="study-importance-chips" role="group" aria-label="Topic importance"><button v-for="filter in (['ALL','CORE','LIKELY','POSSIBLE'] as const)" :key="filter" :class="filter.toLowerCase()" type="button" :aria-pressed="improvePriority === filter" @click="improvePriority = filter"><i v-if="filter !== 'ALL'"/>{{ filter.charAt(0) + filter.slice(1).toLowerCase() }}</button></div></div></div></header>
              <div v-if="showImproveImportanceNote" class="study-priority-note"><svg class="icon" aria-hidden="true"><use href="#i-target"/></svg><span>Topics are prioritized using your latest practice-test results and SAT importance. Practice progress is tracked separately from Lessons.</span><button class="study-priority-note-close" type="button" aria-label="Dismiss topic-priority explanation" title="Dismiss" @click="dismissImportanceNote('improve')"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button></div>
              <div v-if="!improveTopicSections.length" class="study-topic-empty">No topics match this importance filter.</div>
              <div v-else class="study-topic-sections">
                <section v-for="section in improveTopicSections" :key="section.id" class="study-topic-section" :aria-labelledby="improvePriority === 'ALL' ? section.id : undefined" :aria-label="improvePriority !== 'ALL' ? `${improvePriority} topics sorted by importance` : undefined">
                  <header v-if="improvePriority === 'ALL'" class="study-section-head static"><h3 :id="section.id">{{ section.examSection }} · {{ section.title }}</h3><span class="study-section-meta"><span>{{ section.topics.length }} {{ section.topics.length === 1 ? 'Topic' : 'Topics' }}</span></span></header>
                  <div role="table"><article v-for="topic in section.topics" :key="topic.id" class="study-topic-row improve-topic-row" role="row"><div class="study-topic-copy" role="cell"><strong>{{ topic.title }}</strong><span>{{ topic.description }}</span><div class="study-topic-meta"><span :class="['study-topic-importance',topic.priority.toLowerCase()]">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span><span>{{ topic.missed }} missed · {{ topic.accuracy }}% accuracy</span><span>{{ topic.contentDomain }}</span></div></div><div class="improve-topic-action" role="cell"><button type="button" :class="improvePracticeState(topic)" @click="openImprovePractice(topic)">{{ improvePracticeLabel(topic) }}</button></div></article></div>
                </section>
              </div>
            </section>
          </div>
        </div>
        </div>
      </section>
    </main>
    <dialog ref="retakeDialog" class="retake-confirm-dialog" aria-labelledby="retakeConfirmTitle" aria-describedby="retakeConfirmDescription" @cancel.prevent="closeRetakeConfirm">
      <div class="retake-confirm-content">
        <span class="retake-confirm-icon" aria-hidden="true"><svg class="icon"><use href="#i-history"/></svg></span>
        <div><h2 id="retakeConfirmTitle">Retake This Practice Test?</h2><p id="retakeConfirmDescription">Retaking this practice test will permanently delete your current result, answers, and score analysis. This can’t be undone.</p></div>
      </div>
      <footer class="retake-confirm-actions"><button type="button" class="retake-cancel-button" @click="closeRetakeConfirm">Cancel</button><button type="button" class="retake-confirm-button" @click="confirmRetake">Retake Test</button></footer>
    </dialog>
  </div>
</template>
