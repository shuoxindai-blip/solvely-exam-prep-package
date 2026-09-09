export const assessmentStates = [
  'not-started',
  'in-progress',
  'scoring',
  'results',
] as const

export type AssessmentState = (typeof assessmentStates)[number]
export type AssessmentKind = 'diagnostic' | 'practice'
export type CourseEntryState = 'first-visit' | 'in-progress'
export type HomeExperienceState = 'empty' | 'active'
export type HomePreviewState = 'first-entry' | 'active' | null

export type PrepStateSnapshot = {
  courseState: CourseEntryState
  diagnosticState: AssessmentState
  practiceState: AssessmentState
}

const activeAttemptStates = new Set<AssessmentState>(['in-progress', 'scoring'])

export function assessmentState(value: unknown): AssessmentState {
  return assessmentStates.includes(value as AssessmentState)
    ? value as AssessmentState
    : 'not-started'
}

export function isActiveAttemptState(value: AssessmentState) {
  return activeAttemptStates.has(value)
}

/**
 * Normalizes the latest diagnostic and full-length attempts into a reachable
 * course snapshot. Historical results are separate records and are not lost
 * when the latest attempt changes.
 */
export function normalizePrepState(input: {
  courseHasLearningProgress: boolean
  diagnosticState: unknown
  practiceState: unknown
  preferredActiveAssessment?: AssessmentKind
}): PrepStateSnapshot {
  let diagnosticState = assessmentState(input.diagnosticState)
  let practiceState = assessmentState(input.practiceState)

  if (isActiveAttemptState(diagnosticState) && isActiveAttemptState(practiceState)) {
    if (input.preferredActiveAssessment === 'diagnostic') practiceState = 'not-started'
    else diagnosticState = 'not-started'
  }

  const hasAssessmentActivity =
    diagnosticState !== 'not-started' || practiceState !== 'not-started'

  return {
    courseState: input.courseHasLearningProgress || hasAssessmentActivity
      ? 'in-progress'
      : 'first-visit',
    diagnosticState,
    practiceState,
  }
}

export function deriveHomeExperienceState(input: {
  preview: HomePreviewState
  createdPlanCount: number
  startedCourseCount: number
}): HomeExperienceState {
  if (input.preview === 'first-entry') return 'empty'
  if (input.preview === 'active') return 'active'
  return input.createdPlanCount > 0 || input.startedCourseCount > 0
    ? 'active'
    : 'empty'
}

export function isFullLengthRouteAllowed(access: unknown, mode: unknown) {
  return mode === 'diagnostic' || access === 'member'
}

