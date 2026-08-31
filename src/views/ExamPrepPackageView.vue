<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadSatManifest } from '../data/satData'
import type { SatManifest, SatTopic } from '../types/sat'

type PackageTab = 'overview' | 'study' | 'mock' | 'results'
type SectionFilter = 'all' | 'Reading and Writing' | 'Math'

const tabs: Array<{ key: PackageTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'study', label: 'Topic Breakdown' },
  { key: 'mock', label: 'Mock Exam' },
  { key: 'results', label: 'Results & Improve' },
]

const blueprint = [
  { title: 'Reading and Writing', duration: '64 min', questions: '54 questions', modules: '2 × 32 min', domains: 'Craft and Structure · Information and Ideas · Standard English Conventions · Expression of Ideas' },
  { title: 'Break', duration: '10 min', questions: 'Between sections', modules: 'Scheduled', domains: 'Take a break before the Math section begins.' },
  { title: 'Math', duration: '70 min', questions: '44 questions', modules: '2 × 35 min', domains: 'Algebra · Advanced Math · Problem-Solving and Data Analysis · Geometry and Trigonometry' },
]

const route = useRoute()
const router = useRouter()
const manifest = ref<SatManifest | null>(null)
const loadError = ref('')
const sectionFilter = ref<SectionFilter>('all')
const allowedTabs = new Set<PackageTab>(tabs.map((tab) => tab.key))
const tabFromRoute = () => allowedTabs.has(route.query.tab as PackageTab) ? route.query.tab as PackageTab : 'overview'
const activeTab = ref<PackageTab>(tabFromRoute())

const topicsBySection = computed(() => {
  if (!manifest.value) return []
  const byId = new Map(manifest.value.topics.map((topic) => [topic.id, topic]))
  return manifest.value.sections
    .filter((section) => sectionFilter.value === 'all' || section.examSection === sectionFilter.value)
    .map((section) => ({ ...section, topics: section.topicIds.map((id) => byId.get(id)).filter(Boolean) as SatTopic[] }))
})

watch(() => route.query.tab, () => { activeTab.value = tabFromRoute() })

function selectTab(tab: PackageTab) {
  activeTab.value = tab
  void router.replace({ name: 'package', query: tab === 'overview' ? {} : { tab } })
}

function startMockExam(examId = 1) {
  void router.push({ name: 'mock-exam', params: { examId } })
}

function openTopic(topic: SatTopic, tool: 'study-guide' | 'flashcards' | 'quiz') {
  void router.push({ name: tool, params: { topicId: topic.id } })
}

onMounted(async () => {
  document.body.classList.add('package-route')
  try {
    manifest.value = await loadSatManifest()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load SAT materials.'
  }
})
onBeforeUnmount(() => document.body.classList.remove('package-route'))
</script>

<template>
  <div class="prep-app-shell">
    <aside class="prep-sidebar" aria-label="Primary navigation">
      <div class="prep-brand-row"><img src="/assets/solvely-ai-logo.jpeg" alt="" width="28" height="28" /><strong>Solvely.ai</strong><span class="prep-sidebar-toggle" aria-hidden="true">‹</span></div>
      <nav class="prep-nav" aria-label="Solvely areas">
        <span class="prep-nav-item is-muted" aria-disabled="true"><svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" /></svg>Home</span>
        <span class="prep-nav-item is-muted" aria-disabled="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z" /></svg>AI Study</span>
        <span class="prep-nav-item is-active" aria-current="page"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 8h8M8 12h4M16 14l2 2M18 14l-2 2" /></svg>Exam Prep</span>
        <span class="prep-nav-item is-muted" aria-disabled="true"><svg viewBox="0 0 24 24"><path d="m15 4 5 5L8 21l-5-5zM6 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /></svg>AI Writing Tools</span>
      </nav>
      <div class="prep-sidebar-spacer" />
      <div class="prep-sidebar-note"><span>Focused demo</span><p>Only the SAT exam-prep package is enabled.</p></div>
      <div class="prep-user-row"><span class="prep-avatar">A</span><span><strong>Anna</strong><small>Student</small></span><span class="prep-user-more">•••</span></div>
    </aside>

    <main class="prep-main">
      <header class="prep-topbar"><div><span class="prep-mobile-brand">Solvely.ai</span><strong>Exam Prep</strong></div><span class="prep-demo-badge">SAT PACKAGE DEMO</span></header>
      <section class="prep-workspace" aria-labelledby="packageTitle">
        <header class="package-hero">
          <div class="package-hero-copy">
            <p class="package-breadcrumb"><span>Exam Prep</span><i />Digital SAT</p>
            <div class="package-title-row"><span class="package-icon"><svg viewBox="0 0 24 24"><path d="M5 4.5h14v15H5zM8 8h8M8 12h5M8 16h3" /></svg></span><div><span class="package-kicker">SOLVELY PREP PACKAGE</span><h1 id="packageTitle">Digital SAT Exam Prep</h1></div></div>
            <p class="package-description">A complete SAT learning path with video-led study guides, active-recall flashcards, topic quizzes, and realistic full-length mock exams.</p>
            <div class="package-metrics" aria-label="Package contents">
              <span><strong>{{ manifest?.totals.topics ?? 100 }}</strong> topics</span><span><strong>{{ manifest?.totals.flashcards ?? 2000 }}</strong> flashcards</span><span><strong>{{ manifest?.totals.quizQuestions ?? 3879 }}</strong> practice questions</span><span><strong>2</strong> mock exams</span>
            </div>
          </div>
          <aside class="package-progress" aria-label="Course progress"><div class="package-progress-head"><span>Package progress</span><strong>0%</strong></div><div class="package-progress-track"><i /></div><p>Take a baseline exam or start with any SAT topic.</p><button type="button" @click="startMockExam(1)">Start Mock Exam 1 <span>→</span></button></aside>
        </header>

        <nav class="package-tabs" role="tablist" aria-label="Exam prep package sections"><button v-for="tab in tabs" :key="tab.key" type="button" role="tab" :aria-selected="activeTab === tab.key" @click="selectTab(tab.key)">{{ tab.label }}</button></nav>

        <section class="package-panel" role="tabpanel" aria-live="polite">
          <div v-if="activeTab === 'overview'" class="overview-page">
            <div class="overview-layout">
              <section class="next-action-card"><div class="next-action-copy"><span class="section-eyebrow">YOUR FIRST STEP</span><h2>Build a baseline with a full Digital SAT</h2><p>Practice the real four-module flow with timing, navigation, annotation tools, calculator access, a scheduled break, and results analysis.</p><div class="next-action-meta"><span><strong>98</strong> questions</span><span><strong>4</strong> modules</span><span><strong>2h 14m</strong> testing</span></div></div><button type="button" class="primary-action" @click="startMockExam(1)">Start Mock Exam 1 <span>→</span></button></section>
              <section class="package-path"><header><span class="section-eyebrow">YOUR PACKAGE</span><h2>Learn, recall, apply, measure</h2></header><ol><li class="is-ready"><i>1</i><span><strong>Study a topic</strong><small>Watch the lesson and read its complete guide.</small></span><b>Ready</b></li><li class="is-ready"><i>2</i><span><strong>Recall with flashcards</strong><small>Flip, star, review, and master 20 cards.</small></span><b>Ready</b></li><li class="is-ready"><i>3</i><span><strong>Apply with quizzes</strong><small>Answer real SAT-style questions with explanations.</small></span><b>Ready</b></li><li class="is-ready"><i>4</i><span><strong>Measure with mock exams</strong><small>Complete either 98-question practice test.</small></span><b>Ready</b></li></ol></section>
            </div>
            <section class="exam-blueprint"><header><div><span class="section-eyebrow">CURRENT DIGITAL SAT</span><h2>Exam structure at a glance</h2></div><span class="blueprint-total"><strong>134 min</strong> · 98 questions · 400–1600</span></header><div class="blueprint-grid"><article v-for="item in blueprint" :key="item.title" :class="{ break: item.title === 'Break' }"><span>{{ item.duration }}</span><h3>{{ item.title }}</h3><strong>{{ item.questions }}</strong><b>{{ item.modules }}</b><p>{{ item.domains }}</p></article></div><p class="blueprint-note">Reading and Writing and Math are both adaptive: performance in Module 1 determines the relative difficulty of Module 2. Both modules count toward the section score.</p></section>
          </div>

          <div v-else-if="activeTab === 'study'" class="study-plan-page">
            <header class="study-plan-head"><div><span class="section-eyebrow">100-TOPIC SAT CURRICULUM</span><h2>Topic Breakdown</h2><p>Every topic includes its own video lesson, study guide, 20 flashcards, and mapped SAT question bank.</p></div><div class="study-section-filter" role="group" aria-label="Filter topics"><button v-for="filter in (['all', 'Reading and Writing', 'Math'] as SectionFilter[])" :key="filter" type="button" :class="{ active: sectionFilter === filter }" @click="sectionFilter = filter">{{ filter === 'all' ? 'All topics' : filter }}</button></div></header>
            <div v-if="loadError" class="package-data-state"><strong>Unable to load SAT materials</strong><p>{{ loadError }}</p></div>
            <div v-else-if="!manifest" class="package-data-state"><span class="package-loader" />Loading all SAT topics…</div>
            <div v-else class="topic-breakdown">
              <section v-for="section in topicsBySection" :key="section.id" class="breakdown-section"><header><div><span>{{ section.examSection }}</span><h3>{{ section.title }}</h3></div><b>{{ section.topics.length }} topics</b></header><div class="breakdown-topics"><article v-for="topic in section.topics" :key="topic.id"><span class="topic-number">{{ String(topic.order).padStart(2, '0') }}</span><div class="breakdown-topic-copy"><span>{{ topic.skill }}</span><h4>{{ topic.title }}</h4><p>{{ topic.summary }}</p></div><div class="breakdown-actions"><button type="button" @click="openTopic(topic, 'study-guide')"><b>Study Guide</b><small>Video + lesson</small></button><button type="button" @click="openTopic(topic, 'flashcards')"><b>Flashcards</b><small>{{ topic.flashcards.length }} cards</small></button><button type="button" @click="openTopic(topic, 'quiz')"><b>Quiz</b><small>{{ topic.quizCount }} questions</small></button></div></article></div></section>
            </div>
          </div>

          <div v-else-if="activeTab === 'mock'" class="mock-library">
            <header class="mock-library-head"><span class="section-eyebrow">FULL-LENGTH PRACTICE</span><h2>Digital SAT Mock Exams</h2><p>Each form contains 98 unique questions across the official four-module structure.</p></header>
            <div class="mock-exam-grid"><article v-for="examId in 2" :key="examId" class="mock-entry-card"><span class="mock-status">READY TO START</span><h2>Digital SAT Mock Exam {{ examId }}</h2><p>Complete Reading and Writing, the scheduled break, and Math in a test-day interface.</p><div class="mock-entry-metrics"><div><span>Questions</span><strong>98</strong></div><div><span>Modules</span><strong>4</strong></div><div><span>Test time</span><strong>134 min</strong></div></div><button type="button" class="primary-action mock-start" @click="startMockExam(examId)">Start exam {{ examId }} <span>→</span></button></article></div>
          </div>

          <div v-else class="locked-panel results-empty"><span class="locked-icon results"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V5M16 20v-8M22 20H2" /></svg></span><span class="section-eyebrow">NO RESULT YET</span><h2>Your score report will appear here</h2><p>Finish a mock exam to unlock section scores, answer review, pacing insights, and the topics most likely to improve your score.</p><button type="button" class="primary-action" @click="startMockExam(1)">Start mock exam <span>→</span></button></div>
        </section>
      </section>
    </main>
  </div>
</template>
