import type {
  EpExam,
  EpExamQuestion,
  EpExamResult,
  EpExamResultDifficulty,
  EpExamResultDomain,
  EpExamResultModule,
  EpExamResultQuestion,
  EpExamResultSection,
  EpReportQuestionStatus,
} from '../types/epV2'

export type SatReportReviewQuestion = EpExamQuestion & EpExamResultQuestion

export type SatImprovePriority = 'CORE' | 'LIKELY' | 'POSSIBLE'

export type SatImproveTopic = {
  id: string
  sectionId: 'math' | 'reading-writing'
  sectionTitle: 'Math' | 'Reading and Writing'
  contentDomain: string
  title: string
  description: string
  probability: number
  priority: SatImprovePriority
  accuracy: number
  attempts: number
  averageSeconds: number
  state: 'REVIEW' | 'CONTINUE' | 'PRACTICE'
}

const incorrectIndexes = new Set(Array.from({ length: 20 }, (_, index) => 1 + index * 4))

function statusFor(index: number): EpReportQuestionStatus {
  if (index >= 93) return 'OMITTED'
  return incorrectIndexes.has(index) ? 'INCORRECT' : 'CORRECT'
}

function wrongAnswerFor(question: EpExamQuestion) {
  if (question.responseType === 'STUDENT_PRODUCED_RESPONSE') return '12'
  return Object.keys(question.options).sort().find((answer) => answer !== question.correctAnswer) ?? null
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
      timeSpentSeconds: status === 'OMITTED' ? 0 : 42 + (index * 17) % 88,
    }
  })
}

function aggregate(questions: EpExamQuestion[], results: Map<number, EpExamResultQuestion>) {
  const values = questions.map((question) => results.get(question.id)).filter(Boolean) as EpExamResultQuestion[]
  const correct = values.filter((value) => value.status === 'CORRECT').length
  const incorrect = values.filter((value) => value.status === 'INCORRECT').length
  const omitted = values.filter((value) => value.status === 'OMITTED').length
  const attempted = correct + incorrect
  const seconds = values.reduce((sum, value) => sum + value.timeSpentSeconds, 0)
  return {
    total: values.length,
    correct,
    incorrect,
    omitted,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    averageSeconds: attempted ? Math.round(seconds / attempted) : 0,
  }
}

function masteryLevel(accuracy: number): 1 | 2 | 3 | 4 | 5 {
  if (accuracy >= 88) return 5
  if (accuracy >= 76) return 4
  if (accuracy >= 62) return 3
  if (accuracy >= 45) return 2
  return 1
}

export function buildSatReport(exam: EpExam): EpExamResult {
  const questions = buildQuestionResults(exam)
  const byQuestionId = new Map(questions.map((question) => [question.questionId, question]))
  const total = aggregate(exam.questions, byQuestionId)
  const sectionMeta: Record<string, Pick<EpExamResultSection, 'score' | 'scoreRange' | 'averageScore' | 'percentile'>> = {
    'reading-writing': { score: 650, scoreRange: [620, 680], averageScore: 520, percentile: 84 },
    math: { score: 630, scoreRange: [600, 660], averageScore: 530, percentile: 78 },
  }

  const sections = ['reading-writing', 'math'].map<EpExamResultSection>((sectionId) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === sectionId)
    const stats = aggregate(sectionQuestions, byQuestionId)
    return {
      sectionId,
      sectionTitle: sectionQuestions[0]?.sectionTitle ?? sectionId,
      maximumScore: 800,
      ...sectionMeta[sectionId],
      ...stats,
    }
  })

  const moduleKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.module}|${question.route}`))]
  const modules = moduleKeys.map<EpExamResultModule>((key) => {
    const [sectionId, module, route] = key.split('|')
    const moduleQuestions = exam.questions.filter((question) => question.sectionId === sectionId && question.module === module && question.route === route)
    return {
      sectionId,
      sectionTitle: moduleQuestions[0]?.sectionTitle ?? sectionId,
      module: module as 'Module 1' | 'Module 2',
      route,
      ...aggregate(moduleQuestions, byQuestionId),
    }
  })

  const domainKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.contentDomain}`))]
  const domains = domainKeys.map<EpExamResultDomain>((key) => {
    const [sectionId, contentDomain] = key.split('|')
    const domainQuestions = exam.questions.filter((question) => question.sectionId === sectionId && question.contentDomain === contentDomain)
    const stats = aggregate(domainQuestions, byQuestionId)
    return {
      sectionId,
      sectionTitle: domainQuestions[0]?.sectionTitle ?? sectionId,
      contentDomain,
      ...stats,
      masteryLevel: masteryLevel(stats.accuracy),
    }
  })

  const difficultyKeys = [...new Set(exam.questions.map((question) => `${question.sectionId}|${question.difficulty}`))]
  const difficulties = difficultyKeys.map<EpExamResultDifficulty>((key) => {
    const [sectionId, difficulty] = key.split('|')
    const difficultyQuestions = exam.questions.filter((question) => question.sectionId === sectionId && question.difficulty === difficulty)
    return { sectionId, difficulty, ...aggregate(difficultyQuestions, byQuestionId) }
  })

  return {
    schemaVersion: 'EP_REPORT_V1',
    attemptId: 'sat-mock-1-anna-2026-08-21',
    status: 'COMPLETED',
    completedAt: '2026-08-21T10:42:00.000Z',
    durationSeconds: 7718,
    totalScore: 1280,
    maximumScore: 1600,
    scoreRange: [1240, 1320],
    averageScore: 1050,
    percentile: 70,
    correct: total.correct,
    incorrect: total.incorrect,
    omitted: total.omitted,
    accuracy: total.accuracy,
    overview: 'Reading and Writing is your stronger section. Focus next on Advanced Math and Standard English Conventions to raise your total score.',
    sections,
    modules,
    domains,
    difficulties,
    questions,
  }
}

export function buildReviewQuestions(exam: EpExam, report: EpExamResult): SatReportReviewQuestion[] {
  const results = new Map(report.questions.map((question) => [question.questionId, question]))
  return exam.questions.map((question) => ({ ...question, ...(results.get(question.id) as EpExamResultQuestion) }))
}

export const satImproveTopics: SatImproveTopic[] = [
  { id: 'math-advanced-equivalent', sectionId: 'math', sectionTitle: 'Math', contentDomain: 'Advanced Math', title: 'Equivalent transformations of exponential, radical, and rational expressions', description: 'Rewrite nonlinear expressions efficiently and choose equivalent forms.', probability: 96, priority: 'CORE', accuracy: 43, attempts: 7, averageSeconds: 108, state: 'REVIEW' },
  { id: 'math-advanced-nonlinear', sectionId: 'math', sectionTitle: 'Math', contentDomain: 'Advanced Math', title: 'Solving nonlinear equations in one variable', description: 'Factor, complete the square, and validate solutions to nonlinear equations.', probability: 92, priority: 'CORE', accuracy: 50, attempts: 6, averageSeconds: 104, state: 'PRACTICE' },
  { id: 'math-data-ratios', sectionId: 'math', sectionTitle: 'Math', contentDomain: 'Problem-Solving and Data Analysis', title: 'Ratios, unit rates, proportions, and scales', description: 'Translate real-world relationships into proportional models.', probability: 89, priority: 'LIKELY', accuracy: 57, attempts: 7, averageSeconds: 97, state: 'CONTINUE' },
  { id: 'math-data-two-variable', sectionId: 'math', sectionTitle: 'Math', contentDomain: 'Problem-Solving and Data Analysis', title: 'Interpreting two-variable data', description: 'Read scatterplots, lines of best fit, and model predictions.', probability: 81, priority: 'LIKELY', accuracy: 60, attempts: 5, averageSeconds: 91, state: 'PRACTICE' },
  { id: 'math-geometry-circles', sectionId: 'math', sectionTitle: 'Math', contentDomain: 'Geometry and Trigonometry', title: 'Circle equations, arcs, and sectors', description: 'Connect circle geometry with coordinate equations and angle relationships.', probability: 76, priority: 'POSSIBLE', accuracy: 50, attempts: 4, averageSeconds: 102, state: 'PRACTICE' },
  { id: 'rw-conventions-boundaries', sectionId: 'reading-writing', sectionTitle: 'Reading and Writing', contentDomain: 'Standard English Conventions', title: 'Sentence boundaries and punctuation', description: 'Repair fragments, fused sentences, and comma splices.', probability: 95, priority: 'CORE', accuracy: 55, attempts: 11, averageSeconds: 67, state: 'REVIEW' },
  { id: 'rw-evidence-quantitative', sectionId: 'reading-writing', sectionTitle: 'Reading and Writing', contentDomain: 'Information and Ideas', title: 'Command of Evidence — Quantitative', description: 'Connect claims to the strongest evidence in tables and graphs.', probability: 88, priority: 'LIKELY', accuracy: 58, attempts: 12, averageSeconds: 76, state: 'CONTINUE' },
  { id: 'rw-craft-cross-text', sectionId: 'reading-writing', sectionTitle: 'Reading and Writing', contentDomain: 'Craft and Structure', title: 'Cross-text connections', description: 'Compare claims, evidence, and author responses across paired texts.', probability: 79, priority: 'POSSIBLE', accuracy: 61, attempts: 8, averageSeconds: 83, state: 'PRACTICE' },
]
