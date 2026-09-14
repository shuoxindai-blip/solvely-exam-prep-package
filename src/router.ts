import { createRouter, createWebHistory } from 'vue-router'
import ExamPrepPackageView from './views/ExamPrepPackageView.vue'
import MockExamView from './views/MockExamView.vue'
import TopicToolView from './views/TopicToolView.vue'
import { isFullLengthRouteAllowed } from './domain/prepState'

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

router.beforeEach((to) => {
  if (to.name !== 'mock-exam' || isFullLengthRouteAllowed(to.query.access, to.query.mode)) return true

  const exam = String(to.query.exam || '').toLowerCase()
  const normalizedExam = exam === 'act' || exam === 'ap-calculus-bc' || exam === 'abitur-mathematik' ? exam : 'sat'
  return {
    name: 'package',
    query: {
      access: 'free',
      ...(normalizedExam === 'sat' ? {} : { exam: normalizedExam }),
      courseState: 'not-started',
      practiceState: 'not-started',
      paywall: 'full-length',
    },
    hash: normalizedExam === 'abitur-mathematik'
      ? '#course-3'
      : normalizedExam === 'ap-calculus-bc'
      ? '#course-2'
      : normalizedExam === 'act'
        ? '#course-1'
        : '#course-0',
  }
})

router.afterEach((to) => {
  const examQuery = String(to.query.exam || '').toLowerCase()
  const exam = examQuery === 'abitur-mathematik' ? 'Abitur Mathematik' : examQuery === 'ap-calculus-bc' ? 'AP Calculus BC' : examQuery === 'act' ? 'ACT' : 'SAT'
  const selectedCourse = String(to.query.course || '').trim()
  const labels: Record<string, string> = { 'mock-exam': `${exam} Practice Test`, 'study-guide': `${exam} Study Guide`, flashcards: `${exam} Flashcards`, quiz: `${exam} Quiz` }
  const label = to.name === 'mock-exam' && to.query.mode === 'diagnostic'
    ? `${exam} Diagnostic Test`
    : labels[String(to.name)] || (selectedCourse ? `${selectedCourse} Exam Prep` : `${exam} Exam Prep`)
  document.title = `${label} — Solvely`
})

export default router
