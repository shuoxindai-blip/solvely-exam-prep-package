import type { SatStudyGuide } from './sat'

export type EpContentType = 'studyGuide' | 'flashCard' | 'quiz'
export type EpContentStatus = 'NOT_GENERATED' | 'GENERATING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'FAIL'

export type EpOutlineTopic = {
  id: number
  originTopicId: string
  title: string
  description: string
  relevanceScore: number
  importanceScore: number
  domainWeightPercent: number
  mappedQuestionCount: number
  domainWeightIndex: number
  topicFrequencyIndex: number
  priority: 'CORE' | 'LIKELY' | 'POSSIBLE'
}

export type EpReportQuestionStatus = 'CORRECT' | 'INCORRECT' | 'OMITTED'

export type EpExamResultQuestion = {
  questionId: number
  userAnswer: string | null
  correctAnswer: string
  status: EpReportQuestionStatus
  earnedRawPoints: number
  maximumRawPoints: number
  timeSpentSeconds: number
}

export type EpExamResultSection = {
  sectionId: string
  sectionTitle: string
  score: number
  maximumScore: number
  scoreRange: [number, number]
  averageScore: number
  percentile: number
  correct: number
  incorrect: number
  omitted: number
  accuracy: number
  averageSeconds: number
}

export type EpExamResultModule = {
  sectionId: string
  sectionTitle: string
  module: string
  route: string
  total: number
  correct: number
  incorrect: number
  omitted: number
  accuracy: number
  averageSeconds: number
}

export type EpExamResultDomain = {
  sectionId: string
  sectionTitle: string
  contentDomain: string
  total: number
  correct: number
  incorrect: number
  omitted: number
  accuracy: number
  masteryLevel: 1 | 2 | 3 | 4 | 5
  averageSeconds: number
}

export type EpExamResultDifficulty = {
  sectionId: string
  difficulty: string
  total: number
  correct: number
  accuracy: number
  averageSeconds: number
}

export type EpExamResultCombinedScore = {
  id: 'STEM' | 'ELA'
  label: string
  score: number | null
  maximumScore: 36
  status: 'AVAILABLE' | 'NOT_AVAILABLE'
  formula: string
  requiredSectionIds: string[]
  missingSectionIds: string[]
}

export type EpExamResult = {
  schemaVersion: string
  attemptId: string
  status: 'COMPLETED'
  completedAt: string
  durationSeconds: number
  totalScore: number
  maximumScore: number
  scoreRange: [number, number]
  averageScore: number
  percentile: number
  correct: number
  incorrect: number
  omitted: number
  accuracy: number
  overview: string
  sections: EpExamResultSection[]
  modules: EpExamResultModule[]
  domains: EpExamResultDomain[]
  difficulties: EpExamResultDifficulty[]
  questions: EpExamResultQuestion[]
  combinedScores?: EpExamResultCombinedScore[]
}

export type EpTopicGroup = {
  id: number
  originTopicGroupId: string
  sectionId: string
  sectionTitle: string
  title: string
  relevanceScore: number
  domainWeightPercent: number
  topics: EpOutlineTopic[]
}

export type EpTopicImportanceModel = {
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

export type EpQuestionInventory = {
  schemaVersion: string
  sourceQuestionCount: number
  mappedQuestionCount: number
  studyGuidePracticeQuestionCount: number
  standaloneQuizQuestionCount: number
  overlapQuestionCount: number
  selectionRule: string
}

export type EpPreparation = {
  _id: number
  deviceId: string
  platform: string
  packageId: number
  exam: string
  examCode: string
  subject: string
  course: { id: number | null; schoolId: number | null; name: string; code: string }
  type: string
  metadata: {
    schemaVersion: 'EP_V2'
    totals: {
      topics: number
      flashcards: number
      practiceQuestions: number
      mappedPracticeQuestions: number
      studyGuidePracticeQuestions: number
      quizQuestions: number
      mockExams: number
    }
    importanceModel: EpTopicImportanceModel
    questionInventory: EpQuestionInventory
    note: string
  }
  language: string
  country: string
  region: string
  deletedAt: string | null
  outline: { outlineId: number; status: 'NOT_GENERATED' | 'GENERATING' | 'READY' | 'FAIL'; topicGroups: EpTopicGroup[] }
  createdAt: string
  updatedAt: string
}

export type EpProgress = {
  totalCount: number
  completedCount: number
  items: Record<string, unknown>
}

export type EpTopicContentBase = {
  epId: number
  outlineId: number
  topicGroupId: number
  topicId: number
  packageId: number
  contentType: EpContentType
  contentStatus: EpContentStatus
  generationId: string
  progress: EpProgress
  platform: string
}

export type EpStudyGuideContent = EpTopicContentBase & {
  contentType: 'studyGuide'
  payload: {
    content: SatStudyGuide
    items: EpQuestion[]
    videoLesson: {
      title: string
      coverUrl: string
      playbackUrl: string
      durationSeconds: number
      description: string
    }
  }
  lastViewedQuestionId: number | null
  lastViewedAt: string | null
}

export type EpFlashCard = {
  id: number
  topicId: number
  type: 'FLASH_CARD'
  info: string
  backInfo: string
  imageMarkdown: string
  cardType: 'BASIC'
  userStatus: string
}

export type EpFlashCardContent = EpTopicContentBase & {
  contentType: 'flashCard'
  payload: { cards: EpFlashCard[] }
}

export type EpQuestion = {
  id: number
  sourceQuestionId: string
  topicId: number
  type: 'MULTIPLE_CHOICE' | 'STUDENT_PRODUCED_RESPONSE' | 'CHECK_QUESTION'
  quizType?: 'QUIZ'
  stem: string
  options: Record<string, string>
  correctAnswer: string
  explanation: string
  userAnswer: string | null
  isCorrect: -1 | 0 | 1
}

export type EpQuizContent = EpTopicContentBase & {
  contentType: 'quiz'
  payload: { questions: EpQuestion[] }
}

export type EpTopicContent = EpStudyGuideContent | EpFlashCardContent | EpQuizContent

export type EpTopicContentIndex = {
  collection: 'epTopicContents'
  uniqueIndex: ['epId', 'outlineId', 'topicId', 'contentType']
  documents: Array<{
    epId: number
    outlineId: number
    packageId: number
    topicGroupId: number
    topicId: number
    contentType: EpContentType
    contentStatus: EpContentStatus
    totalCount: number
    path: string
  }>
}

export type EpExamQuestion = EpQuestion & {
  index: number
  topicGroupId: number
  sectionId: string
  sectionTitle: string
  module: string
  route: string
  contentDomain: string
  officialSkill: string
  teachingTopic: string
  difficulty: string
  secondaryClassification?: string
  isScored: boolean
  maximumRawPoints: number
  responseType: 'MULTIPLE_CHOICE' | 'STUDENT_PRODUCED_RESPONSE'
  stimulusMaterial?: unknown | null
  attachments?: unknown[]
  scoreDetail?: Record<string, unknown> | null
}

export type EpExam = {
  _id: number
  epId: number
  outlineId: number
  packageId: number
  exam: string
  examCode: string
  subject: string
  examStatus: string
  overviewStatus: string
  totalCount: number
  questions: EpExamQuestion[]
  result: EpExamResult | null
  submittedAt: string | null
  completedAt: string | null
}
