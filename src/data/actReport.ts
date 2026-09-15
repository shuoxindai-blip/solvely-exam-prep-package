import type { EpExam, EpExamQuestion, EpExamResult, EpExamResultDifficulty, EpExamResultDomain, EpExamResultModule, EpExamResultQuestion, EpExamResultSection, EpReportQuestionStatus } from '../types/epV2'
import { getActPracticeTest3ScaleScore, getActWritingPracticeEstimate, type ActPracticeTest3Section } from './actPracticeTest3Scoring'

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
    if (question.sectionId === 'writing') {
      const writing = getActWritingPracticeEstimate()
      return { questionId: question.id, userAnswer: 'Practice essay submitted', correctAnswer: '', status: 'CORRECT', earnedRawPoints: writing.score, maximumRawPoints: writing.maximumScore, timeSpentSeconds: 34 * 60 }
    }
    const status = statusFor(index)
    return { questionId: question.id, userAnswer: status === 'OMITTED' ? null : status === 'CORRECT' ? question.correctAnswer : wrongAnswerFor(question), correctAnswer: question.correctAnswer, status, earnedRawPoints: status === 'CORRECT' ? question.maximumRawPoints : 0, maximumRawPoints: question.maximumRawPoints, timeSpentSeconds: status === 'OMITTED' ? 0 : 36 + (index * 19) % 92 }
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
  const multipleChoiceQuestions = exam.questions.filter((question) => question.sectionId !== 'writing')
  const scoredMultipleChoiceQuestions = multipleChoiceQuestions.filter((question) => question.isScored)
  const total = aggregate(scoredMultipleChoiceQuestions, byId)
  const sectionIds = ['english', 'mathematics', 'reading', 'science'].filter((id) => scoredMultipleChoiceQuestions.some((question) => question.sectionId === id))
  const sections = sectionIds.map<EpExamResultSection>((sectionId) => {
    const sectionQuestions = scoredMultipleChoiceQuestions.filter((question) => question.sectionId === sectionId)
    const stats = aggregate(sectionQuestions, byId)
    const baseline = sectionMeta[sectionId]
    const rawScore = sectionQuestions.filter((question) => byId.get(question.id)?.status === 'CORRECT').length
    const score = getActPracticeTest3ScaleScore(sectionId as ActPracticeTest3Section, rawScore)
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, score, maximumScore: 36, scoreRange: [Math.max(1, score - 2), Math.min(36, score + 2)], averageScore: baseline.averageScore, percentile: percentile(score), ...stats }
  })
  const writingQuestion = exam.questions.find((question) => question.sectionId === 'writing')
  const writingEstimate = writingQuestion ? getActWritingPracticeEstimate() : null
  if (writingEstimate) {
    sections.push({
      sectionId: 'writing', sectionTitle: 'Writing', score: writingEstimate.score, maximumScore: writingEstimate.maximumScore,
      scoreRange: [Math.max(2, writingEstimate.score - 1), Math.min(12, writingEstimate.score + 1)], averageScore: 7, percentile: 70,
      correct: 0, incorrect: 0, omitted: 0, accuracy: 0, averageSeconds: 34 * 60,
    })
  }
  const compositeSections = sections.filter((section) => ['english', 'mathematics', 'reading'].includes(section.sectionId))
  const composite = Math.round(compositeSections.reduce((sum, section) => sum + section.score, 0) / Math.max(1, compositeSections.length))
  const sectionScore = new Map(sections.map((section) => [section.sectionId, section.score]))
  const combinedScore = (id: 'STEM' | 'ELA', label: string, requiredSectionIds: string[], formula: string) => {
    const missingSectionIds = requiredSectionIds.filter((sectionId) => !sectionScore.has(sectionId))
    return {
      id,
      label,
      score: missingSectionIds.length
        ? null
        : Math.round(requiredSectionIds.reduce((sum, sectionId) => sum + (sectionScore.get(sectionId) ?? 0), 0) / requiredSectionIds.length),
      maximumScore: 36 as const,
      status: missingSectionIds.length ? 'NOT_AVAILABLE' as const : 'AVAILABLE' as const,
      formula,
      requiredSectionIds,
      missingSectionIds,
    }
  }
  const stemScore = combinedScore('STEM', 'STEM Score', ['mathematics', 'science'], '(Mathematics + Science) ÷ 2, rounded')
  const elaMissing = ['english', 'reading', 'writing'].filter((sectionId) => !sectionScore.has(sectionId))
  const combinedScores = [
    stemScore,
    {
      id: 'ELA' as const,
      label: 'ELA readiness',
      score: elaMissing.length ? null : Math.round(((sectionScore.get('english') ?? 0) + (sectionScore.get('reading') ?? 0) + (sectionScore.get('writing') ?? 0) * 3) / 3),
      maximumScore: 36 as const,
      status: elaMissing.length ? 'NOT_AVAILABLE' as const : 'AVAILABLE' as const,
      formula: '(English + Reading + Writing practice score × 3) ÷ 3, rounded. This is a Solvely readiness indicator, not an official ACT Composite score.',
      requiredSectionIds: ['english', 'reading', 'writing'],
      missingSectionIds: elaMissing,
    },
  ]
  const modules = sectionIds.map<EpExamResultModule>((sectionId) => {
    const sectionQuestions = scoredMultipleChoiceQuestions.filter((question) => question.sectionId === sectionId)
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, module: 'Section', route: 'standard', ...aggregate(sectionQuestions, byId) }
  })
  const domainKeys = [...new Set(scoredMultipleChoiceQuestions.map((question) => `${question.sectionId}|${question.contentDomain}`))]
  const domains = domainKeys.map<EpExamResultDomain>((key) => {
    const [sectionId, contentDomain] = key.split('|')
    const sectionQuestions = scoredMultipleChoiceQuestions.filter((question) => question.sectionId === sectionId && question.contentDomain === contentDomain)
    const stats = aggregate(sectionQuestions, byId)
    return { sectionId, sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId, contentDomain, ...stats, masteryLevel: masteryLevel(stats.accuracy) }
  })
  const difficultyKeys = [...new Set(scoredMultipleChoiceQuestions.map((question) => `${question.sectionId}|${question.difficulty}`))]
  const difficulties = difficultyKeys.map<EpExamResultDifficulty>((key) => {
    const [sectionId, difficulty] = key.split('|')
    return { sectionId, difficulty, ...aggregate(scoredMultipleChoiceQuestions.filter((question) => question.sectionId === sectionId && question.difficulty === difficulty), byId) }
  })
  return {
    schemaVersion: 'EP_ACT_REPORT_V1', attemptId: 'act-practice-1-anna-2026-09-03', status: 'COMPLETED', completedAt: '2026-09-03T09:20:00.000Z',
    durationSeconds: questions.reduce((sum, question) => sum + question.timeSpentSeconds, 0), totalScore: composite, maximumScore: 36,
    scoreRange: [Math.max(1, composite - 2), Math.min(36, composite + 2)], averageScore: 20, percentile: percentile(composite),
    correct: total.correct, incorrect: total.incorrect, omitted: total.omitted, accuracy: total.accuracy,
    overview: 'Your strongest performance is in Reading. Focus next on the highest-priority Mathematics and Science skills, then use targeted practice to improve accuracy without losing pace.',
    sections, modules, domains, difficulties, questions, combinedScores,
  }
}
