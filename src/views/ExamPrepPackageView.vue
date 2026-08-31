<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadEpExam, loadSatManifest } from '../data/satData'
import { buildReviewQuestions, buildSatReport } from '../data/satReport'
import type { SatReportReviewQuestion } from '../data/satReport'
import type { EpExam } from '../types/epV2'
import type { SatManifest, SatTopic } from '../types/sat'

type CourseTab = 'overview' | 'study' | 'mock' | 'results'
type ResultView = 'score' | 'review' | 'improve'
type ReviewFilter = 'ALL' | 'INCORRECT' | 'CORRECT' | 'OMITTED'
type Course = { family: string; label: string; title: string; topics: string; videos: string; questions: string; search: string }

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
const reviewLimit = ref(6)
const improveSection = ref<'math' | 'reading-writing'>('math')
const improvePriority = ref<'ALL' | SatTopic['priority']>('ALL')
const isCourseOpen = computed(() => route.hash === '#course-0')

const resultReport = computed(() => resultExam.value ? buildSatReport(resultExam.value) : null)
const reportQuestions = computed(() => resultExam.value && resultReport.value ? buildReviewQuestions(resultExam.value, resultReport.value) : [])
const filteredReviewQuestions = computed(() => reportQuestions.value.filter((question) => reviewFilter.value === 'ALL' || question.status === reviewFilter.value))
const visibleReviewQuestions = computed(() => filteredReviewQuestions.value.slice(0, reviewLimit.value))
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
      state: topicProgress(topic) ? 'CONTINUE' as const : accuracy < 50 ? 'REVIEW' as const : 'PRACTICE' as const,
    }
  }).filter((topic) => topic.missed > 0).sort((left, right) => right.opportunityScore - left.opportunityScore || right.importanceScore - left.importanceScore)
})
const improveGroups = computed(() => {
  const topics = improveTopics.value.filter((topic) => topic.sectionId === improveSection.value && (improvePriority.value === 'ALL' || topic.priority === improvePriority.value))
  return [...new Set(topics.map((topic) => topic.contentDomain))].map((contentDomain) => ({ contentDomain, topics: topics.filter((topic) => topic.contentDomain === contentDomain) }))
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
  return manifest.value.sections
    .map((section) => ({ ...section, topics: section.topicIds.map((id) => byId.get(id)).filter(Boolean) as SatTopic[] }))
    .filter((section) => section.examSection === sectionFilter.value)
    .map((section) => ({ ...section, topics: section.topics.filter((topic) => priorityFilter.value === 'all' || topic.priority.toLowerCase() === priorityFilter.value) }))
    .filter((section) => section.topics.length)
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

function closeCourse() { void router.push({ name: 'package' }) }
function selectTab(tab: CourseTab) { activeTab.value = tab; window.scrollTo({ top: 0, behavior: 'smooth' }) }
function toggleSection(id: string) { const next = new Set(collapsedSections.value); next.has(id) ? next.delete(id) : next.add(id); collapsedSections.value = next }
function openTopic(topic: SatTopic, tool: 'study-guide' | 'flashcards' | 'quiz') { void router.push({ name: tool, params: { topicId: topic.id } }) }
function resumeStudy() { void router.push({ name: 'study-guide', params: { topicId: 'sat_math_advanced_equivalent_expressions_01' } }) }
function continueOverviewStudy() { void router.push({ name: 'study-guide', params: { topicId: 'sat_math_algebra_systems_linear_01' } }) }
function startMockExam(examId: number) { void router.push({ name: 'mock-exam', params: { examId } }) }
function toggleTheme() { document.body.classList.toggle('dark') }
function setResultView(view: ResultView) { resultView.value = view; reviewLimit.value = 6 }
function setReviewFilter(filter: ReviewFilter) { reviewFilter.value = filter; reviewLimit.value = 6 }
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
function reviewTypeLabel(question: SatReportReviewQuestion) { return question.responseType === 'STUDENT_PRODUCED_RESPONSE' ? 'Student-produced response' : 'Multiple choice' }
function reviewStatusLabel(status: ReviewFilter) { return status === 'OMITTED' ? 'Unanswered' : status.charAt(0) + status.slice(1).toLowerCase() }
function priorityLabel(priority: SatTopic['priority']) { return priority.charAt(0) + priority.slice(1).toLowerCase() }

function syncTabFromRoute() {
  const requestedTab = String(route.query.tab || '')
  activeTab.value = requestedTab === 'study' || requestedTab === 'mock' || requestedTab === 'results' ? requestedTab : 'overview'
}

watch([() => route.hash, () => route.query.tab], () => {
  if (route.hash === '#course-0') syncTabFromRoute()
  else activeTab.value = 'overview'
})

onMounted(async () => {
  document.body.classList.add('package-route')
  syncTabFromRoute()
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
      <div class="extension-entry" aria-label="Solvely Chrome extension"><a class="extension-cta" href="https://chromewebstore.google.com/detail/aedglnfjjccpifohekdeoogffomjcikm" target="_blank" rel="noopener"><svg class="extension-browser-icon" viewBox="0 0 24 24"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z"/></svg><span>Get the Chrome Extension</span><span class="extension-tooltip">Solve anywhere on the web</span></a></div>
      <button class="history-entry" type="button" aria-disabled="true"><svg class="icon"><use href="#i-history"/></svg><span>History</span></button>

      <div v-if="!isCourseOpen" class="workspace">
        <header class="hero"><h1>Solvely: Your AI Study Companion</h1><div class="workspace-mode-switch" role="tablist" aria-label="Choose workspace mode"><button class="workspace-mode-button" type="button" role="tab" aria-selected="false" aria-disabled="true"><svg class="icon"><use href="#i-book"/></svg><span>Study</span></button><button class="workspace-mode-button" type="button" role="tab" aria-selected="true"><svg class="icon"><use href="#i-target"/></svg><span>Exam Prep</span></button><button class="workspace-mode-button" type="button" role="tab" aria-selected="false" aria-disabled="true"><svg class="icon"><use href="#i-wand"/></svg><span>Writing</span></button></div></header>
        <section class="composer-shell" aria-label="Solvely learning composer"><div class="composer-input-wrap"><textarea class="composer-input" aria-label="Tell Solvely what you want to learn" placeholder="Choose an exam or describe what you are preparing for" /></div><div class="composer-toolbar"><button class="tool-button" type="button" aria-label="Attach files" aria-disabled="true"><svg class="icon"><use href="#i-upload"/></svg></button><button class="tool-button" type="button" aria-label="Upload images" aria-disabled="true"><svg class="icon"><use href="#i-image"/></svg></button><span class="toolbar-spacer"/><button class="send-button" type="button" disabled><svg class="icon"><use href="#i-spark"/></svg><span>Create plan</span></button></div></section>

        <section class="examples-section" aria-label="Exam prep examples"><div class="examples-heading"><div class="examples-copy"><h2>Exam prep plan</h2></div><p class="examples-description">Plan, practice, and track your exam progress.</p></div><div class="examples-grid four-up">
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Plan</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Daily study plan</h3><div class="example-preview exam-feature-visual exam-plan-visual"><section class="exam-visual-panel"><header class="exam-plan-header"><div><strong>Study Plan</strong><span class="exam-plan-meta">Exam: Aug 31, 2026<i/>6-day plan</span></div></header><div class="exam-plan-calendar"><span v-for="(day, index) in ['24','25','26','27','28','29','30']" :key="day" :class="['exam-plan-day',{ active:index===1 }]"><b>{{ day }}</b></span></div><div class="exam-plan-task-area"><div class="exam-plan-task-head"><span>6 days until exam</span><span>3 tasks</span></div><div class="exam-plan-task"><span class="exam-plan-check"/><span>Model Selection</span></div><div class="exam-plan-task done"><span class="exam-plan-check">✓</span><span>Stationarity Testing</span></div></div></section></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Review</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Core topics</h3><div class="example-preview exam-feature-visual exam-topics-visual"><div class="exam-topics-table"><div class="exam-topics-head"><span>Topic</span><span>Likelihood</span><span>Mastery</span></div><div v-for="(topicName,index) in ['Model Selection','Stationarity Testing','ARIMA Modeling','SARIMA Modeling','Dynamic Regression']" :key="topicName" class="exam-topic-row"><span>{{ topicName }}</span><strong class="exam-likelihood">{{ 98-index*2 }}%</strong><span class="exam-mastery"><strong>{{ index ? 0 : 30 }}%</strong><span class="exam-mastery-track"><i :style="{width:index ? '0%' : '30%'}"/></span></span></div></div></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Practice</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Mock exams</h3><div class="example-preview exam-feature-visual exam-mock-visual"><div class="exam-mock-visual-grid"><section v-for="exam in 2" :key="exam" class="exam-mock-visual-card"><span class="exam-mock-visual-icon"><svg class="icon"><use :href="exam === 1 ? '#i-target' : '#i-spark'"/></svg></span><div class="exam-mock-title-row"><strong>Mock Exam {{ exam }}</strong><span class="exam-mock-badge">{{ exam === 1 ? '≥90% likely' : '80–90% likely' }}</span></div><p>The must-know questions. Nail these first</p><p class="exam-mock-meta">34 mins · 25 Questions</p><span class="exam-mock-state">Not started</span><span class="exam-mock-button">Start exam →</span></section></div></div></button>
          <button class="example-card feature-card sample-disabled" type="button" disabled><span class="example-meta"><span>Assess</span><svg class="icon"><use href="#i-target"/></svg></span><h3>Progress tracking</h3><div class="example-preview exam-feature-visual exam-result-shell"><div class="exam-result-progress"><i/></div><section class="exam-result-summary"><h4>FINAL Exam: Biology 101</h4><div class="exam-result-stats"><span>Points: <strong>21 / 26</strong></span><span>Percentage: <strong>81%</strong></span></div><div class="exam-result-analysis"><strong>Final exam analysis</strong><span>You demonstrated strong understanding of cell structure, genetics, and ecology.</span></div></section><section class="exam-result-question"><small>Multiple Choice · 1/26</small><h5>Where does the electron transport chain occur?</h5><div class="exam-result-answer wrong">A. Cytoplasm</div><div class="exam-result-answer correct">D. Inner mitochondrial membrane</div></section></div></button>
        </div></section>

        <section class="exam-catalog" aria-labelledby="examCatalogTitle"><div class="exam-catalog-heading"><div><h2 id="examCatalogTitle">Standardized test courses</h2></div><p>Topic study, mock exams, results, and targeted improvement.</p></div><section class="diagnostic-entry jump-back-entry" aria-labelledby="jumpBackTitle"><div class="diagnostic-entry-copy"><div class="diagnostic-entry-meta"><span>JUMP BACK IN</span><span>62% COMPLETE</span></div><h3 id="jumpBackTitle">Continue Expansion, factoring, and completing the square</h3><p>Pick up your Study Guide in Advanced Math, then reinforce the topic with flashcards and targeted practice.</p></div><button class="diagnostic-entry-button" type="button" @click="resumeStudy">Continue study guide<svg class="icon"><use href="#i-chevron"/></svg></button></section><div class="exam-catalog-toolbar"><label class="exam-search-wrap"><svg class="icon"><use href="#i-search"/></svg><input v-model="searchQuery" aria-label="Search standardized exam courses" placeholder="Search SAT, ACT, AP, Abitur..." /></label><label class="exam-filter-wrap"><span class="sr-only">Filter exam packages</span><select v-model="familyFilter" aria-label="Filter exam packages"><option value="all">All courses</option><option value="sat">SAT</option><option value="act">ACT</option><option value="ap">AP</option><option value="abitur">Abitur</option></select><svg class="icon"><use href="#i-chevron"/></svg></label></div><div class="course-grid" aria-label="Pre-made exam courses"><button v-for="course in filteredCourses" :key="course.title" :class="['course-card',{ 'sample-course':course.family !== 'sat' }]" type="button" :disabled="course.family !== 'sat'" :aria-label="course.family === 'sat' ? `Open ${course.title} course` : `${course.title} sample unavailable`" @click="openCourse(course)"><span class="course-family">{{ course.label }}</span><h3>{{ course.title }}</h3><p>{{ course.topics }} topics · {{ course.videos }} video lessons<br>{{ course.questions }} practice questions</p><span class="course-stats"><span>Full test</span><span>Score insights</span></span></button></div><p v-if="!filteredCourses.length" class="course-empty">No matching courses. Try another exam name.</p></section>
      </div>

      <section v-else class="course-workspace" aria-labelledby="courseWorkspaceTitle">
        <button class="course-back" type="button" @click="closeCourse"><svg class="icon"><use href="#i-chevron"/></svg><span>Back to courses</span></button>
        <header class="course-package-hero"><div class="course-package-copy"><p class="course-package-breadcrumb"><span>Exam Prep</span><i/><span>SAT</span></p><h1 id="courseWorkspaceTitle">SAT Prep 2026</h1><p>A focused SAT Prep 2026 plan with topic study tools, realistic mock exams, score reports, and targeted improvement.</p><div class="course-package-metrics"><span class="course-package-metric"><svg class="icon"><use href="#i-book"/></svg><span><strong>100</strong> video lessons</span></span><span class="course-package-metric"><svg class="icon"><use href="#i-grid"/></svg><span><strong>3,879</strong> practice questions</span></span><span class="course-package-metric"><svg class="icon"><use href="#i-exam"/></svg><span><strong>2</strong> full-length practice tests with score analysis</span></span></div></div><aside class="course-progress-summary" aria-label="Course progress"><span class="course-progress-watermark" aria-hidden="true">18</span><div class="course-progress-value"><strong>18%</strong><span>Course Progress</span></div><div class="course-progress-track" role="progressbar" aria-label="Course progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="18"><i style="width:18%"/></div></aside></header>
        <nav class="course-package-tabs" role="tablist" aria-label="Course sections"><button v-for="tab in ([['overview','Overview'],['study','Lessons'],['mock','Mock Exam'],['results','Results & Improve']] as [CourseTab,string][])" :key="tab[0]" class="course-package-tab" type="button" role="tab" :aria-selected="activeTab === tab[0]" @click="selectTab(tab[0])">{{ tab[1] }}</button></nav>
        <div class="course-package-panel" role="tabpanel" aria-live="polite">
          <div v-if="activeTab === 'overview'" class="course-overview-waterfall">
            <section class="course-hub-card">
              <header class="course-hub-head"><div><span class="course-hub-eyebrow">Continue learning</span><h2>Pick up where you left off</h2><p>Your next study action is ready.</p></div><button class="course-link-button" type="button" @click="selectTab('study')">View plan</button></header>
              <div class="course-next-task"><span class="course-next-icon"><svg class="icon"><use href="#i-book"/></svg></span><div class="course-next-copy"><strong>Linear equations &amp; systems</strong><span>Study Guide · Section 3 of 6</span></div><button class="course-primary-small" type="button" @click="continueOverviewStudy">Continue</button></div>
            </section>

            <section class="course-hub-card">
              <header class="course-hub-head"><div><span class="course-hub-eyebrow">Needs attention</span><h2>Topics to improve</h2><p>Based on your latest quiz and mock exam.</p></div><button class="course-link-button" type="button" @click="selectTab('results')">View all</button></header>
              <div class="course-weak-list"><div v-for="topic in improveTopics.slice(0, 3)" :key="`overview-${topic.id}`" class="course-weak-row"><strong>{{ topic.title }}</strong><span :class="topic.priority.toLowerCase()">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span></div></div>
            </section>

          </div>

          <section v-else-if="activeTab === 'study'" class="study-breakdown" aria-labelledby="studyBreakdownTitle"><header class="study-breakdown-toolbar"><h2 id="studyBreakdownTitle">Topic Breakdown</h2><div class="study-breakdown-filters"><label class="study-filter-control section"><select v-model="sectionFilter"><option value="Math">Section: Math</option><option value="Reading and Writing">Section: Reading & Writing</option></select></label><label class="study-filter-control importance"><select v-model="priorityFilter"><option value="all">Importance: All</option><option value="core">Importance: Core</option><option value="likely">Importance: Likely</option><option value="possible">Importance: Possible</option></select></label></div></header><div class="study-priority-note"><svg class="icon"><use href="#i-target"/></svg><span>Importance combines the official SAT content-domain weight ({{ Math.round((manifest?.importanceModel.domainWeightContribution ?? 0.65) * 100) }}%) with mapped frequency across {{ (manifest?.importanceModel.sourceQuestionCount ?? 3879).toLocaleString() }} practice questions ({{ Math.round((manifest?.importanceModel.topicFrequencyContribution ?? 0.35) * 100) }}%). Study progress is tracked separately.</span></div><div v-if="loadError" class="study-topic-empty">{{ loadError }}</div><div v-else-if="!manifest" class="study-topic-empty">Loading SAT topics…</div><div v-else class="study-topic-sections"><section v-for="section in topicsBySection" :key="section.id" :class="['study-topic-section',{ collapsed:collapsedSections.has(section.id) }]" :aria-labelledby="section.id"><button class="study-section-head" type="button" :aria-expanded="!collapsedSections.has(section.id)" @click="toggleSection(section.id)"><h3 :id="section.id">{{ section.examSection }} · {{ section.title }}</h3><span class="study-section-meta"><span>{{ section.topics.length }} Topics</span><svg class="icon"><use href="#i-chevron"/></svg></span></button><div v-if="!collapsedSections.has(section.id)" role="table"><div class="study-topic-table-head" role="row"><span role="columnheader">Topic Area</span><span role="columnheader">Progress</span></div><article v-for="topic in section.topics" :key="topic.id" class="study-topic-row" role="row" tabindex="0"><div class="study-topic-copy" role="cell"><strong>{{ topic.title }}</strong><span>{{ topic.summary }}</span><div class="study-topic-meta"><span :class="['study-topic-importance',topic.priority.toLowerCase()]">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span><span>{{ topic.mappedQuestionCount }} mapped questions</span><span>{{ topic.domain }}</span></div></div><div class="study-topic-progress" role="cell"><span class="study-topic-progress-copy"><strong>{{ topicProgress(topic) ? 'In progress' : 'Not started' }}</strong><span>{{ topicProgressLabel(topic) }}</span></span><span class="study-topic-progress-meter"><strong>{{ topicProgress(topic) }}%</strong><span class="study-topic-progress-track"><i :class="{complete:topicProgress(topic)===100}" :style="{width:`${topicProgress(topic)}%`}"/></span></span></div><aside class="study-topic-popover"><div class="study-topic-popover-head"><h4>{{ topic.title }}</h4><span :class="topic.priority.toLowerCase()">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span></div><p>{{ topic.summary }}</p><p class="study-topic-importance-detail">{{ topic.domainWeightPercent }}% official domain weight · {{ topic.mappedQuestionCount }} mapped questions</p><small>Study with</small><div class="study-topic-actions"><button class="study-topic-tool" type="button" @click="openTopic(topic,'study-guide')"><svg class="icon"><use href="#i-book"/></svg><span>Study Guide</span></button><button class="study-topic-tool" type="button" @click="openTopic(topic,'flashcards')"><svg class="icon"><use href="#i-grid"/></svg><span>Flashcards</span></button><button class="study-topic-tool" type="button" @click="openTopic(topic,'quiz')"><svg class="icon"><use href="#i-exam"/></svg><span>Quiz</span></button></div></aside></article></div></section></div></section>

          <div v-else-if="activeTab === 'mock'" class="mock-state-shell">
            <header class="mock-exams-heading"><div><span class="course-hub-eyebrow">Full-length practice</span><h2>Mock exams</h2><p>Two complete Digital SAT simulations with official timing, four modules, and saved progress.</p></div><span class="mock-exam-count">2 exams</span></header>
            <div class="mock-exam-card-grid">
              <article class="mock-entry-card in-progress">
                <header class="mock-entry-head"><span class="mock-entry-number">Mock Exam 1</span><span class="mock-entry-state in-progress"><i/>In progress</span></header>
                <div class="mock-entry-copy"><h3>Digital SAT Full-Length Practice Test 1</h3><p>Resume your saved attempt from Reading and Writing, Module 1.</p></div>
                <div class="mock-entry-metrics"><span><strong>98</strong> questions</span><span><strong>134</strong> min</span><span><strong>4</strong> modules</span></div>
                <div class="mock-entry-progress"><div><span>Progress</span><strong>14 of 98 answered</strong></div><span class="mock-entry-progress-track"><i style="width:14.3%"/></span></div>
                <footer class="mock-entry-footer"><span>Answers saved automatically</span><button class="mock-primary-action" type="button" @click="startMockExam(1)">Continue Mock Exam 1</button></footer>
              </article>

              <article class="mock-entry-card not-started">
                <header class="mock-entry-head"><span class="mock-entry-number">Mock Exam 2</span><span class="mock-entry-state not-started"><i/>Not started</span></header>
                <div class="mock-entry-copy"><h3>Digital SAT Full-Length Practice Test 2</h3><p>Start a fresh full-length simulation with a different set of SAT questions.</p></div>
                <div class="mock-entry-metrics"><span><strong>98</strong> questions</span><span><strong>134</strong> min</span><span><strong>4</strong> modules</span></div>
                <div class="mock-entry-progress"><div><span>Progress</span><strong>0 of 98 answered</strong></div><span class="mock-entry-progress-track"><i style="width:0"/></span></div>
                <footer class="mock-entry-footer"><span>Ready when you are</span><button class="mock-secondary-action" type="button" @click="startMockExam(2)">Start Mock Exam 2</button></footer>
              </article>
            </div>
          </div>

          <div v-else class="results-experience">
            <header class="results-experience-head">
              <div><span class="course-hub-eyebrow">Latest completed attempt</span><h2>Results &amp; Improve</h2><p>Digital SAT Full-Length Practice Test 1 · {{ resultReport ? `Completed ${formatReportDate(resultReport.completedAt)}` : 'Loading attempt…' }}</p></div>
              <div class="results-view-switch" role="tablist" aria-label="Result views">
                <button type="button" role="tab" :aria-selected="resultView === 'score'" @click="setResultView('score')">Score Report</button>
                <button type="button" role="tab" :aria-selected="resultView === 'review'" @click="setResultView('review')">Question Review</button>
                <button type="button" role="tab" :aria-selected="resultView === 'improve'" @click="setResultView('improve')">Topics to Improve</button>
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
                <header class="report-section-heading"><div><h3 id="knowledgeReportTitle">Knowledge and Skills</h3><p>Performance across the 8 content domains measured on the SAT.</p></div><span>Mastery scale · 1–5</span></header>
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
                <header class="report-section-heading"><div><h3>Performance details</h3><p>Accuracy, module path, timing, and difficulty from this attempt.</p></div><span>{{ resultReport.schemaVersion }} · {{ resultReport.attemptId }}</span></header>
                <div class="report-stat-strip">
                  <div><span>Correct</span><strong>{{ resultReport.correct }}<small>/{{ reportQuestions.length }}</small></strong></div><div><span>Incorrect</span><strong>{{ resultReport.incorrect }}</strong></div><div><span>Unanswered</span><strong>{{ resultReport.omitted }}</strong></div><div><span>Accuracy</span><strong>{{ resultReport.accuracy }}%</strong></div><div><span>Time used</span><strong>{{ formatReportDuration(resultReport.durationSeconds) }}</strong></div>
                </div>
                <div class="module-performance-grid">
                  <article v-for="module in resultReport.modules" :key="`${module.sectionId}-${module.module}`" class="module-performance-card">
                    <header><div><span>{{ module.sectionTitle }}</span><h4>{{ module.module }}</h4></div><em :class="module.route">{{ module.route === 'harder' ? 'Harder path' : 'Common path' }}</em></header>
                    <div class="module-performance-counts"><span><b>{{ module.correct }}</b> correct</span><span><b>{{ module.incorrect }}</b> incorrect</span><span><b>{{ module.omitted }}</b> omitted</span></div>
                    <div class="module-accuracy-track"><i :style="{ width: `${module.accuracy}%` }"/></div>
                    <footer><span>{{ module.accuracy }}% accuracy</span><span>{{ formatReportTime(module.averageSeconds) }} avg / question</span></footer>
                  </article>
                </div>
                <div class="report-analysis-grid">
                  <article class="section-accuracy-card"><h4>Section accuracy</h4><div v-for="section in resultReport.sections" :key="`accuracy-${section.sectionId}`" class="section-accuracy-row"><div><strong>{{ section.sectionTitle }}</strong><span>{{ section.correct }} correct · {{ section.incorrect }} wrong · {{ section.omitted }} unanswered</span></div><span class="section-accuracy-track"><i :style="{ width: `${section.accuracy}%` }"/></span><b>{{ section.accuracy }}%</b></div></article>
                  <article class="difficulty-report-card"><h4>Time by difficulty</h4><div class="difficulty-report-groups"><div v-for="section in resultReport.sections" :key="`difficulty-${section.sectionId}`"><strong>{{ section.sectionTitle }}</strong><span v-for="difficulty in resultReport.difficulties.filter((item) => item.sectionId === section.sectionId)" :key="difficulty.difficulty"><em>{{ difficulty.difficulty }}</em><b>{{ difficulty.accuracy }}%</b><small>{{ formatReportTime(difficulty.averageSeconds) }} avg</small></span></div></div></article>
                </div>
              </section>

              <footer class="report-footer"><p>SAT® is a registered trademark of the College Board, which is not affiliated with or endorsed by this product. Practice scores are estimates, not official College Board scores.</p><div><button class="report-retake-button" type="button" @click="startMockExam(1)">Retake</button><button class="report-practice-button" type="button" @click="setResultView('improve')">Practice Weak Topics</button></div></footer>
            </div>

            <div v-else-if="resultView === 'review'" class="question-review-view">
              <header class="question-review-toolbar">
                <div class="question-review-filters" role="tablist" aria-label="Filter reviewed questions">
                  <button v-for="filter in (['ALL','INCORRECT','CORRECT','OMITTED'] as ReviewFilter[])" :key="filter" type="button" role="tab" :aria-selected="reviewFilter === filter" @click="setReviewFilter(filter)">{{ filter === 'ALL' ? 'All Questions' : reviewStatusLabel(filter) }} <span>({{ filter === 'ALL' ? reportQuestions.length : reportQuestions.filter((question) => question.status === filter).length }})</span></button>
                </div>
                <p>Every question is connected to the EP V2 section, module, domain, skill, difficulty, response type, score, and explanation fields.</p>
              </header>
              <div class="review-question-list">
                <article v-for="question in visibleReviewQuestions" :key="question.questionId" class="review-question-card">
                  <header class="review-question-header"><div><span>{{ reviewTypeLabel(question) }}</span><strong>Question {{ question.index + 1 }}</strong></div><div class="review-question-tags"><span>{{ question.sectionTitle }}</span><span>{{ question.module }}</span><span>{{ question.difficulty }}</span><em :class="question.status.toLowerCase()">{{ reviewStatusLabel(question.status) }}</em></div></header>
                  <h3>{{ question.stem }}</h3>
                  <div v-if="question.responseType === 'MULTIPLE_CHOICE'" class="review-option-list">
                    <div v-for="([answer, copy]) in optionEntries(question)" :key="answer" :class="['review-option', optionState(question, answer)]"><i>{{ answer }}</i><span>{{ copy }}</span><b v-if="answer === question.correctAnswer">Correct answer</b><b v-else-if="answer === question.userAnswer">Your answer</b></div>
                  </div>
                  <div v-else class="review-produced-response"><div><span>Your answer</span><strong :class="question.status.toLowerCase()">{{ question.userAnswer ?? 'No answer' }}</strong></div><div><span>Correct answer</span><strong class="correct">{{ question.correctAnswer }}</strong></div></div>
                  <section :class="['review-feedback-panel', question.status.toLowerCase()]"><header><span>{{ question.status === 'CORRECT' ? '✓' : question.status === 'INCORRECT' ? '×' : '–' }}</span><strong>{{ reviewStatusLabel(question.status) }}</strong><em>{{ question.earnedRawPoints }}/{{ question.maximumRawPoints }} point</em></header><p><b>Explanation:</b> {{ question.explanation }}</p></section>
                  <dl class="review-data-grid"><div><dt>Content domain</dt><dd>{{ question.contentDomain }}</dd></div><div><dt>Official skill</dt><dd>{{ question.officialSkill }}</dd></div><div><dt>Teaching topic</dt><dd>{{ question.teachingTopic }}</dd></div><div><dt>Route</dt><dd>{{ question.route }}</dd></div><div><dt>Time spent</dt><dd>{{ question.timeSpentSeconds ? formatReportTime(question.timeSpentSeconds) : '—' }}</dd></div><div><dt>Scoring</dt><dd>{{ question.isScored ? 'Scored' : 'Unscored' }} · {{ question.maximumRawPoints }} raw point</dd></div></dl>
                </article>
              </div>
              <button v-if="reviewLimit < filteredReviewQuestions.length" class="review-load-more" type="button" @click="reviewLimit += 6">Show 6 more questions <span>{{ filteredReviewQuestions.length - reviewLimit }} remaining</span></button>
              <div v-else-if="!visibleReviewQuestions.length" class="results-empty">No questions match this filter.</div>
              <footer class="report-footer"><p>SAT® is a registered trademark of the College Board, which is not affiliated with or endorsed by this product.</p><div><button class="report-retake-button" type="button" @click="startMockExam(1)">Retake</button><button class="report-practice-button" type="button" @click="setResultView('improve')">Practice Weak Topics</button></div></footer>
            </div>

            <div v-else class="topics-improve-view">
              <header class="topics-improve-toolbar"><div><span class="course-hub-eyebrow">Targeted next steps</span><h3>Topics to Improve</h3><p>Prioritized using question accuracy, time, and SAT exam importance.</p></div><div class="improve-section-switch" role="tablist" aria-label="Choose SAT section"><button type="button" role="tab" :aria-selected="improveSection === 'math'" @click="improveSection = 'math'">Math</button><button type="button" role="tab" :aria-selected="improveSection === 'reading-writing'" @click="improveSection = 'reading-writing'">Reading &amp; Writing</button></div></header>
              <div class="improve-priority-tabs" role="tablist" aria-label="Filter topic importance"><button v-for="filter in (['ALL','CORE','LIKELY','POSSIBLE'] as const)" :key="filter" type="button" role="tab" :aria-selected="improvePriority === filter" @click="improvePriority = filter">{{ filter.charAt(0) + filter.slice(1).toLowerCase() }}</button></div>
              <div class="improve-domain-list">
                <section v-for="group in improveGroups" :key="group.contentDomain" class="improve-domain-group"><header><i/><h4>{{ group.contentDomain }}</h4><span>{{ group.topics.length }} {{ group.topics.length === 1 ? 'topic' : 'topics' }}</span></header><div class="improve-topic-grid"><article v-for="topic in group.topics" :key="topic.id" class="improve-topic-card"><div><h5>{{ topic.title }}</h5><p>{{ topic.description }}</p></div><dl><div><dt>Accuracy</dt><dd>{{ topic.accuracy }}%</dd></div><div><dt>Attempts</dt><dd>{{ topic.attempts }}</dd></div><div><dt>Avg time</dt><dd>{{ formatReportTime(topic.averageSeconds) }}</dd></div></dl><footer><span :class="topic.priority.toLowerCase()">{{ topic.importanceScore }}% · {{ priorityLabel(topic.priority) }}</span><button type="button" @click="selectTab('study')">{{ topic.state === 'REVIEW' ? 'Review' : topic.state === 'CONTINUE' ? 'Continue' : 'Practice' }} →</button></footer></article></div></section>
              </div>
              <div v-if="!improveGroups.length" class="results-empty">No topics match this importance filter.</div>
              <footer class="report-footer"><p>Topic importance is separate from mastery: Core, Likely, and Possible describe exam relevance; accuracy and progress describe your performance.</p><div><button class="report-retake-button" type="button" @click="setResultView('score')">Back to report</button><button class="report-practice-button" type="button" @click="selectTab('study')">Open Study Plan</button></div></footer>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
