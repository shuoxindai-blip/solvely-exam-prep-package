import type { SatManifest, SatQuizQuestion } from '../types/sat'

let manifestPromise: Promise<SatManifest> | undefined
const quizPromises = new Map<string, Promise<SatQuizQuestion[]>>()

export function loadSatManifest() {
  manifestPromise ??= fetch('/data/sat/topics.json').then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load SAT topics (${response.status})`)
    return response.json() as Promise<SatManifest>
  })
  return manifestPromise
}

export function loadTopicQuiz(topicId: string) {
  if (!quizPromises.has(topicId)) {
    quizPromises.set(topicId, fetch(`/data/sat/quizzes/${encodeURIComponent(topicId)}.json`).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load topic quiz (${response.status})`)
      const payload = await response.json() as { questions: SatQuizQuestion[] }
      return payload.questions
    }))
  }
  return quizPromises.get(topicId) as Promise<SatQuizQuestion[]>
}
