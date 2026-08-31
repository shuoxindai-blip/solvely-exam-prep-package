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
  topicId: string
  order: number
  section: string
  domain: string
  skill: string
  title: string
  summary: string
  atomicTopic: string
  atomicTopicZh: string
  strategyName: string
  studyGuide: SatStudyGuide
  flashcards: SatFlashcard[]
  video: { id: string; title: string; url: string; cover: string }
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
  totals: { topics: number; flashcards: number; quizQuestions: number; mappedQuizQuestions: number; mockExams: number }
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
