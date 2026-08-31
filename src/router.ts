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
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const labels: Record<string, string> = { 'mock-exam': 'SAT Mock Exam', 'study-guide': 'SAT Study Guide', flashcards: 'SAT Flashcards', quiz: 'SAT Quiz' }
  document.title = `${labels[String(to.name)] || 'SAT Exam Prep'} — Solvely`
})

export default router
