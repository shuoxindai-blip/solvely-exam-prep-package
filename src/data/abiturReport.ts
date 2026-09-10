import type { EpExam, EpExamQuestion, EpExamResult, EpExamResultDomain, EpExamResultModule, EpExamResultQuestion } from '../types/epV2'

const TARGET_RAW_POINTS = 91

function buildQuestionResults(exam: EpExam): EpExamResultQuestion[] {
  const omitted = new Set([7, 18].filter((index) => index < exam.questions.length))
  const earned = exam.questions.map((question, index) => omitted.has(index) ? 0 : question.maximumRawPoints)
  let reduction = Math.max(0, earned.reduce((sum, value) => sum + value, 0) - Math.min(TARGET_RAW_POINTS, exam.questions.reduce((sum, question) => sum + question.maximumRawPoints, 0)))
  for (let index = 2; reduction > 0 && index < earned.length; index = (index + 4) % earned.length) {
    if (omitted.has(index) || earned[index] <= 1) continue
    earned[index] -= 1
    reduction -= 1
  }

  return exam.questions.map((question, index) => {
    const points = earned[index]
    const status = omitted.has(index) ? 'OMITTED' : points === question.maximumRawPoints ? 'CORRECT' : 'INCORRECT'
    return {
      questionId: question.id,
      userAnswer: status === 'OMITTED' ? null : status === 'CORRECT' ? question.correctAnswer : 'Teilantwort eingereicht',
      correctAnswer: question.correctAnswer,
      status,
      earnedRawPoints: points,
      maximumRawPoints: question.maximumRawPoints,
      timeSpentSeconds: status === 'OMITTED' ? 0 : 420 + (index * 83) % 420,
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
  const earnedRawPoints = values.reduce((sum, value) => sum + value.earnedRawPoints, 0)
  const maximumRawPoints = values.reduce((sum, value) => sum + value.maximumRawPoints, 0)
  return { total: values.length, correct, incorrect, omitted, accuracy: maximumRawPoints ? Math.round(earnedRawPoints / maximumRawPoints * 100) : 0, averageSeconds: attempted ? Math.round(seconds / attempted) : 0 }
}

export function abiturNotenpunkte(rawPercent: number) {
  const thresholds = [[95, 15], [90, 14], [85, 13], [80, 12], [75, 11], [70, 10], [65, 9], [60, 8], [55, 7], [50, 6], [45, 5], [40, 4], [33, 3], [27, 2], [20, 1]]
  return thresholds.find(([threshold]) => rawPercent >= threshold)?.[1] ?? 0
}

function masteryLevel(accuracy: number): 1 | 2 | 3 | 4 | 5 {
  if (accuracy >= 90) return 5
  if (accuracy >= 80) return 4
  if (accuracy >= 68) return 3
  if (accuracy >= 50) return 2
  return 1
}

export function buildAbiturReport(exam: EpExam): EpExamResult {
  const questions = buildQuestionResults(exam)
  const byId = new Map(questions.map((question) => [question.questionId, question]))
  const stats = aggregate(exam.questions, byId)
  const earnedRawPoints = questions.reduce((sum, question) => sum + question.earnedRawPoints, 0)
  const maximumRawPoints = questions.reduce((sum, question) => sum + question.maximumRawPoints, 0)
  const rawPercent = maximumRawPoints ? earnedRawPoints / maximumRawPoints * 100 : 0
  const totalScore = abiturNotenpunkte(rawPercent)
  const modules = [...new Set(exam.questions.map((question) => question.module))].map<EpExamResultModule>((module) => ({
    sectionId: 'mathematik',
    sectionTitle: 'Mathematik',
    module,
    route: 'standard',
    ...aggregate(exam.questions.filter((question) => question.module === module), byId),
  }))
  const domains = [...new Set(exam.questions.map((question) => question.contentDomain))].map<EpExamResultDomain>((contentDomain) => {
    const domainStats = aggregate(exam.questions.filter((question) => question.contentDomain === contentDomain), byId)
    return { sectionId: 'mathematik', sectionTitle: 'Mathematik', contentDomain, ...domainStats, masteryLevel: masteryLevel(domainStats.accuracy) }
  })
  return {
    schemaVersion: 'EP_ABITUR_MATHEMATIK_REPORT_V1',
    attemptId: 'abitur-mathematik-ea-practice-1-anna-2026-09-10',
    status: 'COMPLETED',
    completedAt: '2026-09-10T09:15:00.000Z',
    durationSeconds: questions.reduce((sum, question) => sum + question.timeSpentSeconds, 0),
    totalScore,
    maximumScore: 15,
    scoreRange: [Math.max(0, totalScore - 1), Math.min(15, totalScore + 1)],
    averageScore: 8.6,
    percentile: 73,
    correct: stats.correct,
    incorrect: stats.incorrect,
    omitted: stats.omitted,
    accuracy: Math.round(rawPercent),
    overview: `You earned ${earnedRawPoints}/${maximumRawPoints} BE. Analysis is your strongest domain; prioritize multi-step reasoning in Analytische Geometrie and Stochastik to move toward 13 Notenpunkte.`,
    sections: [{
      sectionId: 'mathematik',
      sectionTitle: 'Mathematik',
      score: totalScore,
      maximumScore: 15,
      scoreRange: [Math.max(0, totalScore - 1), Math.min(15, totalScore + 1)],
      averageScore: 8.6,
      percentile: 73,
      ...stats,
    }],
    modules,
    domains,
    difficulties: [{ sectionId: 'mathematik', difficulty: 'Abitur eA', ...stats }],
    questions,
  }
}
