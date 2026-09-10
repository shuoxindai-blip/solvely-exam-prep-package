import type { EpExam } from '../types/epV2'

export const ABITUR_MATHEMATIK_DIAGNOSTIC_QUESTION_COUNT = 9

export function buildAbiturDiagnosticExam(exam: EpExam): EpExam {
  const domains = ['Analysis', 'Analytische Geometrie/Lineare Algebra', 'Stochastik']
  const questions = domains.flatMap((domain) => exam.questions
    .filter((question) => question.contentDomain === domain)
    .slice(0, 3))
    .map((question, index) => ({ ...question, index, module: 'Diagnostic' }))

  return {
    ...exam,
    _id: 51,
    exam: 'Free Abitur Mathematik Diagnostic Test',
    examCode: 'ABITUR-MATHEMATIK-DIAGNOSTIC',
    totalCount: questions.length,
    questions,
    result: null,
  }
}
