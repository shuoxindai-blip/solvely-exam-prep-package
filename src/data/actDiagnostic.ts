import type { EpExam } from '../types/epV2'

export const ACT_DIAGNOSTIC_QUESTIONS_PER_SECTION = 5
const sectionIds = ['english', 'mathematics', 'reading', 'science']

export function buildActDiagnosticExam(exam: EpExam): EpExam {
  const questions = sectionIds.flatMap((sectionId) => {
    const sectionQuestions = exam.questions.filter((question) => question.sectionId === sectionId)
    const selected = []
    const usedDomains = new Set<string>()
    for (const question of sectionQuestions) {
      if (selected.length >= ACT_DIAGNOSTIC_QUESTIONS_PER_SECTION) break
      if (!usedDomains.has(question.contentDomain)) { selected.push(question); usedDomains.add(question.contentDomain) }
    }
    for (const question of sectionQuestions) {
      if (selected.length >= ACT_DIAGNOSTIC_QUESTIONS_PER_SECTION) break
      if (!selected.includes(question)) selected.push(question)
    }
    return selected
  }).map((question, index) => ({ ...question, index }))
  return { ...exam, _id: 20, exam: 'Free ACT Diagnostic Test', examCode: 'ACT-DIAGNOSTIC', totalCount: questions.length, questions, result: null }
}
