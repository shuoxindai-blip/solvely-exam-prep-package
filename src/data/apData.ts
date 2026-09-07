import type { EpContentType, EpExam, EpPreparation, EpQuizContent, EpTopicContent, EpTopicContentIndex } from '../types/epV2'
import type { SatManifest, SatQuizQuestion } from '../types/sat'
import { normalizeQuestionOptions, orderedOptionEntries } from '../utils/questionOptions'

let preparationPromise: Promise<EpPreparation> | undefined
let contentIndexPromise: Promise<EpTopicContentIndex> | undefined
let manifestPromise: Promise<SatManifest> | undefined
const contentPromises = new Map<string, Promise<EpTopicContent>>()
const examPromises = new Map<number, Promise<EpExam>>()

async function fetchJson<T>(path: string, label: string) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Unable to load ${label} (${response.status})`)
  return response.json() as Promise<T>
}

export function loadApEpPreparation() {
  preparationPromise ??= fetchJson<EpPreparation>('/data/ap-calculus-bc/ep-v2/epPreparations/4001.json', 'AP Calculus BC epPreparation')
  return preparationPromise
}

export function loadApEpTopicContentIndex() {
  contentIndexPromise ??= fetchJson<EpTopicContentIndex>('/data/ap-calculus-bc/ep-v2/epTopicContents/index.json', 'AP Calculus BC epTopicContents index')
  return contentIndexPromise
}

export function loadApEpExam(examId: number) {
  const safeExamId = examId === 1 ? 1 : 1
  if (!examPromises.has(safeExamId)) {
    examPromises.set(safeExamId, fetchJson<EpExam>('/data/ap-calculus-bc/ep-v2/epExams/1.json', 'AP Calculus BC epExam 1'))
  }
  return examPromises.get(safeExamId) as Promise<EpExam>
}

export function loadApManifest() {
  manifestPromise ??= Promise.all([loadApEpPreparation(), loadApEpTopicContentIndex()]).then(([preparation, contentIndex]) => {
    let order = 0
    const topics = preparation.outline.topicGroups.flatMap((group) => group.topics.map((topic) => {
      order += 1
      const documents = contentIndex.documents.filter((document) => document.topicId === topic.id)
      return {
        id: topic.originTopicId,
        topicId: topic.id,
        topicGroupId: group.id,
        order,
        section: group.sectionTitle,
        domain: group.title,
        skill: group.title,
        title: topic.title,
        summary: topic.description,
        atomicTopic: topic.title,
        atomicTopicZh: '',
        strategyName: group.title,
        domainWeightPercent: topic.domainWeightPercent,
        mappedQuestionCount: topic.mappedQuestionCount,
        domainWeightIndex: topic.domainWeightIndex,
        topicFrequencyIndex: topic.topicFrequencyIndex,
        importanceScore: topic.importanceScore,
        priority: topic.priority,
        flashcardCount: documents.find((document) => document.contentType === 'flashCard')?.totalCount ?? 0,
        studyGuidePracticeCount: documents.find((document) => document.contentType === 'studyGuide')?.totalCount ?? 0,
        quizCount: documents.find((document) => document.contentType === 'quiz')?.totalCount ?? 0,
      }
    }))
    return {
      exam: preparation.exam,
      generatedFrom: `${preparation.metadata.schemaVersion} / AP Calculus BC epPreparations + epTopicContents + epExams`,
      importanceModel: preparation.metadata.importanceModel,
      questionInventory: preparation.metadata.questionInventory,
      totals: preparation.metadata.totals,
      sections: preparation.outline.topicGroups.map((group) => ({ id: group.originTopicGroupId, title: group.title, examSection: group.sectionTitle, topicIds: group.topics.map((topic) => topic.originTopicId) })),
      topics,
    }
  })
  return manifestPromise
}

export async function loadApTopicContent(originTopicId: string, contentType: EpContentType) {
  const cacheKey = `${originTopicId}:${contentType}`
  if (!contentPromises.has(cacheKey)) {
    contentPromises.set(cacheKey, Promise.all([loadApEpPreparation(), loadApEpTopicContentIndex()]).then(async ([preparation, index]) => {
      const outlineTopic = preparation.outline.topicGroups.flatMap((group) => group.topics).find((topic) => topic.originTopicId === originTopicId)
      if (!outlineTopic) throw new Error(`Unknown AP Calculus BC EP V2 topic: ${originTopicId}`)
      const document = index.documents.find((item) => item.topicId === outlineTopic.id && item.contentType === contentType)
      if (!document) throw new Error(`Missing AP Calculus BC ${contentType} content for ${originTopicId}`)
      const content = await fetchJson<EpTopicContent>(document.path, `AP Calculus BC epTopicContent ${contentType}`)
      if (content.contentType === 'studyGuide') {
        return { ...content, payload: { ...content.payload, items: content.payload.items.map(normalizeQuestionOptions) } }
      }
      if (content.contentType === 'quiz') {
        return { ...content, payload: { ...content.payload, questions: content.payload.questions.map(normalizeQuestionOptions) } }
      }
      return content
    }))
  }
  return contentPromises.get(cacheKey) as Promise<EpTopicContent>
}

export async function loadApTopicQuiz(topicId: string) {
  const [manifest, content] = await Promise.all([loadApManifest(), loadApTopicContent(topicId, 'quiz')])
  const topic = manifest.topics.find((item) => item.id === topicId)
  return (content as EpQuizContent).payload.questions.map<SatQuizQuestion>((question) => {
    const optionEntries = orderedOptionEntries(question.options)
    return {
      id: String(question.id),
      question: question.stem,
      options: optionEntries.map(([, value]) => value),
      optionLabels: optionEntries.map(([letter]) => letter),
      correctIndex: optionEntries.findIndex(([letter]) => letter === question.correctAnswer),
      answer: question.correctAnswer,
      explanation: question.explanation,
      difficulty: '',
      section: topic?.section ?? '',
      domain: topic?.domain ?? '',
      skill: topic?.skill ?? '',
      teachingTopic: topic?.title ?? '',
      pictureKey: '',
      sourceUrl: '',
    }
  })
}
