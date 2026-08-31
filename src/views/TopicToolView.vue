<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadSatManifest, loadTopicQuiz } from '../data/satData'
import type { SatManifest, SatQuizQuestion, SatTopic } from '../types/sat'

type ToolMode = 'study-guide' | 'flashcards' | 'quiz'
type CardStatus = 'unseen' | 'review' | 'mastered'

const route = useRoute()
const router = useRouter()
const manifest = ref<SatManifest | null>(null)
const loadError = ref('')
const collapsedSections = ref(new Set<string>())
const cardIndex = ref(0)
const cardFlipped = ref(false)
const cardView = ref<'card' | 'list'>('card')
const cardStatuses = ref<Record<string, CardStatus>>({})
const starredCards = ref(new Set<string>())
const quizQuestions = ref<SatQuizQuestion[]>([])
const quizLoading = ref(false)
const quizIndex = ref(0)
const selectedAnswer = ref<number | null>(null)
const shortAnswer = ref('')
const shortAnswerChecked = ref(false)
const iframeLoaded = ref(false)

const mode = computed<ToolMode>(() => {
  const name = String(route.name)
  return name === 'flashcards' || name === 'quiz' ? name : 'study-guide'
})
const topicId = computed(() => String(route.params.topicId || ''))
const topic = computed(() => manifest.value?.topics.find((item) => item.id === topicId.value) ?? null)
const currentCard = computed(() => topic.value?.flashcards[cardIndex.value] ?? null)
const currentQuestion = computed(() => quizQuestions.value[quizIndex.value] ?? null)
const selectedCorrect = computed(() => selectedAnswer.value !== null && selectedAnswer.value === currentQuestion.value?.correctIndex)

const topicsBySection = computed(() => {
  if (!manifest.value) return []
  const byId = new Map(manifest.value.topics.map((item) => [item.id, item]))
  return manifest.value.sections.map((section) => ({ ...section, topics: section.topicIds.map((id) => byId.get(id)).filter(Boolean) as SatTopic[] }))
})

const toolLabel = computed(() => mode.value === 'study-guide' ? 'Study Guide' : mode.value === 'flashcards' ? 'Flashcards' : 'Quiz')
const cardStatusCounts = computed(() => {
  const counts = { unseen: 0, review: 0, mastered: 0 }
  for (const card of topic.value?.flashcards ?? []) counts[cardStatuses.value[card.flashcard_id] || 'unseen'] += 1
  return counts
})

function toolRoute(tool: ToolMode, target = topic.value) {
  if (!target) return
  void router.push({ name: tool, params: { topicId: target.id } })
}

function chooseTopic(target: SatTopic) {
  toolRoute(mode.value, target)
}

function toggleSection(id: string) {
  const next = new Set(collapsedSections.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsedSections.value = next
}

function markCard(status: CardStatus) {
  if (!currentCard.value) return
  cardStatuses.value = { ...cardStatuses.value, [currentCard.value.flashcard_id]: status }
  if (cardIndex.value < (topic.value?.flashcards.length ?? 1) - 1) nextCard()
}

function nextCard() {
  if (!topic.value) return
  cardIndex.value = (cardIndex.value + 1) % topic.value.flashcards.length
  cardFlipped.value = false
}

function previousCard() {
  if (!topic.value) return
  cardIndex.value = (cardIndex.value - 1 + topic.value.flashcards.length) % topic.value.flashcards.length
  cardFlipped.value = false
}

function shuffleCards() {
  if (!topic.value) return
  cardIndex.value = Math.floor(Math.random() * topic.value.flashcards.length)
  cardFlipped.value = false
}

function toggleStar() {
  if (!currentCard.value) return
  const next = new Set(starredCards.value)
  next.has(currentCard.value.flashcard_id) ? next.delete(currentCard.value.flashcard_id) : next.add(currentCard.value.flashcard_id)
  starredCards.value = next
}

function toggleCardStar(card: SatTopic['flashcards'][number]) {
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
}

function checkShortAnswer() {
  if (shortAnswer.value.trim()) shortAnswerChecked.value = true
}

function nextQuestion() {
  if (!quizQuestions.value.length) return
  quizIndex.value = (quizIndex.value + 1) % quizQuestions.value.length
  selectedAnswer.value = null
  shortAnswer.value = ''
  shortAnswerChecked.value = false
  void nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
}

function answerLetter(index: number) {
  return String.fromCharCode(65 + index)
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
    quizQuestions.value = await loadTopicQuiz(topic.value.id)
    quizIndex.value = 0
    selectedAnswer.value = null
    shortAnswer.value = ''
    shortAnswerChecked.value = false
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load the quiz.'
  } finally {
    quizLoading.value = false
  }
}

watch([topicId, mode], () => {
  cardIndex.value = 0
  cardFlipped.value = false
  cardView.value = 'card'
  iframeLoaded.value = false
  void loadQuiz()
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
    manifest.value = await loadSatManifest()
    if (!topic.value && manifest.value.topics[0]) await router.replace({ name: mode.value, params: { topicId: manifest.value.topics[0].id } })
    await loadQuiz()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load SAT materials.'
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('topic-tool-route')
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="topic-tool-shell">
    <header class="topic-tool-header">
      <button class="topic-back-button" type="button" @click="router.push({ name: 'package', query: { tab: 'study' } })" aria-label="Back to SAT exam prep">←</button>
      <button class="topic-package-button" type="button" @click="router.push({ name: 'package', query: { tab: 'study' } })">
        <img src="/assets/solvely-ai-logo.jpeg" alt="" width="27" height="27" />
        <span><strong>Digital SAT Exam Prep</strong><small>{{ toolLabel }}</small></span>
      </button>
      <nav class="topic-mode-switch" aria-label="Topic study tools">
        <button :class="{ active: mode === 'study-guide' }" type="button" @click="toolRoute('study-guide')">Study Guide</button>
        <button :class="{ active: mode === 'flashcards' }" type="button" @click="toolRoute('flashcards')">Flashcards</button>
        <button :class="{ active: mode === 'quiz' }" type="button" @click="toolRoute('quiz')">Quiz</button>
      </nav>
      <span class="topic-material-count">100 SAT topics</span>
    </header>

    <div v-if="loadError" class="topic-load-state"><strong>Unable to load SAT materials</strong><p>{{ loadError }}</p></div>
    <div v-else-if="!manifest || !topic" class="topic-load-state"><span class="topic-loader" /><strong>Loading SAT materials…</strong></div>

    <div v-else class="topic-tool-layout">
      <aside class="topic-sidebar" aria-label="SAT topics">
        <div class="topic-sidebar-heading"><span>Topics</span><strong>{{ manifest.totals.topics }}</strong></div>
        <div class="topic-sidebar-stats">
          <span><strong>{{ manifest.totals.flashcards }}</strong> flashcards</span>
          <span><strong>{{ manifest.totals.quizQuestions }}</strong> questions</span>
        </div>
        <div class="topic-sidebar-groups">
          <section v-for="section in topicsBySection" :key="section.id" class="topic-sidebar-group">
            <button type="button" class="topic-section-toggle" :aria-expanded="!collapsedSections.has(section.id)" @click="toggleSection(section.id)">
              <span><small>{{ section.examSection }}</small><strong>{{ section.title }}</strong></span>
              <b>{{ section.topics.length }}</b>
              <i>⌄</i>
            </button>
            <div v-if="!collapsedSections.has(section.id)" class="topic-sidebar-list">
              <button v-for="item in section.topics" :key="item.id" type="button" :class="{ active: item.id === topic.id }" @click="chooseTopic(item)">
                <span class="topic-state-dot" />
                <span><strong>{{ item.title }}</strong><small>{{ mode === 'study-guide' ? item.strategyName : mode === 'flashcards' ? `${item.flashcards.length} cards` : `${item.quizCount} questions` }}</small></span>
              </button>
            </div>
          </section>
        </div>
      </aside>

      <main class="topic-main">
        <header class="topic-main-head">
          <div>
            <p><span>{{ topic.section }}</span><i />{{ topic.domain }}<i />{{ topic.skill }}</p>
            <h1>{{ topic.title }}</h1>
            <span class="topic-summary">{{ topic.summary }}</span>
          </div>
          <div class="topic-head-meta">
            <span v-if="mode === 'study-guide'"><strong>{{ topic.studyGuide.sections.length }}</strong> guide sections</span>
            <span v-else-if="mode === 'flashcards'"><strong>{{ topic.flashcards.length }}</strong> cards</span>
            <span v-else><strong>{{ topic.quizCount }}</strong> questions</span>
          </div>
        </header>

        <article v-if="mode === 'study-guide'" class="study-guide-view">
          <section class="topic-video-card" aria-labelledby="topicVideoTitle">
            <header><div><span>VIDEO LESSON</span><h2 id="topicVideoTitle">{{ topic.video.title }}</h2></div><a :href="topic.video.url" target="_blank" rel="noopener">Open video ↗</a></header>
            <div class="topic-video-frame" :class="{ loaded: iframeLoaded }">
              <img :src="topic.video.cover" :alt="`${topic.video.title} video cover`" />
              <span class="video-loading">Loading interactive lesson…</span>
              <iframe :src="topic.video.url" :title="topic.video.title" loading="eager" allow="fullscreen" @load="iframeLoaded = true" />
            </div>
          </section>

          <section class="guide-article">
            <div class="guide-overview"><span>OVERVIEW</span><p>{{ topic.studyGuide.overview }}</p></div>
            <section v-if="topic.studyGuide.learning_objectives?.length" class="guide-objectives">
              <h2>What you'll learn</h2>
              <ul><li v-for="objective in topic.studyGuide.learning_objectives" :key="objective">{{ objective }}</li></ul>
            </section>
            <section v-for="section in topic.studyGuide.sections" :key="section.title" class="guide-section">
              <h2>{{ section.title }}</h2>
              <p v-html="inlineMarkup(section.content)" />
            </section>
            <section v-for="(example, index) in topic.studyGuide.worked_examples" :key="example.question" class="worked-example">
              <span>WORKED EXAMPLE {{ index + 1 }}</span>
              <h3>{{ example.question }}</h3>
              <p v-html="inlineMarkup(example.solution)" />
            </section>
            <div class="guide-two-column">
              <section><h2>Common mistakes</h2><ul><li v-for="mistake in topic.studyGuide.common_mistakes" :key="mistake">{{ mistake }}</li></ul></section>
              <section><h2>Exam tips</h2><ul><li v-for="tip in topic.studyGuide.exam_tips" :key="tip">{{ tip }}</li></ul></section>
            </div>
            <section class="guide-recap"><span>KEY TAKEAWAY</span><p>{{ topic.studyGuide.recap }}</p></section>
            <footer class="guide-next-actions"><span>Reinforce this topic</span><button type="button" @click="toolRoute('flashcards')">Study {{ topic.flashcards.length }} flashcards</button><button type="button" @click="toolRoute('quiz')">Take {{ topic.quizCount }} quiz questions</button></footer>
          </section>
        </article>

        <section v-else-if="mode === 'flashcards'" class="flashcard-view">
          <div class="tool-view-toolbar">
            <div><strong>{{ cardView === 'card' ? `${cardIndex + 1}/${topic.flashcards.length} Cards` : `${topic.flashcards.length} Cards` }}</strong><span>{{ cardStatusCounts.review }} Need Review · {{ cardStatusCounts.mastered }} Mastered</span></div>
            <div class="view-mode-buttons"><button type="button" :class="{ active: cardView === 'card' }" @click="cardView = 'card'">Card</button><button type="button" :class="{ active: cardView === 'list' }" @click="cardView = 'list'">List</button></div>
          </div>

          <div v-if="cardView === 'card' && currentCard" class="flashcard-stage">
            <div class="flashcard-progress"><i :style="{ width: `${((cardIndex + 1) / topic.flashcards.length) * 100}%` }" /></div>
            <button type="button" class="flashcard-star" :class="{ active: starredCards.has(currentCard.flashcard_id) }" :aria-label="starredCards.has(currentCard.flashcard_id) ? 'Unstar card' : 'Star card'" @click="toggleStar">★</button>
            <button type="button" class="flashcard-face" :class="{ flipped: cardFlipped }" @click="cardFlipped = !cardFlipped">
              <span>{{ cardFlipped ? 'ANSWER' : 'QUESTION' }}</span>
              <h2>{{ cardFlipped ? currentCard.back : currentCard.front }}</h2>
              <small>{{ cardFlipped ? 'Click to see the question' : 'Press Space or click to flip' }}</small>
            </button>
            <div class="flashcard-nav"><button type="button" @click="previousCard">←</button><span>{{ cardIndex + 1 }} of {{ topic.flashcards.length }}</span><button type="button" @click="nextCard">→</button></div>
            <div class="flashcard-rating"><button type="button" class="review" @click="markCard('review')">Need to review</button><button type="button" class="mastered" @click="markCard('mastered')">Mastered</button></div>
            <button type="button" class="flashcard-shuffle" @click="shuffleCards">↻ Shuffle</button>
          </div>

          <div v-else class="flashcard-list">
            <div class="flashcard-list-filters"><span>All {{ topic.flashcards.length }}</span><span>Mastered {{ cardStatusCounts.mastered }}</span><span>Need Review {{ cardStatusCounts.review }}</span><span>Unseen {{ cardStatusCounts.unseen }}</span></div>
            <article v-for="card in topic.flashcards" :key="card.flashcard_id">
              <span :class="['card-list-status', cardStatuses[card.flashcard_id] || 'unseen']">{{ cardStatuses[card.flashcard_id] || 'unseen' }}</span>
              <div><h2>{{ card.front }}</h2><p>{{ card.back }}</p></div>
              <button type="button" :class="{ active: starredCards.has(card.flashcard_id) }" @click="toggleCardStar(card)">★</button>
            </article>
          </div>
        </section>

        <section v-else class="quiz-view">
          <div v-if="quizLoading" class="topic-load-state inline"><span class="topic-loader" /><strong>Loading {{ topic.quizCount }} questions…</strong></div>
          <template v-else-if="currentQuestion">
            <div class="quiz-progress-row"><span>Question {{ quizIndex + 1 }} of {{ quizQuestions.length }}</span><div><i :style="{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }" /></div><b>{{ currentQuestion.difficulty }}</b></div>
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
                <button type="button" @click="toolRoute('study-guide')">View Study Guide</button>
              </section>
              <footer><button type="button" class="quiz-next" :disabled="selectedAnswer === null && !shortAnswerChecked" @click="nextQuestion">Next question →</button></footer>
            </article>
          </template>
        </section>
      </main>
    </div>
  </div>
</template>
