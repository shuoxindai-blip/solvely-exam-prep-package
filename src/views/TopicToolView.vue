<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadSatManifest, loadTopicContent, loadTopicQuiz } from '../data/satData'
import { loadActManifest, loadActTopicContent, loadActTopicQuiz } from '../data/actData'
import { loadApManifest, loadApTopicContent, loadApTopicQuiz } from '../data/apData'
import { loadImprovePracticeProgress, saveImprovePracticeProgress } from '../data/improvePracticeProgress'
import AskSolvelyPanel from '../components/AskSolvelyPanel.vue'
import CommercialDemoController from '../components/CommercialDemoController.vue'
import ProPaywall from '../components/ProPaywall.vue'
import { useProAccess } from '../composables/useProAccess'
import type { EpFlashCardContent, EpQuestion, EpStudyGuideContent } from '../types/epV2'
import type { SatFlashcard, SatManifest, SatQuizQuestion, SatTopic } from '../types/sat'

type ToolMode = 'study-guide' | 'flashcards' | 'quiz'
type CardStatus = 'unseen' | 'review' | 'mastered'
type TopicPriorityFilter = 'ALL' | SatTopic['priority']

const route = useRoute()
const router = useRouter()
const { accessState, isProMember, setProAccess } = useProAccess()
const isActPackage = computed(() => String(route.query.exam || '').toLowerCase() === 'act')
const isApPackage = computed(() => String(route.query.exam || '').toLowerCase() === 'ap-calculus-bc')
const examName = computed(() => isApPackage.value ? 'AP Calculus BC' : isActPackage.value ? 'ACT' : 'SAT')
const packageHash = computed(() => isApPackage.value ? '#course-2' : isActPackage.value ? '#course-1' : '#course-0')
const examRouteQuery = computed(() => isApPackage.value ? { exam: 'ap-calculus-bc' } : isActPackage.value ? { exam: 'act' } : {})
const manifest = ref<SatManifest | null>(null)
const loadError = ref('')
const collapsedSections = ref(new Set<string>())
const cardIndex = ref(0)
const cardFlipped = ref(false)
const cardView = ref<'card' | 'list'>('card')
const cardStatuses = ref<Record<string, CardStatus>>({})
const starredCards = ref(new Set<string>())
const studyGuideContent = ref<EpStudyGuideContent | null>(null)
const studyPracticeIndex = ref(0)
const studyPracticeSelectedAnswer = ref<string | null>(null)
const studyPracticeWrittenResponse = ref('')
const studyPracticeWrittenSubmitted = ref(false)
const studyPracticeLoading = ref(false)
const flashCardContent = ref<EpFlashCardContent | null>(null)
const quizQuestions = ref<SatQuizQuestion[]>([])
const contentLoading = ref(false)
const quizLoading = ref(false)
const quizIndex = ref(0)
const selectedAnswer = ref<number | null>(null)
const shortAnswer = ref('')
const shortAnswerChecked = ref(false)
const iframeLoaded = ref(false)
const improvePracticeProgress = ref(0)
const askSolvelyOpen = ref(false)
const askSolvelyPanelWidth = ref(344)
const topicPriorityFilter = ref<TopicPriorityFilter>('ALL')
const paywallOpen = ref(false)
const paywallContext = ref('the complete exam prep experience')
let pendingCommercialAction: (() => void) | null = null

const mode = computed<ToolMode>(() => {
  const name = String(route.name)
  return name === 'flashcards' || name === 'quiz' ? name : 'study-guide'
})
const isImprovePractice = computed(() => route.query.source === 'improve')
const topicId = computed(() => String(route.params.topicId || ''))
const topic = computed(() => manifest.value?.topics.find((item) => item.id === topicId.value) ?? null)
const studyGuide = computed(() => studyGuideContent.value?.payload.content ?? null)
const video = computed(() => studyGuideContent.value?.payload.videoLesson ?? null)
const studyPracticeQuestions = computed<EpQuestion[]>(() => studyGuideContent.value?.payload.items ?? [])
const studyPracticeQuestion = computed(() => studyPracticeQuestions.value[studyPracticeIndex.value] ?? null)
const studyPracticeOptions = computed(() => Object.entries(studyPracticeQuestion.value?.options ?? {}).sort(([left], [right]) => left.localeCompare(right)))
const studyPracticeHasOptions = computed(() => studyPracticeOptions.value.length > 0)
const studyPracticeAnswered = computed(() => studyPracticeHasOptions.value ? studyPracticeSelectedAnswer.value !== null : studyPracticeWrittenSubmitted.value)
const studyPracticeCorrect = computed(() => studyPracticeSelectedAnswer.value !== null && studyPracticeSelectedAnswer.value === studyPracticeQuestion.value?.correctAnswer)
const flashcards = computed<SatFlashcard[]>(() => flashCardContent.value?.payload.cards.map((card) => ({
  flashcard_id: String(card.id),
  front: card.info,
  back: card.backInfo,
  image_markdown: card.imageMarkdown,
})) ?? [])
const currentCard = computed(() => flashcards.value[cardIndex.value] ?? null)
const currentQuestion = computed(() => quizQuestions.value[quizIndex.value] ?? null)
const selectedCorrect = computed(() => selectedAnswer.value !== null && selectedAnswer.value === currentQuestion.value?.correctIndex)
const orderedTopics = computed(() => [...(manifest.value?.topics ?? [])].sort((left, right) => left.order - right.order))
const filteredOrderedTopics = computed(() => topicPriorityFilter.value === 'ALL'
  ? orderedTopics.value
  : orderedTopics.value
      .filter((item) => item.priority === topicPriorityFilter.value)
      .sort((left, right) => right.importanceScore - left.importanceScore || left.order - right.order))
const navigationTopics = computed(() => isImprovePractice.value ? orderedTopics.value : filteredOrderedTopics.value)
const currentTopicPosition = computed(() => navigationTopics.value.findIndex((item) => item.id === topic.value?.id))
const isLastTopic = computed(() => currentTopicPosition.value === navigationTopics.value.length - 1)
const nextStudyTopic = computed(() => navigationTopics.value[currentTopicPosition.value + 1] ?? null)
const hasAnotherStudyPractice = computed(() => studyPracticeIndex.value < studyPracticeQuestions.value.length - 1)
const isLastQuizQuestion = computed(() => quizIndex.value === quizQuestions.value.length - 1)
const isImproveReview = computed(() => isImprovePractice.value && quizQuestions.value.length > 0 && improvePracticeProgress.value >= quizQuestions.value.length)
let studyPracticeTimer: number | undefined

const topicsBySection = computed(() => {
  if (!manifest.value) return []
  const byId = new Map(manifest.value.topics.map((item) => [item.id, item]))
  return manifest.value.sections.map((section) => ({ ...section, topics: section.topicIds.map((id) => byId.get(id)).filter(Boolean) as SatTopic[] }))
})
const sidebarTopicGroups = computed(() => {
  if (topicPriorityFilter.value === 'ALL') return topicsBySection.value.map((section) => ({ ...section, filtered: false }))
  return [{
    id: `priority-${topicPriorityFilter.value.toLowerCase()}`,
    title: topicPriorityFilter.value,
    examSection: '',
    topicIds: filteredOrderedTopics.value.map((item) => item.id),
    topics: filteredOrderedTopics.value,
    filtered: true,
  }]
})
const visibleTopicCount = computed(() => filteredOrderedTopics.value.length)

const toolLabel = computed(() => mode.value === 'study-guide' ? 'Study Guide' : mode.value === 'flashcards' ? 'Flashcards' : 'Quiz')
const cardStatusCounts = computed(() => {
  const counts = { unseen: 0, review: 0, mastered: 0 }
  for (const card of flashcards.value) counts[cardStatuses.value[card.flashcard_id] || 'unseen'] += 1
  return counts
})

function toolRoute(tool: ToolMode, target = topic.value) {
  if (!target) return
  void router.push({ name: tool, params: { topicId: target.id }, query: { access: accessState.value, ...examRouteQuery.value } })
}

function openCommercialPaywall(context: string, action?: () => void) {
  paywallContext.value = context
  pendingCommercialAction = action ?? null
  paywallOpen.value = true
}

function openStudyGuidePaywall() {
  openCommercialPaywall('the complete video lesson, Study Guide, and Quick Practice')
}

function closeCommercialPaywall() {
  paywallOpen.value = false
  pendingCommercialAction = null
}

function unlockPro() {
  const action = pendingCommercialAction
  pendingCommercialAction = null
  paywallOpen.value = false
  setProAccess('member')
  if (action) void nextTick(action)
}

function backToPackage() {
  void router.push(isImprovePractice.value
    ? { name: 'package', query: { tab: 'results', view: 'improve', access: accessState.value, ...examRouteQuery.value }, hash: packageHash.value }
    : { name: 'package', query: { tab: 'study', access: accessState.value, ...examRouteQuery.value }, hash: packageHash.value })
}

function chooseTopic(target: SatTopic) {
  toolRoute(mode.value, target)
}

function setTopicPriorityFilter(filter: TopicPriorityFilter) {
  topicPriorityFilter.value = filter
  collapsedSections.value = new Set()
  if (filter === 'ALL' || topic.value?.priority === filter) return
  const firstMatch = filteredOrderedTopics.value[0]
  if (firstMatch) chooseTopic(firstMatch)
}

function toggleSection(id: string) {
  const next = new Set(collapsedSections.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsedSections.value = next
}

function markCard(status: CardStatus) {
  if (!currentCard.value) return
  cardStatuses.value = { ...cardStatuses.value, [currentCard.value.flashcard_id]: status }
  if (cardIndex.value < flashcards.value.length - 1) nextCard()
}

function nextCard() {
  if (!flashcards.value.length) return
  if (!isProMember.value && flashcards.value.length > 1) {
    openCommercialPaywall(`all flashcards for this ${examName.value} topic`, nextCard)
    return
  }
  cardIndex.value = (cardIndex.value + 1) % flashcards.value.length
  cardFlipped.value = false
}

function previousCard() {
  if (!flashcards.value.length) return
  if (!isProMember.value && flashcards.value.length > 1) {
    openCommercialPaywall(`all flashcards for this ${examName.value} topic`, previousCard)
    return
  }
  cardIndex.value = (cardIndex.value - 1 + flashcards.value.length) % flashcards.value.length
  cardFlipped.value = false
}

function shuffleCards() {
  if (!flashcards.value.length) return
  if (!isProMember.value && flashcards.value.length > 1) {
    openCommercialPaywall(`all flashcards for this ${examName.value} topic`, shuffleCards)
    return
  }
  cardIndex.value = Math.floor(Math.random() * flashcards.value.length)
  cardFlipped.value = false
}

function setCardView(view: 'card' | 'list') {
  if (view === 'list' && !isProMember.value) {
    openCommercialPaywall('the complete flashcard deck', () => setCardView(view))
    return
  }
  cardView.value = view
}

function toggleStar() {
  if (!currentCard.value) return
  const next = new Set(starredCards.value)
  next.has(currentCard.value.flashcard_id) ? next.delete(currentCard.value.flashcard_id) : next.add(currentCard.value.flashcard_id)
  starredCards.value = next
}

function toggleCardStar(card: SatFlashcard) {
  const next = new Set(starredCards.value)
  next.has(card.flashcard_id) ? next.delete(card.flashcard_id) : next.add(card.flashcard_id)
  starredCards.value = next
}

function normalize(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function chooseAnswer(index: number) {
  if (selectedAnswer.value !== null) return
  selectedAnswer.value = index
  recordImprovePracticeAnswer()
}

function chooseStudyPracticeAnswer(answer: string) {
  if (studyPracticeSelectedAnswer.value !== null) return
  studyPracticeSelectedAnswer.value = answer
}

function submitStudyPracticeWrittenResponse() {
  if (!studyPracticeWrittenResponse.value.trim() || studyPracticeWrittenSubmitted.value) return
  studyPracticeWrittenSubmitted.value = true
}

function clearStudyPracticeAnswer() {
  studyPracticeSelectedAnswer.value = null
  studyPracticeWrittenResponse.value = ''
  studyPracticeWrittenSubmitted.value = false
}

function clearStudyPracticeTimer() {
  if (studyPracticeTimer !== undefined) window.clearTimeout(studyPracticeTimer)
  studyPracticeTimer = undefined
}

function resetStudyPractice() {
  clearStudyPracticeTimer()
  studyPracticeIndex.value = 0
  clearStudyPracticeAnswer()
  studyPracticeLoading.value = false
}

function tryAnotherStudyPractice() {
  if (!hasAnotherStudyPractice.value || studyPracticeLoading.value) return
  clearStudyPracticeTimer()
  clearStudyPracticeAnswer()
  studyPracticeLoading.value = true
  studyPracticeTimer = window.setTimeout(() => {
    studyPracticeIndex.value += 1
    studyPracticeLoading.value = false
    studyPracticeTimer = undefined
  }, 650)
}

function advanceStudyTopic() {
  if (studyPracticeLoading.value) return
  if (isLastTopic.value) {
    void router.push({ name: 'package', query: { tab: 'study', ...examRouteQuery.value }, hash: packageHash.value })
    return
  }
  if (!nextStudyTopic.value) return
  clearStudyPracticeTimer()
  clearStudyPracticeAnswer()
  studyPracticeLoading.value = true
  const targetTopicId = nextStudyTopic.value.id
  studyPracticeTimer = window.setTimeout(() => {
    studyPracticeTimer = undefined
    void router.push({ name: 'study-guide', params: { topicId: targetTopicId }, query: examRouteQuery.value })
  }, 650)
}

function checkShortAnswer() {
  if (shortAnswer.value.trim()) {
    shortAnswerChecked.value = true
    recordImprovePracticeAnswer()
  }
}

function recordImprovePracticeAnswer() {
  if (!isImprovePractice.value || !topic.value || isImproveReview.value) return
  improvePracticeProgress.value = Math.max(improvePracticeProgress.value, quizIndex.value + 1)
  saveImprovePracticeProgress(topic.value.id, improvePracticeProgress.value)
}

function nextQuestion() {
  if (!quizQuestions.value.length) return
  if (!isProMember.value && quizIndex.value === 0) {
    openCommercialPaywall('the remaining questions and explanations in this Topic Quiz', nextQuestion)
    return
  }
  if (isImprovePractice.value && isLastQuizQuestion.value) {
    improvePracticeProgress.value = quizQuestions.value.length
    if (topic.value) saveImprovePracticeProgress(topic.value.id, improvePracticeProgress.value)
    backToPackage()
    return
  }
  quizIndex.value = (quizIndex.value + 1) % quizQuestions.value.length
  selectedAnswer.value = null
  shortAnswer.value = ''
  shortAnswerChecked.value = false
  void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

function answerLetter(index: number) {
  return currentQuestion.value?.optionLabels?.[index] ?? String.fromCharCode(65 + index)
}

function inlineMarkup(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

async function loadQuiz() {
  if (!topic.value || mode.value !== 'quiz') return
  quizLoading.value = true
  try {
    quizQuestions.value = await (isApPackage.value ? loadApTopicQuiz(topic.value.id) : isActPackage.value ? loadActTopicQuiz(topic.value.id) : loadTopicQuiz(topic.value.id))
    improvePracticeProgress.value = isImprovePractice.value ? (loadImprovePracticeProgress()[topic.value.id] ?? 0) : 0
    quizIndex.value = isImprovePractice.value && improvePracticeProgress.value > 0 && improvePracticeProgress.value < quizQuestions.value.length ? improvePracticeProgress.value : 0
    selectedAnswer.value = null
    shortAnswer.value = ''
    shortAnswerChecked.value = false
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load the quiz.'
  } finally {
    quizLoading.value = false
  }
}

async function loadActiveContent() {
  if (!topic.value) return
  loadError.value = ''
  if (mode.value === 'quiz') {
    await loadQuiz()
    return
  }

  contentLoading.value = true
  try {
    if (mode.value === 'study-guide') {
      studyGuideContent.value = await (isApPackage.value ? loadApTopicContent(topic.value.id, 'studyGuide') : isActPackage.value ? loadActTopicContent(topic.value.id, 'studyGuide') : loadTopicContent(topic.value.id, 'studyGuide')) as EpStudyGuideContent
    } else {
      flashCardContent.value = await (isApPackage.value ? loadApTopicContent(topic.value.id, 'flashCard') : isActPackage.value ? loadActTopicContent(topic.value.id, 'flashCard') : loadTopicContent(topic.value.id, 'flashCard')) as EpFlashCardContent
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : `Unable to load ${toolLabel.value}.`
  } finally {
    contentLoading.value = false
  }
}

watch([topicId, mode], () => {
  cardIndex.value = 0
  cardFlipped.value = false
  cardView.value = 'card'
  iframeLoaded.value = false
  resetStudyPractice()
  void loadActiveContent()
})

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, button, select, [contenteditable]')) return
  if (mode.value === 'flashcards' && event.code === 'Space') {
    event.preventDefault()
    cardFlipped.value = !cardFlipped.value
  }
  if (mode.value === 'flashcards' && event.key === 'ArrowRight') nextCard()
  if (mode.value === 'flashcards' && event.key === 'ArrowLeft') previousCard()
}

onMounted(async () => {
  document.body.classList.add('topic-tool-route')
  window.addEventListener('keydown', onKeydown)
  try {
    manifest.value = await (isApPackage.value ? loadApManifest() : isActPackage.value ? loadActManifest() : loadSatManifest())
    if (!topic.value && manifest.value.topics[0]) await router.replace({ name: mode.value, params: { topicId: manifest.value.topics[0].id }, query: examRouteQuery.value })
    await loadActiveContent()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : `Unable to load ${examName.value} materials.`
  }
})

onBeforeUnmount(() => {
  clearStudyPracticeTimer()
  document.body.classList.remove('topic-tool-route')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div :class="['topic-tool-shell', { 'ask-solvely-open': askSolvelyOpen }]" :style="{ '--ask-panel-width': `${askSolvelyPanelWidth}px` }">
    <header class="topic-tool-header">
      <button class="topic-back-button" type="button" @click="backToPackage" :aria-label="`Back to ${examName} exam prep`">←</button>
      <button class="topic-package-button" type="button" @click="backToPackage">
        <img src="/assets/solvely-ai-logo.jpeg" alt="" width="27" height="27" />
        <span><strong>{{ isApPackage ? 'AP Calculus BC Exam Prep' : isActPackage ? 'ACT Exam Prep' : 'Digital SAT Exam Prep' }}</strong><small>{{ isImprovePractice ? 'Targeted Practice' : toolLabel }}</small></span>
      </button>
      <nav v-if="!isImprovePractice" class="topic-mode-switch" aria-label="Topic study tools">
        <button :class="{ active: mode === 'study-guide' }" type="button" @click="toolRoute('study-guide')">Study Guide</button>
        <button :class="{ active: mode === 'flashcards' }" type="button" @click="toolRoute('flashcards')">Flashcards</button>
        <button :class="{ active: mode === 'quiz' }" type="button" @click="toolRoute('quiz')">Quiz</button>
      </nav>
      <span v-else class="topic-practice-only-label">Quiz only</span>
      <span class="topic-material-count">{{ isImprovePractice ? `${topic?.quizCount ?? 0} questions` : `${manifest?.totals.topics ?? (isApPackage ? 49 : isActPackage ? 235 : 100)} ${examName} topics` }}</span>
    </header>

    <div v-if="loadError" class="topic-load-state"><strong>Unable to load {{ examName }} materials</strong><p>{{ loadError }}</p></div>
    <div v-else-if="!manifest || !topic" class="topic-load-state"><span class="topic-loader" /><strong>Loading {{ examName }} materials…</strong></div>

    <div v-else :class="['topic-tool-layout',{ 'practice-only': isImprovePractice }]">
      <aside v-if="!isImprovePractice" class="topic-sidebar" :aria-label="`${examName} topics`">
        <div class="topic-sidebar-heading"><span>Topics</span><strong>{{ visibleTopicCount }}</strong></div>
        <div class="topic-priority-filter" role="group" aria-label="Filter topics by priority">
          <button
            v-for="filter in ['ALL', 'CORE', 'LIKELY', 'POSSIBLE'] as TopicPriorityFilter[]"
            :key="filter"
            :class="filter.toLowerCase()"
            type="button"
            :aria-pressed="topicPriorityFilter === filter"
            @click="setTopicPriorityFilter(filter)"
          >
            <i v-if="filter !== 'ALL'" />{{ filter.charAt(0) + filter.slice(1).toLowerCase() }}
          </button>
        </div>
        <div class="topic-sidebar-stats">
          <span><strong>{{ manifest.totals.flashcards }}</strong> flashcards</span>
          <span><strong>{{ manifest.totals.quizQuestions }}</strong> questions</span>
        </div>
        <div class="topic-sidebar-groups">
          <section v-for="section in sidebarTopicGroups" :key="section.id" :class="['topic-sidebar-group', { filtered: section.filtered }]">
            <button v-if="!section.filtered" type="button" class="topic-section-toggle" :aria-expanded="!collapsedSections.has(section.id)" @click="toggleSection(section.id)">
              <span><small>{{ section.examSection }}</small><strong>{{ section.title }}</strong></span>
              <b>{{ section.topics.length }}</b>
              <i>⌄</i>
            </button>
            <div v-if="!collapsedSections.has(section.id)" class="topic-sidebar-list">
              <button v-for="item in section.topics" :key="item.id" type="button" :class="{ active: item.id === topic.id }" @click="chooseTopic(item)">
                <span class="topic-state-dot" />
                <span><strong>{{ item.title }}</strong><small>{{ mode === 'study-guide' ? item.strategyName : mode === 'flashcards' ? `${item.flashcardCount} cards` : `${item.quizCount} questions` }}</small></span>
              </button>
            </div>
          </section>
        </div>
      </aside>

      <main class="topic-main">
        <header class="topic-main-head">
          <div>
            <p><span>{{ topic.section }}</span><i />{{ topic.skill }}</p>
            <h1>{{ topic.title }}</h1>
            <span class="topic-summary">{{ topic.summary }}</span>
          </div>
          <div class="topic-head-meta">
            <span v-if="mode === 'study-guide'"><strong>{{ studyGuide?.sections.length ?? 0 }}</strong> guide sections<small>{{ topic.studyGuidePracticeCount }} Quick Practice</small></span>
            <span v-else-if="mode === 'flashcards'"><strong>{{ topic.flashcardCount }}</strong> cards</span>
            <span v-else><strong>{{ topic.quizCount }}</strong> questions</span>
          </div>
        </header>

        <div v-if="contentLoading" class="topic-load-state inline"><span class="topic-loader" /><strong>Loading {{ toolLabel }}…</strong></div>

        <article v-else-if="mode === 'study-guide' && studyGuide && video" class="study-guide-view">
          <p class="study-guide-section-label">Video Lesson</p>
          <section :class="['topic-video-card', { 'commercial-locked': !isProMember }]" aria-labelledby="topicVideoTitle">
            <header><div><h2 id="topicVideoTitle">{{ video.title }}</h2><span>{{ video.description }}</span></div><a :href="video.playbackUrl" target="_blank" rel="noopener">Open video ↗</a></header>
            <div class="topic-video-frame" :class="{ loaded: iframeLoaded && isProMember }">
              <img :src="video.coverUrl" :alt="`${video.title} video cover`" />
              <span v-if="isProMember" class="video-loading">Loading interactive lesson…</span>
              <iframe v-if="isProMember" :src="video.playbackUrl" :title="video.title" loading="eager" allow="fullscreen" @load="iframeLoaded = true" />
            </div>
            <button v-if="!isProMember" class="topic-video-paywall-hitarea" type="button" aria-label="Unlock this video lesson with Solvely Pro" @click="openStudyGuidePaywall" />
          </section>

          <p class="study-guide-section-label exam-essentials">Exam Essentials</p>
          <div :class="['study-guide-content-gate', { locked: !isProMember }]">
            <div class="study-guide-gated-content" :inert="!isProMember">
            <section class="guide-article">
            <div class="guide-overview"><span>OVERVIEW</span><p>{{ studyGuide.overview }}</p></div>
            <section v-if="studyGuide.learning_objectives?.length" class="guide-objectives">
              <h2>What you'll learn</h2>
              <ul><li v-for="objective in studyGuide.learning_objectives" :key="objective">{{ objective }}</li></ul>
            </section>
            <section v-for="section in studyGuide.sections" :key="section.title" class="guide-section">
              <h2>{{ section.title }}</h2>
              <p v-html="inlineMarkup(section.content)" />
            </section>
            <section v-for="(example, index) in studyGuide.worked_examples" :key="example.question" class="worked-example">
              <span>WORKED EXAMPLE {{ index + 1 }}</span>
              <h3>{{ example.question }}</h3>
              <p v-html="inlineMarkup(example.solution)" />
            </section>
            <div class="guide-two-column">
              <section><h2>Common mistakes</h2><ul><li v-for="mistake in studyGuide.common_mistakes" :key="mistake">{{ mistake }}</li></ul></section>
              <section><h2>Exam tips</h2><ul><li v-for="tip in studyGuide.exam_tips" :key="tip">{{ tip }}</li></ul></section>
            </div>
            <section class="guide-recap"><span>KEY TAKEAWAY</span><p>{{ studyGuide.recap }}</p></section>
            </section>

            <section v-if="studyPracticeQuestion" class="study-quick-practice" aria-labelledby="studyQuickPracticeTitle">
            <p class="study-guide-section-label">Quick Practice</p>
            <article v-if="studyPracticeLoading" class="study-quick-card loading" aria-live="polite">
              <span class="topic-loader" />
              <p>Generating Question...</p>
            </article>
            <article v-else class="study-quick-card">
              <header>
                <span>{{ studyPracticeHasOptions ? 'Single choice' : 'Written response' }}</span>
                <h2 id="studyQuickPracticeTitle">{{ studyPracticeQuestion.stem }}</h2>
              </header>
              <div v-if="studyPracticeHasOptions" class="study-quick-options">
                <button v-for="([letter, option]) in studyPracticeOptions" :key="`${studyPracticeQuestion.id}-${letter}`" type="button" :disabled="studyPracticeSelectedAnswer !== null" :class="{ selected: studyPracticeSelectedAnswer === letter, correct: studyPracticeSelectedAnswer !== null && studyPracticeQuestion.correctAnswer === letter, wrong: studyPracticeSelectedAnswer === letter && studyPracticeQuestion.correctAnswer !== letter }" @click="chooseStudyPracticeAnswer(letter)">
                  <i>{{ letter }}</i><span>{{ option }}</span><b v-if="studyPracticeSelectedAnswer !== null && studyPracticeQuestion.correctAnswer === letter">✓</b><b v-else-if="studyPracticeSelectedAnswer === letter">×</b>
                </button>
              </div>
              <div v-else class="study-quick-written-response">
                <label for="studyWrittenResponse">Write your response</label>
                <textarea id="studyWrittenResponse" v-model="studyPracticeWrittenResponse" :disabled="studyPracticeWrittenSubmitted" rows="8" placeholder="Draft your essay response here…" />
                <button type="button" :disabled="!studyPracticeWrittenResponse.trim() || studyPracticeWrittenSubmitted" @click="submitStudyPracticeWrittenResponse">Submit response</button>
              </div>
              <section v-if="studyPracticeAnswered" class="study-quick-feedback" :class="{ success: studyPracticeHasOptions ? studyPracticeCorrect : true }" aria-live="polite">
                <span>{{ studyPracticeHasOptions ? (studyPracticeCorrect ? 'Correct' : 'Incorrect') : 'Response submitted' }}</span>
                <h3>{{ studyPracticeHasOptions ? 'Explanation' : 'What a strong response includes' }}</h3>
                <p>{{ studyPracticeQuestion.explanation }}</p>
              </section>
              <footer v-if="studyPracticeAnswered" class="study-quick-actions">
                <button v-if="hasAnotherStudyPractice" type="button" class="secondary" @click="tryAnotherStudyPractice">Try Another</button>
                <button type="button" class="primary" :class="{ full: !hasAnotherStudyPractice }" @click="advanceStudyTopic">{{ isLastTopic ? 'Back' : 'Next Topic' }}</button>
              </footer>
            </article>
            </section>
            </div>
            <div v-if="!isProMember" class="study-guide-inline-gate">
              <section class="study-guide-inline-gate-card">
                <span aria-hidden="true">x²</span>
                <strong>Keep Learning with Solvely Pro</strong>
                <small>Unlock the full written guide, worked examples, exam tips, and Quick Practice.</small>
                <button type="button" @click="openStudyGuidePaywall">Unlock Study Guide</button>
              </section>
            </div>
          </div>
        </article>

        <section v-else-if="mode === 'flashcards' && flashCardContent" class="flashcard-view">
          <div class="tool-view-toolbar">
            <div><strong>{{ cardView === 'card' ? `${cardIndex + 1}/${flashcards.length} Cards` : `${flashcards.length} Cards` }}<span v-if="!isProMember" class="tool-free-preview-badge">Card 1 preview</span></strong><span>{{ cardStatusCounts.review }} Need Review · {{ cardStatusCounts.mastered }} Mastered</span></div>
            <div class="view-mode-buttons"><button type="button" :class="{ active: cardView === 'card' }" @click="setCardView('card')">Card</button><button type="button" :class="{ active: cardView === 'list' }" @click="setCardView('list')">List</button></div>
          </div>

          <div v-if="cardView === 'card' && currentCard" class="flashcard-stage">
            <div class="flashcard-progress"><i :style="{ width: `${((cardIndex + 1) / flashcards.length) * 100}%` }" /></div>
            <button type="button" class="flashcard-star" :class="{ active: starredCards.has(currentCard.flashcard_id) }" :aria-label="starredCards.has(currentCard.flashcard_id) ? 'Unstar card' : 'Star card'" @click="toggleStar">★</button>
            <button type="button" class="flashcard-face" :class="{ flipped: cardFlipped }" @click="cardFlipped = !cardFlipped">
              <span>{{ cardFlipped ? 'ANSWER' : 'QUESTION' }}</span>
              <h2>{{ cardFlipped ? currentCard.back : currentCard.front }}</h2>
              <small>{{ cardFlipped ? 'Click to see the question' : 'Press Space or click to flip' }}</small>
            </button>
            <div class="flashcard-nav"><button type="button" @click="previousCard">←</button><span>{{ cardIndex + 1 }} of {{ flashcards.length }}</span><button type="button" @click="nextCard">→</button></div>
            <div class="flashcard-rating"><button type="button" class="review" @click="markCard('review')">Need to review</button><button type="button" class="mastered" @click="markCard('mastered')">Mastered</button></div>
            <button type="button" class="flashcard-shuffle" @click="shuffleCards">↻ Shuffle</button>
          </div>

          <div v-else class="flashcard-list">
            <div class="flashcard-list-filters"><span>All {{ flashcards.length }}</span><span>Mastered {{ cardStatusCounts.mastered }}</span><span>Need Review {{ cardStatusCounts.review }}</span><span>Unseen {{ cardStatusCounts.unseen }}</span></div>
            <article v-for="card in flashcards" :key="card.flashcard_id">
              <span :class="['card-list-status', cardStatuses[card.flashcard_id] || 'unseen']">{{ cardStatuses[card.flashcard_id] || 'unseen' }}</span>
              <div><h2>{{ card.front }}</h2><p>{{ card.back }}</p></div>
              <button type="button" :class="{ active: starredCards.has(card.flashcard_id) }" @click="toggleCardStar(card)">★</button>
            </article>
          </div>
        </section>

        <section v-else class="quiz-view">
          <div v-if="quizLoading" class="topic-load-state inline"><span class="topic-loader" /><strong>Loading {{ topic.quizCount }} questions…</strong></div>
          <template v-else-if="currentQuestion">
            <div class="quiz-progress-row"><span>Question {{ quizIndex + 1 }} of {{ quizQuestions.length }}<em v-if="!isProMember" class="tool-free-preview-badge">Question 1 preview</em></span><div><i :style="{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }" /></div><b>{{ currentQuestion.difficulty }}</b></div>
            <article class="quiz-card">
              <span class="quiz-kicker">{{ currentQuestion.domain }} · {{ currentQuestion.skill }}</span>
              <h2>{{ currentQuestion.question }}</h2>

              <div v-if="currentQuestion.options.length" class="quiz-options">
                <button v-for="(option, index) in currentQuestion.options" :key="`${currentQuestion.id}-${index}`" type="button" :disabled="selectedAnswer !== null" :class="{ selected: selectedAnswer === index, correct: selectedAnswer !== null && currentQuestion.correctIndex === index, wrong: selectedAnswer === index && currentQuestion.correctIndex !== index }" @click="chooseAnswer(index)">
                  <i>{{ answerLetter(index) }}</i><span>{{ option }}</span><b v-if="selectedAnswer !== null && currentQuestion.correctIndex === index">✓</b><b v-else-if="selectedAnswer === index">×</b>
                </button>
              </div>
              <div v-else class="quiz-short-answer"><label for="shortAnswer">Enter your answer</label><div><input id="shortAnswer" v-model="shortAnswer" :disabled="shortAnswerChecked" /><button type="button" :disabled="!shortAnswer.trim() || shortAnswerChecked" @click="checkShortAnswer">Check answer</button></div></div>

              <section v-if="selectedAnswer !== null || shortAnswerChecked" class="quiz-feedback" :class="{ success: selectedAnswer !== null ? selectedCorrect : normalize(shortAnswer) === normalize(currentQuestion.answer) }">
                <span>{{ selectedAnswer !== null ? (selectedCorrect ? 'Correct' : 'Keep learning') : `Answer: ${currentQuestion.answer}` }}</span>
                <h3>Explanation</h3>
                <p>{{ currentQuestion.explanation || 'Review the study guide for the complete solution path.' }}</p>
                <button v-if="!isImprovePractice" type="button" @click="toolRoute('study-guide')">View Study Guide</button>
              </section>
              <footer><button type="button" class="quiz-next" :disabled="selectedAnswer === null && !shortAnswerChecked" @click="nextQuestion">{{ isImprovePractice && isLastQuizQuestion ? 'Finish practice' : 'Next question →' }}</button></footer>
            </article>
          </template>
        </section>
      </main>
    </div>

    <AskSolvelyPanel
      v-if="topic"
      v-model:open="askSolvelyOpen"
      v-model:panel-width="askSolvelyPanelWidth"
      :context-title="topic.title"
      :context-detail="isApPackage ? 'AP Calculus BC Exam Prep' : isActPackage ? 'ACT Exam Prep' : 'Digital SAT Exam Prep'"
    />
    <CommercialDemoController
      :model-value="accessState"
      @update:model-value="setProAccess"
    />
    <ProPaywall
      :open="paywallOpen"
      :context="paywallContext"
      @close="closeCommercialPaywall"
      @unlock="unlockPro"
    />
  </div>
</template>
