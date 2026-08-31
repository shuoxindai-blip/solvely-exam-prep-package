export const IMPROVE_PRACTICE_PROGRESS_KEY = 'sat_improve_practice_progress_v1'

export type ImprovePracticeProgress = Record<string, number>

export function loadImprovePracticeProgress(): ImprovePracticeProgress {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMPROVE_PRACTICE_PROGRESS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed as ImprovePracticeProgress : {}
  } catch {
    return {}
  }
}

export function saveImprovePracticeProgress(topicId: string, answered: number) {
  if (typeof window === 'undefined') return
  const progress = loadImprovePracticeProgress()
  progress[topicId] = Math.max(0, Math.round(answered))
  window.localStorage.setItem(IMPROVE_PRACTICE_PROGRESS_KEY, JSON.stringify(progress))
}
