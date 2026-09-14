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
const prdSource = readFileSync(new URL('../docs/prd/exam-prep-courses/PRD-Exam-Prep-Courses.md', import.meta.url), 'utf8')
const miniQuizHandler = packageViewSource.match(/function practiceReviewQuestion[\s\S]*?\n}\nasync function loadSimilarQuiz/)?.[0] ?? ''
assert.match(miniQuizHandler, /showModal\(\)/, 'Start mini quiz must open the drawer directly.')
assert.doesNotMatch(miniQuizHandler, /openCommercialPaywall|isProMember/, 'Diagnostic mini quiz must stay free.')
const courseOpenHandler = packageViewSource.match(/function openCourseFromHome[\s\S]*?\n}\nfunction courseHomeAction/)?.[0] ?? ''
assert.match(courseOpenHandler, /openCourse\(course\)/, 'Every catalog card must enter its course.')
assert.doesNotMatch(courseOpenHandler, /openCommercialPaywall|isProMember|isCourseAvailable/, 'Course entry must never be membership-gated.')
assert.doesNotMatch(packageViewSource, /:disabled="!isCourseAvailable\(course\)"/, 'Catalog cards must not be disabled by the old availability gate.')
assert.match(packageViewSource, /course: course\.title/, 'Course navigation must preserve the selected course instead of mapping it to another subject.')
assert.match(prdSource, /52 门课程均可进入；学习工具完整免费/, 'The PRD must define course entry as Free.')
assert.match(prdSource, /进入课程时不得弹 Paywall/, 'The PRD must prohibit paywalls at course entry.')
for (const forbiddenCopy of ['Unlock analysis', 'Unlock report', 'Unlock Score Report', 'Unlock to continue']) {
  assert.doesNotMatch(packageViewSource, new RegExp(forbiddenCopy), `Removed Full-Length Free copy must not return: ${forbiddenCopy}`)
}

console.log(`Verified ${reachablePairs.length} reachable assessment-state pairs, free course entry, report-gate copy, free mini quiz, and all home/access invariants.`)
