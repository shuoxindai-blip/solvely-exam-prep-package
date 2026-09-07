import { createRouter, createWebHistory } from 'vue-router'
import ExamPrepPackageView from './views/ExamPrepPackageView.vue'
import MockExamView from './views/MockExamView.vue'
import TopicToolView from './views/TopicToolView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'package', component: ExamPrepPackageView },
    { path: '/mock-exam', redirect: '/mock-exam/1' },
    { path: '/mock-exam/:examId(1|2)', name: 'mock-exam', component: MockExamView },
    { path: '/topic/:topicId/study-guide', name: 'study-guide', component: TopicToolView },
    { path: '/topic/:topicId/flashcards', name: 'flashcards', component: TopicToolView },
    { path: '/topic/:topicId/quiz', name: 'quiz', component: TopicToolView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to) => to.hash === '#examCatalogTitle'
    ? { el: to.hash, top: window.innerWidth <= 820 ? 64 : 24, behavior: 'smooth' }
    : { top: 0 },
})

router.afterEach((to) => {
  const examQuery = String(to.query.exam || '').toLowerCase()
  const exam = examQuery === 'ap-calculus-bc' ? 'AP Calculus BC' : examQuery === 'act' ? 'ACT' : 'SAT'
  const labels: Record<string, string> = { 'mock-exam': `${exam} Practice Test`, 'study-guide': `${exam} Study Guide`, flashcards: `${exam} Flashcards`, quiz: `${exam} Quiz` }
  const label = to.name === 'mock-exam' && to.query.mode === 'diagnostic'
    ? `${exam} Diagnostic Test`
    : labels[String(to.name)] || `${exam} Exam Prep`
  document.title = `${label} — Solvely`
})

export default router
