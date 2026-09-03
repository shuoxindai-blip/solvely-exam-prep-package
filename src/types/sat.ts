export type SatFlashcard = {
  flashcard_id: string
  claim_id?: string
  front: string
  back: string
  image_markdown?: string
}

export type SatStudyGuide = {
  lesson_id: string
  title: string
  overview: string
  learning_objectives: string[]
  sections: Array<{ title: string; content: string }>
  worked_examples: Array<{ question: string; solution: string }>
  common_mistakes: string[]
  exam_tips: string[]
  recap: string
}

export type SatTopic = {
  id: string
  topicId: number
  topicGroupId: number
  order: number
  section: string
  domain: string
  skill: string
  title: string
  summary: string
  atomicTopic: string
  atomicTopicZh: string
  strategyName: string
  domainWeightPercent: number
  mappedQuestionCount: number
  domainWeightIndex: number
  topicFrequencyIndex: number
  importanceScore: number
  priority: 'CORE' | 'LIKELY' | 'POSSIBLE'
  flashcardCount: number
  studyGuidePracticeCount: number
  quizCount: number
}

export type SatSection = {
  id: string
  title: string
  examSection: string
  topicIds: string[]
}

export type SatManifest = {
  exam: string
  generatedFrom: string
  importanceModel: {
    schemaVersion: string
    source: string
    sourceQuestionCount: number
    domainWeightContribution: number
    topicFrequencyContribution: number
    domainWeightNormalization: string
    topicFrequencyNormalization: string
    thresholds: { core: number; likely: number; possible: number }
    officialDomainWeights: Record<string, number>
  }
  questionInventory: {
    schemaVersion: string
    sourceQuestionCount: number
    mappedQuestionCount: number
    studyGuidePracticeQuestionCount: number
    standaloneQuizQuestionCount: number
    overlapQuestionCount: number
    selectionRule: string
  }
  totals: {
    topics: number
    flashcards: number
    practiceQuestions: number
    mappedPracticeQuestions: number
    studyGuidePracticeQuestions: number
    quizQuestions: number
    mockExams: number
  }
  sections: SatSection[]
  topics: SatTopic[]
}

export type SatQuizQuestion = {
  id: string
  question: string
  options: string[]
  correctIndex: number
  answer: string
  explanation: string
  difficulty: string
  section: string
  domain: string
  skill: string
  teachingTopic: string
  pictureKey: string
  sourceUrl: string
}
