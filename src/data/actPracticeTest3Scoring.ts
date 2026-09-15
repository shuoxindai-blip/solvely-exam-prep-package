export type ActPracticeTest3Section = 'english' | 'mathematics' | 'reading' | 'science'

const scoreTables: Record<ActPracticeTest3Section, readonly number[]> = {
  english: [1, 2, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 11, 12, 13, 14, 14, 15, 15, 16, 17, 18, 19, 20, 20, 21, 21, 22, 23, 23, 24, 25, 26, 27, 28, 30, 32, 34, 35, 35, 36],
  mathematics: [1, 4, 7, 9, 10, 11, 12, 13, 14, 14, 14, 14, 15, 15, 16, 16, 16, 17, 17, 17, 18, 18, 19, 20, 21, 22, 23, 24, 25, 25, 26, 27, 27, 28, 29, 30, 31, 33, 34, 35, 36, 36],
  reading: [1, 3, 5, 7, 9, 10, 11, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 30, 32, 34, 35, 36],
  science: [1, 3, 5, 7, 9, 10, 11, 11, 12, 13, 14, 15, 16, 17, 18, 18, 19, 20, 21, 21, 22, 23, 23, 24, 24, 25, 26, 26, 27, 28, 30, 32, 34, 35, 36],
}

export const ACT_PRACTICE_TEST_3_UNSCORED: Record<ActPracticeTest3Section, ReadonlySet<number>> = {
  english: new Set(Array.from({ length: 10 }, (_, index) => index + 11)),
  mathematics: new Set([6, 18, 29, 40]),
  reading: new Set(Array.from({ length: 9 }, (_, index) => index + 10)),
  science: new Set(Array.from({ length: 6 }, (_, index) => index + 11)),
}

export function getActPracticeTest3ScaleScore(section: ActPracticeTest3Section, rawScore: number) {
  const table = scoreTables[section]
  const bounded = Math.max(0, Math.min(table.length - 1, Math.round(rawScore)))
  return table[bounded]
}

export function getActWritingPracticeEstimate() {
  const rubricScores = {
    ideasAndAnalysis: 4,
    developmentAndSupport: 4,
    organization: 5,
    languageUseAndConventions: 4,
  }
  const doubledDomainScores = Object.values(rubricScores).map((score) => score * 2)
  return {
    score: Math.round(doubledDomainScores.reduce((sum, score) => sum + score, 0) / doubledDomainScores.length),
    maximumScore: 12 as const,
    rubricScores,
    note: 'Estimated practice score based on the ACT Writing rubric; not an official ACT score.',
  }
}
