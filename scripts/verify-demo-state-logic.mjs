import assert from 'node:assert/strict'
import {
  assessmentStates,
  deriveHomeExperienceState,
  isActiveAttemptState,
  isFullLengthRouteAllowed,
  normalizePrepState,
} from '../src/domain/prepState.ts'

const reachablePairs = []
for (const diagnosticState of assessmentStates) {
  for (const practiceState of assessmentStates) {
    const bothActive = isActiveAttemptState(diagnosticState) && isActiveAttemptState(practiceState)
    if (!bothActive) reachablePairs.push(`${diagnosticState}|${practiceState}`)

    const normalized = normalizePrepState({
      courseHasLearningProgress: false,
      diagnosticState,
      practiceState,
      preferredActiveAssessment: 'practice',
    })
    assert.equal(
      isActiveAttemptState(normalized.diagnosticState) && isActiveAttemptState(normalized.practiceState),
      false,
      'Only one latest attempt may be in progress or scoring.',
    )
    assert.equal(
      normalized.courseState === 'first-visit',
      normalized.diagnosticState === 'not-started' && normalized.practiceState === 'not-started',
      'First visit is only reachable before learning or assessment activity.',
    )
  }
}

assert.equal(reachablePairs.length, 12)
assert.equal(deriveHomeExperienceState({ preview: null, createdPlanCount: 0, startedCourseCount: 0 }), 'empty')
assert.equal(deriveHomeExperienceState({ preview: null, createdPlanCount: 1, startedCourseCount: 0 }), 'active')
assert.equal(deriveHomeExperienceState({ preview: null, createdPlanCount: 0, startedCourseCount: 1 }), 'active')
assert.equal(deriveHomeExperienceState({ preview: 'first-entry', createdPlanCount: 2, startedCourseCount: 2 }), 'empty')
assert.equal(deriveHomeExperienceState({ preview: 'active', createdPlanCount: 0, startedCourseCount: 0 }), 'active')
assert.equal(isFullLengthRouteAllowed('free', undefined), false)
assert.equal(isFullLengthRouteAllowed('free', 'diagnostic'), true)
assert.equal(isFullLengthRouteAllowed('member', undefined), true)

console.log(`Verified ${reachablePairs.length} reachable assessment-state pairs and all home/access invariants.`)

