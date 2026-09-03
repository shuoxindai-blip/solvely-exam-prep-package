import type { EpExam, EpExamQuestion, EpExamResult, EpExamResultDifficulty, EpExamResultDomain, EpExamResultModule, EpExamResultQuestion, EpExamResultSection, EpReportQuestionStatus } from '../types/epV2'

const sectionMeta: Record<string, { averageScore: number; baseScore: number }> = {
  english: { averageScore: 19, baseScore: 25 },
  mathematics: { averageScore: 19.2, baseScore: 23 },
  reading: { averageScore: 20.4, baseScore: 26 },
  science: { averageScore: 19.9, baseScore: 24 },
}

function statusFor(index: number): EpReportQuestionStatus {
  if (index % 29 === 0) return 'OMITTED'
  if (index % 5 === 1 || index % 11 === 4) return 'INCORRECT'
  return 'CORRECT'
}

function wrongAnswerFor(question: EpExamQuestion) {
  return Object.keys(question.options).sort().find((answer) => answer !== question.correctAnswer) ?? null
}

function buildQuestionResults(exam: EpExam): EpExamResultQuestion[] {
  return exam.questions.map((question, index) => {
    const status = statusFor(index)
    return { questionId: question.id, userAnswer: status === 'OMITTED' ? null : status === 'CORRECT' ? question.correctAnswer : wrongAnswerFor(question), correctAnswer: question.correctAnswer, status, earnedRawPoints: status === 'CORRECT' ? 1 : 0, maximumRawPoints: 1, timeSpentSeconds: status === 'OMITTED' ? 0 : 36 + (index * 19) % 92 }
  })
}

function aggregate(questions: EpExamQuestion[], resultById: Map<number, EpExamResultQuestion>) {
  const values = questions.map((question) => resultById.get(question.id)).filter(Boolean) as EpExamResultQuestion[]
  const correct = values.filter((value) => value.status === 'CORRECT').length
  const incorrect = values.filter((value) => value.status === 'INCORRECT').length
  const omitted = values.filter((value) => value.status === 'OMITTED').length
  const attempted = correct + incorrect
  const seconds = values.reduce((sum, value) => sum + value.timeSpentSeconds, 0)
  return { total: values.length, correct, incorrect, omitted, accuracy: attempted ? Math.round(correct / attempted * 100) : 0, averageSeconds: attempted ? Math.round(seconds / attempted) : 0 }
}

function masteryLevel(accuracy: number): 1 | 2 | 3 | 4 | 5 {
  if (accuracy >= 88) return 5
  if (accuracy >= 76) return 4
  if (accuracy >= 62) return 3
  if (accuracy >= 45) return 2
  return 1
}

function percentile(score: number) {
  return Math.max(1, Math.min(99, Math.round(3 + (score / 36) * 94)))
}

export function buildActReport(exam: EpExam): EpExamResult {
  const questions = buildQuestionResults(exam)
  const byId = new Map(questions.map((question) => [question.questionId, question]))
  const total = aggregate(exam.questions, byId)
  const sectionIds = ['english', 'mathematics', 'reading', 'science'].filter((id) => exam.questions.some((question) => question.sectionId === id))
  const sections = sectionIds.map<EpExamResultSection>((sectionId) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === sectionId)
    const stats = aggregate(sectionQuestions, byId)
    const baseline = sectionMeta[sectionId]
    const score = Math.max(1, Math.min(36, Math.round((baseline.baseScore * .45) + (stats.accuracy / 100 * 36 * .55))))
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, score, maximumScore: 36, scoreRange: [Math.max(1, score - 2), Math.min(36, score + 2)], averageScore: baseline.averageScore, percentile: percentile(score), ...stats }
  })
  const compositeSections = sections.filter((section) => ['english', 'mathematics', 'reading'].includes(section.sectionId))
  const composite = Math.round(compositeSections.reduce((sum, section) => sum + section.score, 0) / Math.max(1, compositeSections.length))
  const modules = sectionIds.map<EpExamResultModule>((sectionId) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === sectionId)
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, module: 'Section', route: 'standard', ...aggregate(sectionQuestions, byId) }
  })
  const domainKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.contentDomain}`))]
  const domains = domainKeys.map<EpExamResultDomain>((key) => {
    const [sectionId, contentDomain] = key.split('|')
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === sectionId && question.contentDomain === contentDomain)
    const stats = aggregate(sectionQuestions, byId)
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, contentDomain, ...stats, masteryLevel: masteryLevel(stats.accuracy) }
  })
  const difficultyKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.difficulty}`))]
  const difficulties = difficultyKeys.map<EpExamResultDifficulty>((key) => {
    const [sectionId, difficulty] = key.split('|')
    return { sectionId, difficulty, ...aggregate(exam.questions.filter((question) => question.sectionId === sectionId && question.difficulty === difficulty), byId) }
  })
  return {
    schemaVersion: 'EP_ACT_REPORT_V1', attemptId: 'act-practice-1-anna-2026-09-03', status: 'COMPLETED', completedAt: '2026-09-03T09:20:00.000Z',
    durationSeconds: questions.reduce((sum, question) => sum + question.timeSpentSeconds, 0), totalScore: composite, maximumScore: 36,
    scoreRange: [Math.max(1, composite - 2), Math.min(36, composite + 2)], averageScore: 20, percentile: percentile(composite),
    correct: total.correct, incorrect: total.incorrect, omitted: total.omitted, accuracy: total.accuracy,
    overview: 'Your strongest performance is in Reading. Focus next on the highest-priority Mathematics and Science skills, then use targeted practice to improve accuracy without losing pace.',
    sections, modules, domains, difficulties, questions,
  }
}
