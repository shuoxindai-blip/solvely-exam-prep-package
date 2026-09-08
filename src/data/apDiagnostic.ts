import type { EpExam } from "../types/epV2";

export const AP_CALCULUS_BC_DIAGNOSTIC_QUESTION_COUNT = 20;

export function buildApDiagnosticExam(exam: EpExam): EpExam {
  const questions = exam.questions
    .filter((question) => question.sectionId === "multiple-choice")
    .slice(0, AP_CALCULUS_BC_DIAGNOSTIC_QUESTION_COUNT)
    .map((question, index) => ({ ...question, index }));

  return {
    ...exam,
    _id: 11,
    exam: "Free AP Calculus BC Diagnostic Test",
    examCode: "AP-CALCULUS-BC-DIAGNOSTIC",
    totalCount: questions.length,
    questions,
    result: null,
  };
}
