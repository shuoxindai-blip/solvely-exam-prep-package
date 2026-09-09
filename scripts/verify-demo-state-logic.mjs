import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assessmentStates,
  diagnosticReportPrerequisiteCopy,
  deriveHomeExperienceState,
  fullLengthFreeGateCopy,
  fullLengthMemberReportPrerequisiteCopy,
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

assert.deepEqual(fullLengthFreeGateCopy, {
  title: 'Unlock the full-length test and score analysis with Solvely Pro',
  cta: 'Unlock test & analysis',
})
assert.deepEqual(Object.keys(diagnosticReportPrerequisiteCopy), ['not-started', 'in-progress', 'scoring'])
assert.deepEqual(Object.keys(fullLengthMemberReportPrerequisiteCopy), ['not-started', 'in-progress', 'scoring'])

const packageViewSource = readFileSync(new URL('../src/views/ExamPrepPackageView.vue', import.meta.url), 'utf8')
const miniQuizHandler = packageViewSource.match(/function practiceReviewQuestion[\s\S]*?\n}\nasync function loadSimilarQuiz/)?.[0] ?? ''
assert.match(miniQuizHandler, /showModal\(\)/, 'Start mini quiz must open the drawer directly.')
assert.doesNotMatch(miniQuizHandler, /openCommercialPaywall|isProMember/, 'Diagnostic mini quiz must stay free.')
for (const forbiddenCopy of ['Unlock analysis', 'Unlock report', 'Unlock Score Report', 'Unlock to continue']) {
  assert.doesNotMatch(packageViewSource, new RegExp(forbiddenCopy), `Removed Full-Length Free copy must not return: ${forbiddenCopy}`)
}

console.log(`Verified ${reachablePairs.length} reachable assessment-state pairs, report-gate copy, free mini quiz, and all home/access invariants.`)
