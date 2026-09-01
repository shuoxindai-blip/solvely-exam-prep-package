import type { EpExam } from "../types/epV2";

export const SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION = 10;

const diagnosticSectionIds = ["reading-writing", "math"] as const;

export function buildSatDiagnosticExam(exam: EpExam): EpExam {
  const questions = diagnosticSectionIds
    .flatMap((sectionId) =>
      exam.questions
        .filter((question) => question.sectionId === sectionId)
        .slice(0, SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION),
    )
    .map((question, index) => ({ ...question, index: index + 1 }));

  return {
    ...exam,
    _id: 10,
    exam: "Free SAT Diagnostic Test",
    examCode: "SAT-DIAGNOSTIC",
    totalCount: questions.length,
    questions,
    result: null,
  };
}
