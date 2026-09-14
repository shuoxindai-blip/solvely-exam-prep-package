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
assert.match(courseOpenHandler, /courseHasDetailedDemoContent\(course\)/, 'A catalog card may open only when its course content is ready.')
assert.match(courseOpenHandler, /openCourse\(course\)/, 'Every ready catalog card must enter its own course.')
assert.doesNotMatch(courseOpenHandler, /openCommercialPaywall|isProMember/, 'Ready course entry must never be membership-gated.')
assert.match(packageViewSource, /:disabled="!courseHasDetailedDemoContent\(course\)"/, 'Courses without real demo data must remain disabled.')
assert.match(packageViewSource, /course: course\.title/, 'Course navigation must preserve the selected course instead of mapping it to another subject.')
assert.match(prdSource, /当前 Demo 仅 SAT、ACT、AP Calculus BC、Abitur Mathematik 4 门有完整数据并可进入/, 'The PRD must name the four data-ready demo courses.')
assert.match(prdSource, /任何 `course_ready=true` 的课程对 Free\/Pro 使用同一入口/, 'The PRD must define ready course entry as Free.')
assert.match(prdSource, /进入课程时不得弹 Paywall/, 'The PRD must prohibit paywalls at course entry.')
for (const forbiddenCopy of ['Unlock analysis', 'Unlock report', 'Unlock Score Report', 'Unlock to continue']) {
  assert.doesNotMatch(packageViewSource, new RegExp(forbiddenCopy), `Removed Full-Length Free copy must not return: ${forbiddenCopy}`)
}

console.log(`Verified ${reachablePairs.length} reachable assessment-state pairs, four data-ready demo courses, free ready-course entry, report-gate copy, free mini quiz, and all home/access invariants.`)
