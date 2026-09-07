import type { EpExam, EpExamQuestion, EpExamResult, EpExamResultDifficulty, EpExamResultDomain, EpExamResultModule, EpExamResultQuestion, EpExamResultSection, EpReportQuestionStatus } from '../types/epV2'

function statusFor(index: number): EpReportQuestionStatus {
  if (index === 8 || index === 31) return 'OMITTED'
  if ([3, 7, 15, 22, 29, 38, 43].includes(index)) return 'INCORRECT'
  return 'CORRECT'
}

function wrongAnswerFor(question: EpExamQuestion) {
  return Object.keys(question.options).sort().find((answer) => answer !== question.correctAnswer) ?? 'Needs revision'
}

function buildQuestionResults(exam: EpExam): EpExamResultQuestion[] {
  return exam.questions.map((question, index) => {
    const status = statusFor(index)
    return {
      questionId: question.id,
      userAnswer: status === 'OMITTED' ? null : status === 'CORRECT' ? question.correctAnswer : wrongAnswerFor(question),
      correctAnswer: question.correctAnswer,
      status,
      earnedRawPoints: status === 'CORRECT' ? question.maximumRawPoints : 0,
      maximumRawPoints: question.maximumRawPoints,
      timeSpentSeconds: status === 'OMITTED' ? 0 : 78 + (index * 23) % 146,
    }
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
  if (accuracy >= 90) return 5
  if (accuracy >= 80) return 4
  if (accuracy >= 68) return 3
  if (accuracy >= 50) return 2
  return 1
}

export function buildApReport(exam: EpExam): EpExamResult {
  const questions = buildQuestionResults(exam)
  const byId = new Map(questions.map((question) => [question.questionId, question]))
  const total = aggregate(exam.questions, byId)
  const sectionIds = ['multiple-choice', 'free-response'].filter((id) => exam.questions.some((question) => question.sectionId === id))
  const sections = sectionIds.map<EpExamResultSection>((id) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === id)
    const stats = aggregate(sectionQuestions, byId)
    return { sectionId: id, sectionTitle: sectionQuestions[0]?.sectionTitle ?? id, score: 4, maximumScore: 5, scoreRange: [3, 5], averageScore: 2.8, percentile: 70, ...stats }
  })
  const modules = sectionIds.map<EpExamResultModule>((id) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === id)
    return { sectionId: id, sectionTitle: sectionQuestions[0]?.sectionTitle ?? id, module: 'Section', route: 'standard', ...aggregate(sectionQuestions, byId) }
  })
  const domainKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.contentDomain}`))]
  const domains = domainKeys.map<EpExamResultDomain>((key) => {
    const [sectionId, contentDomain] = key.split('|')
    const domainQuestions = exam.questions.filter((question) => question.sectionId === sectionId && question.contentDomain === contentDomain)
    const stats = aggregate(domainQuestions, byId)
    return { sectionId, sectionTitle: domainQuestions[0]?.sectionTitle ?? sectionId, contentDomain, ...stats, masteryLevel: masteryLevel(stats.accuracy) }
  })
  const difficultyKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.difficulty}`))]
  const difficulties = difficultyKeys.map<EpExamResultDifficulty>((key) => {
    const [sectionId, difficulty] = key.split('|')
    return { sectionId, difficulty, ...aggregate(exam.questions.filter((question) => question.sectionId === sectionId && question.difficulty === difficulty), byId) }
  })
  return {
    schemaVersion: 'EP_AP_CALCULUS_BC_REPORT_V1',
    attemptId: 'ap-calculus-bc-practice-1-anna-2026-09-07',
    status: 'COMPLETED',
    completedAt: '2026-09-07T09:20:00.000Z',
    durationSeconds: questions.reduce((sum, question) => sum + question.timeSpentSeconds, 0),
    totalScore: 4,
    maximumScore: 5,
    scoreRange: [3, 5],
    averageScore: 2.8,
    percentile: 70,
    correct: total.correct,
    incorrect: total.incorrect,
    omitted: total.omitted,
    accuracy: total.accuracy,
    overview: 'Integration and accumulation of change are your strongest areas. Focus next on infinite sequences and series, then reinforce parametric, polar, and vector-valued functions to move toward a 5.',
    sections,
    modules,
    domains,
    difficulties,
    questions,
  }
}
