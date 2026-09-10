<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CommercialDemoController from "../components/CommercialDemoController.vue";
import ProPaywall from "../components/ProPaywall.vue";
import { useProAccess } from "../composables/useProAccess";
import { loadEpExam, loadSatManifest, loadTopicQuiz } from "../data/satData";
import { buildSatDiagnosticExam } from "../data/satDiagnostic";
import { buildReviewQuestions, buildSatReport } from "../data/satReport";
import { loadActEpExam, loadActManifest, loadActTopicQuiz } from "../data/actData";
import { buildActDiagnosticExam } from "../data/actDiagnostic";
import { buildActReport } from "../data/actReport";
import { loadApEpExam, loadApManifest, loadApTopicQuiz } from "../data/apData";
import { buildApDiagnosticExam } from "../data/apDiagnostic";
import { buildApReport } from "../data/apReport";
import { loadImprovePracticeProgress } from "../data/improvePracticeProgress";
import type { SatReportReviewQuestion } from "../data/satReport";
import type { EpExam } from "../types/epV2";
import type { SatManifest, SatQuizQuestion, SatTopic } from "../types/sat";
import {
  assessmentStates,
  diagnosticReportPrerequisiteCopy,
  deriveHomeExperienceState,
  fullLengthFreeGateCopy,
  fullLengthMemberReportPrerequisiteCopy,
  isActiveAttemptState,
  normalizePrepState,
  type AssessmentKind,
  type AssessmentState,
  type CourseEntryState,
  type HomePreviewState as RouteHomePreviewState,
} from "../domain/prepState";

type CourseTab = "study" | "results";
type ExamFamily = "sat" | "act" | "ap-calculus-bc";
type ResultView = "full" | "score" | "review" | "improve";
type ResultSource = "diagnostic" | "practice";
type HomePreviewState = "empty" | "created";
type FirstEntryTab = "create" | "courses";

const FIRST_ENTRY_HOME_TITLE = "Adaptive Exam Prep, Tailored to You";
const FIRST_ENTRY_HOME_SUBTITLE =
  "Create your study plan, practice realistic exam questions, or start an interactive course.";
const ACTIVE_HOME_TITLE = "Stay on Track for Your Best Score";
const ACTIVE_HOME_SUBTITLE =
  "Personalized exam prep, all the way to test day.";
type DiagnosticTestState = AssessmentState;
type PracticeTestState = AssessmentState;
type ReviewFilter = "ALL" | "INCORRECT" | "CORRECT" | "OMITTED";
type ReviewSectionFilter = string;
type Course = {
  family: string;
  label: string;
  icon: string;
  title: string;
  topics: string;
  videos: string;
  questions: string;
  search: string;
};
type CreatedPrediction = {
  id: string;
  title: string;
  date: string;
  focus: string;
};
type LastActivity =
  | {
      kind: "learning";
      examFamily: ExamFamily;
      examTitle: string;
      sectionTitle: string;
      itemTitle: string;
      resourceLabel: string;
      progressPercent: number;
      topicId: string;
    }
  | {
      kind: "exam";
      examFamily: ExamFamily;
      examTitle: string;
      sectionTitle: string;
      itemTitle: string;
      moduleLabel: string;
      answered: number;
      total: number;
      examId: number;
    };

function isLastActivity(value: unknown): value is LastActivity {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Record<string, unknown>;
  const validFamily = activity.examFamily === "sat" || activity.examFamily === "act" || activity.examFamily === "ap-calculus-bc";
  const common = validFamily && typeof activity.examTitle === "string" &&
    typeof activity.sectionTitle === "string" && typeof activity.itemTitle === "string";
  if (!common) return false;
  if (activity.kind === "learning") {
    return typeof activity.resourceLabel === "string" &&
      typeof activity.progressPercent === "number" && typeof activity.topicId === "string";
  }
  if (activity.kind === "exam") {
    return typeof activity.moduleLabel === "string" && typeof activity.answered === "number" &&
      typeof activity.total === "number" && typeof activity.examId === "number";
  }
  return false;
}

const route = useRoute();
const router = useRouter();
const examFamily = computed<ExamFamily>(() => {
  const queryExam = String(route.query.exam || "").toLowerCase();
  if (queryExam === "ap-calculus-bc" || route.hash === "#course-2") return "ap-calculus-bc";
  if (queryExam === "act" || route.hash === "#course-1") return "act";
  return "sat";
});
const isActPackage = computed(() => examFamily.value === "act");
const isApPackage = computed(() => examFamily.value === "ap-calculus-bc");
const activeCourseHash = computed(() => isApPackage.value ? "#course-2" : isActPackage.value ? "#course-1" : "#course-0");
const examName = computed(() => isApPackage.value ? "AP Calculus BC" : isActPackage.value ? "ACT" : "SAT");
const packageTitle = computed(() => isApPackage.value ? "AP Calculus BC Prep 2027" : `${examName.value} Prep 2026`);
const examRouteQuery = computed<Record<string, string>>(() => examFamily.value === "sat" ? {} as Record<string, string> : { exam: examFamily.value });
const { accessState, isProMember, setProAccess } = useProAccess();
const manifest = ref<SatManifest | null>(null);
const loadError = ref("");
const sidebarCollapsed = ref(false);
const activeTab = ref<CourseTab>("study");
const searchQuery = ref("");
const familyFilter = ref("all");
const sectionFilter = ref<string>("Math");
const priorityFilter = ref("all");
const collapsedSections = ref(new Set<string>());
const resultExam = ref<EpExam | null>(null);
const diagnosticSourceExam = ref<EpExam | null>(null);
const resultLoadError = ref("");
const resultView = ref<ResultView>("full");
const reviewFilter = ref<ReviewFilter>("ALL");
const reviewSectionFilter = ref<ReviewSectionFilter>("ALL");
const selectedReviewQuestionId = ref<number | null>(null);
const improveSection = ref<string>("math");
const improvePriority = ref<"ALL" | SatTopic["priority"]>("ALL");
const improvePracticeProgress = ref<Record<string, number>>({});
const showImproveImportanceNote = ref(true);
const resultSource = ref<ResultSource>("practice");
const diagnosticTestState = ref<DiagnosticTestState>("not-started");
const practiceTestState = ref<PracticeTestState>("not-started");
const paywallOpen = ref(false);
const paywallContext = ref("the complete exam prep package");
const newPredictionDialog = ref<HTMLDialogElement | null>(null);
const predictionExamName = ref("");
const predictionExamDate = ref("");
const predictionFocus = ref("Balanced review");
const createdPredictions = ref<CreatedPrediction[]>([]);
const editingPredictionId = ref<string | null>(null);
const prepFileInput = ref<HTMLInputElement | null>(null);
const startedCourseFamilies = ref(new Set<ExamFamily>());
const courseActivities = ref<Partial<Record<ExamFamily, LastActivity>>>({});
const similarQuizDrawer = ref<HTMLDialogElement | null>(null);
const similarQuizBody = ref<HTMLElement | null>(null);
const similarQuizTopic = ref<SatTopic | null>(null);
const similarQuizQuestions = ref<SatQuizQuestion[]>([]);
const similarQuizIndex = ref(0);
const similarQuizAnswers = ref<Record<string, number | string>>({});
const similarQuizResponse = ref("");
const similarQuizLoading = ref(false);
const similarQuizLoadError = ref("");
const similarQuizComplete = ref(false);
let similarQuizRequestId = 0;
let pendingCommercialAction: (() => void) | null = null;
let practiceScoringTimer: number | null = null;
let diagnosticScoringTimer: number | null = null;
let studyTopicPopoverReleaseTimer: number | null = null;
const retakeDialog = ref<HTMLDialogElement | null>(null);
const demoController = ref<HTMLElement | null>(null);
const demoControllerPosition = ref<{ x: number; y: number } | null>(null);
const demoControllerDragging = ref(false);
let demoControllerDrag:
  | { pointerId: number; offsetX: number; offsetY: number }
  | null = null;
const lastActivity = ref<LastActivity>({
  kind: "learning",
  examFamily: "sat",
  examTitle: "SAT Prep 2026",
  sectionTitle: "Advanced Math",
  itemTitle: "Expansion, factoring, and completing the square",
  resourceLabel: "Study Guide",
  progressPercent: 62,
  topicId: "sat_math_advanced_equivalent_expressions_01",
});
const courseActivityList = computed(() =>
  Object.values(courseActivities.value).filter(Boolean) as LastActivity[],
);
const currentCourseActivity = computed(() => courseActivities.value[examFamily.value] ?? null);
const isCourseOpen = computed(() => ["#course-0", "#course-1", "#course-2"].includes(route.hash));
const forcedHomePreview = computed<RouteHomePreviewState>(() => {
  const override = String(route.query.homeState || "").toLowerCase();
  return override === "first-entry" || override === "active" ? override : null;
});
const homeExperienceState = computed(() => deriveHomeExperienceState({
  preview: forcedHomePreview.value,
  createdPlanCount: createdPredictions.value.length,
  startedCourseCount: courseActivityList.value.length,
}));
const showFirstEntryHome = computed(() => {
  return homeExperienceState.value === "empty";
});
const showSeededPrediction = computed(() =>
  forcedHomePreview.value === "active" &&
  createdPredictions.value.length === 0 &&
  startedCourseFamilies.value.size === 0,
);
const firstEntryTab = ref<FirstEntryTab>("create");
const firstEntryCreatePanel = ref<HTMLElement | null>(null);
const firstEntryCoursesPanel = ref<HTMLElement | null>(null);
let firstEntryScrollFrame: number | null = null;
let firstEntryScrollLockTimer: number | null = null;
const controllerHomeState = computed<HomePreviewState>(() =>
  showFirstEntryHome.value ? "empty" : "created",
);
const demoControllerStyle = computed(() =>
  demoControllerPosition.value
    ? {
        left: `${demoControllerPosition.value.x}px`,
        top: `${demoControllerPosition.value.y}px`,
        right: "auto",
        bottom: "auto",
      }
    : undefined,
);
const isCourseStarted = computed(
  () => {
    const override = String(route.query.courseState || "");
    if (override === "not-started") return false;
    if (override === "in-progress") return true;
    return startedCourseFamilies.value.has(examFamily.value);
  },
);
function activityCta(activity: LastActivity) {
  return activity.kind === "learning" ? "Continue learning" : "Resume exam";
}
function activityProgressLabel(activity: LastActivity) {
  return activity.kind === "learning"
    ? `${activity.progressPercent}% Complete`
    : `${activity.answered} of ${activity.total} Answered`;
}
function activityContextLabel(activity: LastActivity) {
  const activityType =
    activity.kind === "learning" ? activity.resourceLabel : activity.moduleLabel;
  return `${activity.sectionTitle} · ${activityType}`;
}
const practiceResultReport = computed(() => resultExam.value
  ? (isApPackage.value ? buildApReport(resultExam.value) : isActPackage.value ? buildActReport(resultExam.value) : buildSatReport(resultExam.value))
  : null);
const diagnosticExam = computed<EpExam | null>(() => {
  const exam = isActPackage.value ? diagnosticSourceExam.value : resultExam.value;
  if (!exam) return null;
  if (isApPackage.value) return buildApDiagnosticExam(exam);
  return isActPackage.value ? buildActDiagnosticExam(exam) : buildSatDiagnosticExam(exam);
});
const diagnosticResultReport = computed(() => {
  if (!diagnosticExam.value) return null;
  if (isApPackage.value) {
    const report = buildApReport(diagnosticExam.value);
    return {
      ...report,
      attemptId: "ap-calculus-bc-diagnostic-anna-2026-09-08",
      overview:
        "Your AP Calculus BC diagnostic gives you a quick starting score estimate and a unit-level view of your strengths. Use the full-length test for a complete measure of pacing and exam endurance.",
    };
  }
  const report = isActPackage.value ? buildActReport(diagnosticExam.value) : buildSatReport(diagnosticExam.value);
  if (isActPackage.value) return {
    ...report,
    attemptId: "act-diagnostic-anna-2026-09-03",
    overview: "Your diagnostic gives you a fast starting estimate across English, Mathematics, Reading, and Science. Use the full-length test for a more complete picture of your pacing and endurance.",
  };
  const sections = report.sections.map((section) => {
    const score = Math.round((200 + section.accuracy * 6) / 10) * 10;
    return {
      ...section,
      score,
      scoreRange: [
        Math.max(200, score - 30),
        Math.min(section.maximumScore, score + 30),
      ] as [number, number],
    };
  });
  const totalScore = sections.reduce((sum, section) => sum + section.score, 0);
  return {
    ...report,
    totalScore,
    scoreRange: [
      Math.max(400, totalScore - 60),
      Math.min(report.maximumScore, totalScore + 60),
    ] as [number, number],
    sections,
    attemptId: "sat-diagnostic-anna-2026-08-21",
    overview:
      "Your diagnostic shows a solid starting point in Reading and Writing. Begin with the highest-priority Math topics, then use targeted practice to close the biggest gaps.",
  };
});
const activeResultExam = computed(() =>
  resultSource.value === "diagnostic"
    ? diagnosticExam.value
    : resultExam.value,
);
const resultReport = computed(() =>
  resultSource.value === "diagnostic"
    ? diagnosticResultReport.value
    : practiceResultReport.value,
);
const actScorePathways = computed(() => {
  if (!isActPackage.value || !resultReport.value) return [];
  const report = resultReport.value;
  const combinedScores = new Map(
    (report.combinedScores ?? []).map((score) => [score.id, score]),
  );
  const sectionById = new Map(
    report.sections.map((section) => [section.sectionId, section]),
  );
  const buildPathway = (
    id: "STEM" | "ELA",
    sectionIds: string[],
    missingSections: { id: string; label: string; optional: boolean }[],
  ) => {
    const summary = combinedScores.get(id);
    return {
      id: id.toLowerCase(),
      sections: sectionIds
        .map((sectionId) => sectionById.get(sectionId))
        .filter((section) => section !== undefined),
      missingSections,
      summary: {
        label: summary?.label ?? id + " Score",
        value: summary?.score ?? null,
        maximumScore: summary?.maximumScore ?? 36,
        muted: summary?.status === "NOT_AVAILABLE",
        note: id === "STEM" ? "Math + Science" : "Requires optional Writing",
        tooltip:
          id === "STEM"
            ? (summary?.formula ?? "(Mathematics + Science) ÷ 2, rounded") +
              ". ACT reports the score when Mathematics and Science are both included."
            : (summary?.formula ?? "(English + Reading + Writing) ÷ 3, rounded") +
              ". This test does not include the optional Writing section.",
      },
    };
  };
  return [
    buildPathway("STEM", ["mathematics", "science"], []),
    buildPathway("ELA", ["english", "reading"], [
      { id: "writing", label: "Writing", optional: true },
    ]),
  ];
});
const practiceTestQuestionCount = computed(
  () => resultExam.value?.questions.length ?? resultExam.value?.totalCount ?? 0,
);
const practiceTestModuleCount = computed(
  () =>
    new Set(
      (resultExam.value?.questions ?? []).map(
        (question) => `${question.sectionId}|${question.module}`,
      ),
    ).size,
);
const practiceTestDurationMinutes = computed(() => {
  const sectionIds = new Set(
    (resultExam.value?.questions ?? []).map((question) => question.sectionId),
  );
  return isApPackage.value ? 195 : isActPackage.value ? 165 : (
    (sectionIds.has("reading-writing") ? 64 : 0) +
    (sectionIds.has("math") ? 70 : 0)
  );
});
const assessmentStateLabels: Record<AssessmentState, string> = {
  "not-started": "未开始",
  "in-progress": "进行中",
  scoring: "评分中",
  results: "结果已生成",
};
const practiceTestStates = assessmentStates.map((id) => ({ id, label: assessmentStateLabels[id] }));
const diagnosticTestStates = assessmentStates.map((id) => ({ id, label: assessmentStateLabels[id] }));
const resultSources = computed<{
  id: ResultSource;
  label: string;
}[]>(() => [
  { id: "diagnostic", label: "Diagnostic Test" },
  { id: "practice", label: "Full-Length Practice Test" },
]);
const retakeActionLabel = computed(() =>
  resultSource.value === "diagnostic"
    ? "Retake Diagnostic Test"
    : "Retake Full-Length Practice Test",
);
const commercialAccessStates = [
  { id: "free", label: "非会员" },
  { id: "member", label: "Pro 会员" },
] as const;
const courseEntryStates: { id: CourseEntryState; label: string }[] = [
  { id: "first-visit", label: "首次进入" },
  { id: "in-progress", label: "学习中" },
];
const courseEntryState = computed<CourseEntryState>(() =>
  isCourseStarted.value ? "in-progress" : "first-visit",
);
const activeAssessmentComplete = computed(() =>
  resultSource.value === "diagnostic"
    ? diagnosticTestState.value === "results"
    : practiceTestState.value === "results",
);
const resultsRequirePro = computed(
  () => resultSource.value === "practice" || resultView.value === "improve",
);
const resultsCommercialLocked = computed(
  () => resultsRequirePro.value && !isProMember.value,
);
const resultsNeedAssessment = computed(
  () => !activeAssessmentComplete.value,
);
const resultsProLocked = computed(
  () => resultsCommercialLocked.value,
);
const showResultsUnlockAction = computed(
  () => resultsProLocked.value,
);
const resultsCommercialActionLabel = computed(() =>
  resultSource.value === "diagnostic" && resultView.value === "improve"
    ? "Unlock practice"
    : fullLengthFreeGateCopy.cta,
);
const resultsCommercialBenefit = computed(() =>
  resultSource.value === "diagnostic" && resultView.value === "improve"
    ? `prioritized topics and adaptive ${examName.value} practice`
    : `the full-length ${examName.value} test and score analysis`,
);
const resultsLocked = computed(
  () => resultsNeedAssessment.value || resultsProLocked.value,
);
const targetedPracticeNeedsAssessment = computed(
  () => !activeAssessmentComplete.value,
);
const targetedPracticeProLocked = computed(
  () =>
    resultSource.value === "diagnostic" &&
    !isProMember.value,
);
const targetedPracticeLocked = computed(
  () =>
    resultsLocked.value || targetedPracticeProLocked.value,
);
const showTargetedPracticeUnlockAction = computed(
  () => targetedPracticeProLocked.value || resultsProLocked.value,
);
const targetedPracticeCommercialActionLabel = computed(() =>
  resultSource.value === "diagnostic"
    ? "Unlock practice"
    : resultsCommercialActionLabel.value,
);
const targetedPracticeCommercialBenefit = computed(() =>
  resultSource.value === "diagnostic"
    ? `prioritized topics and adaptive ${examName.value} practice`
    : resultsCommercialBenefit.value,
);
const resultsLockTitle = computed(() => {
  if (showResultsUnlockAction.value) {
    if (resultSource.value === "diagnostic")
      return "Unlock targeted practice with Solvely Pro";
    return fullLengthFreeGateCopy.title;
  }
  if (resultsNeedAssessment.value) {
    if (resultSource.value === "diagnostic") {
      return (
        diagnosticReportPrerequisiteCopy[
          diagnosticTestState.value as keyof typeof diagnosticReportPrerequisiteCopy
        ]?.title ?? "Your score report is ready"
      );
    }
    return (
      fullLengthMemberReportPrerequisiteCopy[
        practiceTestState.value as keyof typeof fullLengthMemberReportPrerequisiteCopy
      ]?.title ?? "Your score report is ready"
    );
  }
  return "Your score report is ready";
});
const targetedPracticeLockTitle = computed(() => {
  if (showTargetedPracticeUnlockAction.value) {
    return resultSource.value === "diagnostic"
      ? "Unlock targeted practice with Solvely Pro"
      : resultsLockTitle.value;
  }
  return resultsLockTitle.value;
});
const diagnosticTestCard = computed(() => {
  const report = diagnosticResultReport.value;
  const questionCount = diagnosticExam.value?.questions.length ?? 20;
  const sectionCount = isApPackage.value ? 1 : isActPackage.value ? 4 : 2;
  const readingWritingScore =
    report?.sections.find((section) => section.sectionId === "reading-writing")
      ?.score ?? 650;
  const mathScore =
    report?.sections.find((section) => section.sectionId === "math")?.score ??
    630;
  if (diagnosticTestState.value === "results")
    return {
      stateLabel: "Results ready",
      description: `Your predicted ${examName.value} score and free answer review are ready. This estimate does not replace the full-length test.`,
      metrics: isApPackage.value
        ? [
            { value: String(report?.totalScore ?? 4), label: "predicted AP score" },
            { value: String(report?.correct ?? 16), label: "correct" },
            { value: String(questionCount), label: "questions" },
          ]
        : isActPackage.value
          ? [
              { value: String(report?.totalScore ?? 25), label: "predicted composite" },
              { value: String(report?.sections.find((section) => section.sectionId === "science")?.score ?? 25), label: "Science" },
              { value: String(questionCount), label: "questions" },
            ]
          : [
              { value: String(report?.totalScore ?? 1280), label: "predicted total" },
              { value: String(readingWritingScore), label: "Reading & Writing" },
              { value: String(mathScore), label: "Math" },
            ],
      statusValue: String(
        report?.totalScore ?? (isApPackage.value ? 4 : isActPackage.value ? 25 : 1280),
      ),
      statusTotal: isApPackage.value ? "/5" : isActPackage.value ? "/36" : "/1600",
      statusUnit: "Score",
      statusMeta: "Results ready",
      cta: "View Free Results",
      disabled: false,
    };
  if (diagnosticTestState.value === "scoring")
    return {
      stateLabel: "Scoring",
      description: isApPackage.value
        ? "Your answers were submitted. We are calculating your AP score and unit-level performance estimate; results are usually ready in a few seconds."
        : isActPackage.value
          ? "Your answers were submitted. We are calculating your composite and section score predictions; results are usually ready in a few seconds."
          : "Your answers were submitted. We are calculating your total and section score predictions; results are usually ready in a few seconds.",
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: "Untimed", label: "" },
        { value: String(sectionCount), label: sectionCount === 1 ? "section" : "sections" },
      ],
      statusValue: String(questionCount),
      statusTotal: `/${questionCount}`,
      statusUnit: "Questions",
      statusMeta: "Scoring results…",
      cta: "Scoring…",
      disabled: true,
    };
  if (diagnosticTestState.value === "in-progress")
    return {
      stateLabel: "In progress",
      description:
        `Continue your quick ${examName.value} score and skill check. Your answers are saved automatically.`,
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: "Untimed", label: "" },
        { value: String(sectionCount), label: sectionCount === 1 ? "section" : "sections" },
      ],
      statusValue: "4",
      statusTotal: `/${questionCount}`,
      statusUnit: "Questions",
      statusMeta: "In progress · Sep 2, 2026",
      cta: "Continue Diagnostic",
      disabled: false,
    };
  return {
    stateLabel: "Free",
    description: isApPackage.value
      ? "Get an instant AP score estimate and unit-level skill breakdown with a focused multiple-choice diagnostic."
      : `Get an instant ${examName.value} score estimate and skill breakdown across ${isActPackage.value ? "English, Math, Reading, and Science" : "Reading & Writing and Math"}.`,
    metrics: [
      { value: String(questionCount), label: "questions" },
      { value: "Untimed", label: "" },
      { value: String(sectionCount), label: sectionCount === 1 ? "section" : "sections" },
    ],
    statusValue: "—",
    statusTotal: "",
    statusUnit: "",
    statusMeta: "Not started",
    cta: "Start Free Diagnostic",
    disabled: false,
  };
});
const practiceTestCard = computed(() => {
  const report = practiceResultReport.value;
  const questionCount = practiceTestQuestionCount.value;
  const moduleCount = practiceTestModuleCount.value;
  const durationMinutes = practiceTestDurationMinutes.value;
  const answeredCount = report ? report.correct + report.incorrect : 0;
  const savedAnsweredCount = Math.min(14, questionCount);
  const readingWritingScore =
    report?.sections.find((section) => section.sectionId === "reading-writing")
      ?.score ?? 650;
  const mathScore =
    report?.sections.find((section) => section.sectionId === "math")?.score ??
    630;
  if (practiceTestState.value === "not-started")
    return {
      stateLabel: "",
      description:
        `Take a realistic full-length ${isApPackage.value ? "AP Calculus BC" : isActPackage.value ? "ACT with Science" : "Digital SAT"} with official timing and section structure.`,
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: String(durationMinutes), label: "min" },
        { value: String(moduleCount), label: isActPackage.value || isApPackage.value ? "sections" : "modules" },
      ],
      statusValue: "—",
      statusTotal: "",
      statusUnit: "",
      statusMeta: "Not started",
      cta: "Start Practice Test",
      disabled: false,
    };
  if (practiceTestState.value === "scoring")
    return {
      stateLabel: "Scoring",
      description:
        "Your answers were submitted. We are preparing your score report and personalized recommendations; results are usually ready in under a minute.",
      metrics: [
        { value: String(answeredCount), label: "answered" },
        {
          value: report ? formatReportDuration(report.durationSeconds) : "—",
          label: "time used",
        },
        { value: String(moduleCount), label: isActPackage.value || isApPackage.value ? "sections" : "modules" },
      ],
      statusValue: String(answeredCount),
      statusTotal: `/${questionCount}`,
      statusUnit: "Questions",
      statusMeta: "Scoring results…",
      cta: "Scoring…",
      disabled: true,
    };
  if (practiceTestState.value === "results")
    return {
      stateLabel: "Results ready",
      description: `Your score report and next-step recommendations are ready. Your result is in the ${formatOrdinal(report?.percentile ?? 70)} percentile.`,
      metrics: isApPackage.value ? [
        { value: String(report?.totalScore ?? 4), label: "AP score" },
        { value: formatOrdinal(report?.percentile ?? 70), label: "percentile" },
        { value: "2", label: "sections" },
      ] : isActPackage.value ? [
        { value: String(report?.totalScore ?? 25), label: "composite" },
        { value: String(report?.sections.find((section) => section.sectionId === "science")?.score ?? 25), label: "Science" },
        { value: "4", label: "sections" },
      ] : [
        { value: String(report?.totalScore ?? 1280), label: "total score" },
        { value: String(readingWritingScore), label: "Reading & Writing" },
        { value: String(mathScore), label: "Math" },
      ],
      statusValue: String(report?.totalScore ?? (isApPackage.value ? 4 : isActPackage.value ? 25 : 1280)),
      statusTotal: isApPackage.value ? "/5" : isActPackage.value ? "/36" : "/1600",
      statusUnit: "Score",
      statusMeta: `Results ready · ${
        report ? formatReportDate(report.completedAt) : "Aug 21, 2026"
      }`,
      cta: isProMember.value ? "View Score Report" : fullLengthFreeGateCopy.cta,
      disabled: false,
    };
  return {
    stateLabel: "In progress",
    description:
      `Resume your saved attempt from ${isApPackage.value ? "Multiple Choice" : isActPackage.value ? "English, Section 1" : "Reading and Writing, Module 1"}. Your answers are saved automatically.`,
    metrics: [
      { value: String(questionCount), label: "questions" },
      { value: String(durationMinutes), label: "min" },
      { value: String(moduleCount), label: isActPackage.value || isApPackage.value ? "sections" : "modules" },
    ],
    statusValue: String(savedAnsweredCount),
    statusTotal: `/${questionCount}`,
    statusUnit: "Questions",
    statusMeta: "In progress · Sep 2, 2026",
    cta: "Continue Practice Test",
    disabled: false,
  };
});
const resultsPrerequisiteActionLabel = computed(() => {
  if (resultSource.value === "diagnostic") {
    return (
      diagnosticReportPrerequisiteCopy[
        diagnosticTestState.value as keyof typeof diagnosticReportPrerequisiteCopy
      ]?.cta ?? "Start free diagnostic"
    );
  }
  return (
    fullLengthMemberReportPrerequisiteCopy[
      practiceTestState.value as keyof typeof fullLengthMemberReportPrerequisiteCopy
    ]?.cta ?? "Start practice test"
  );
});
const showResultsStartAction = computed(() => {
  if (!resultsNeedAssessment.value || showResultsUnlockAction.value) return false;
  return resultSource.value === "diagnostic"
    ? !diagnosticTestCard.value.disabled
    : !practiceTestCard.value.disabled;
});
const showResultsGateAction = computed(
  () => showResultsStartAction.value || showResultsUnlockAction.value,
);
const showTargetedPracticeStartAction = computed(() => {
  if (
    !targetedPracticeNeedsAssessment.value ||
    showTargetedPracticeUnlockAction.value
  )
    return false;
  return resultSource.value === "diagnostic"
    ? !diagnosticTestCard.value.disabled
    : !practiceTestCard.value.disabled;
});
const showTargetedPracticeGateAction = computed(
  () =>
    showTargetedPracticeStartAction.value ||
    showTargetedPracticeUnlockAction.value,
);
const reportQuestions = computed(() =>
  activeResultExam.value && resultReport.value
    ? buildReviewQuestions(activeResultExam.value, resultReport.value)
    : [],
);
const confidenceTopics = computed(() => {
  const topicTitles = new Map(
    (manifest.value?.topics ?? []).map((topic) => [topic.topicId, topic.title]),
  );
  const groups = new Map<
    string,
    {
      topicId: number;
      sectionId: string;
      sectionTitle: string;
      domain: string;
      label: string;
      correct: number;
      attempts: number;
      total: number;
      omitted: number;
      seconds: number[];
    }
  >();
  reportQuestions.value.forEach((question) => {
    const groupKey = `${question.sectionId}|${question.teachingTopic || question.topicId}`;
    const group = groups.get(groupKey) ?? {
      topicId: question.topicId,
      sectionId: question.sectionId,
      sectionTitle: question.sectionTitle,
      domain: question.contentDomain,
      label:
        question.teachingTopic ||
        topicTitles.get(question.topicId) ||
        question.officialSkill,
      correct: 0,
      attempts: 0,
      total: 0,
      omitted: 0,
      seconds: [],
    };
    group.total += 1;
    if (question.status === "OMITTED") group.omitted += 1;
    else {
      group.attempts += 1;
      group.correct += question.status === "CORRECT" ? 1 : 0;
      if (question.timeSpentSeconds > 0)
        group.seconds.push(question.timeSpentSeconds);
    }
    groups.set(groupKey, group);
  });
  const plottedTopics = [...groups.values()].map((group) => {
    const section = resultReport.value?.sections.find(
      (item) => item.sectionId === group.sectionId,
    );
    const accuracyBenchmark = section?.accuracy ?? 75;
    const timeBenchmark = section?.averageSeconds ?? 75;
    const seed = Math.abs(
      (group.topicId * 9301 + group.sectionId.length * 49297) % 233280,
    );
    const accuracy = group.attempts
      ? Math.round((group.correct / group.attempts) * 100)
      : 0;
    const averageSeconds = group.seconds.length
      ? Math.round(
          group.seconds.reduce((sum, seconds) => sum + seconds, 0) /
            group.seconds.length,
        )
      : 0;
    const plottedSeconds = averageSeconds || timeBenchmark + 30;
    const highAccuracy = accuracy >= accuracyBenchmark;
    const fastPace = averageSeconds > 0 && averageSeconds <= timeBenchmark;
    const accuracyRange = highAccuracy
      ? (99 - accuracy) / Math.max(1, 99 - accuracyBenchmark)
      : (accuracyBenchmark - accuracy) / Math.max(1, accuracyBenchmark);
    const paceRange = fastPace
      ? (plottedSeconds - 42) / Math.max(1, timeBenchmark - 42)
      : (plottedSeconds - timeBenchmark) / Math.max(1, 135 - timeBenchmark);
    const xJitter = ((seed % 9) - 4) * 0.42;
    const yJitter = (((seed >> 6) % 9) - 4) * 0.42;
    const left = Math.min(
      fastPace ? 47 : 93,
      Math.max(
        fastPace ? 7 : 53,
        (fastPace ? 8 : 53) +
          Math.min(1, Math.max(0, paceRange)) * 39 +
          xJitter,
      ),
    );
    const top = Math.min(
      highAccuracy ? 47 : 93,
      Math.max(
        highAccuracy ? 7 : 53,
        (highAccuracy ? 8 : 53) +
          Math.min(1, Math.max(0, accuracyRange)) * 39 +
          yJitter,
      ),
    );
    return {
      ...group,
      accuracy,
      averageSeconds,
      left,
      top,
      quadrant: highAccuracy
        ? fastPace
          ? "proficient"
          : "inefficient"
        : fastPace
          ? "careless"
          : "struggling",
      edgeRight: left > 72,
      edgeBottom: top > 72,
    };
  });

  const positioned = new Map<string, { left: number; top: number }[]>();
  return plottedTopics.map((topic, topicIndex) => {
    const sectionPoints = positioned.get(topic.sectionId) ?? [];
    const fastPace = topic.left < 50;
    const highAccuracy = topic.top < 50;
    const xBounds: [number, number] = fastPace ? [7, 47] : [53, 93];
    const yBounds: [number, number] = highAccuracy ? [7, 47] : [53, 93];
    const origin = { left: topic.left, top: topic.top };
    let left = origin.left;
    let top = origin.top;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const overlaps = sectionPoints.some(
        (point) => Math.hypot(left - point.left, top - point.top) < 4.8,
      );
      if (!overlaps) break;
      const angle = ((topic.topicId * 137.5 + attempt * 71) * Math.PI) / 180;
      const radius = 2.4 + attempt * 0.42;
      left = Math.min(
        xBounds[1],
        Math.max(xBounds[0], origin.left + Math.cos(angle) * radius),
      );
      top = Math.min(
        yBounds[1],
        Math.max(yBounds[0], origin.top + Math.sin(angle) * radius),
      );
    }
    sectionPoints.push({ left, top });
    positioned.set(topic.sectionId, sectionPoints);
    return {
      ...topic,
      pointId: `${topic.sectionId}-${topic.topicId}-${topicIndex}`,
      left,
      top,
      edgeRight: left > 72,
      edgeBottom: top > 72,
    };
  });
});
const sectionReviewQuestions = computed(() =>
  reportQuestions.value.filter(
    (question) =>
      reviewSectionFilter.value === "ALL" ||
      question.sectionId === reviewSectionFilter.value,
  ),
);
const filteredReviewQuestions = computed(() =>
  sectionReviewQuestions.value.filter(
    (question) =>
      reviewFilter.value === "ALL" || question.status === reviewFilter.value,
  ),
);
const selectedReviewQuestion = computed(
  () =>
    filteredReviewQuestions.value.find(
      (question) => question.questionId === selectedReviewQuestionId.value,
    ) ??
    filteredReviewQuestions.value[0] ??
    null,
);
const selectedReviewQuestionPosition = computed(() =>
  selectedReviewQuestion.value
    ? filteredReviewQuestions.value.findIndex(
        (question) =>
          question.questionId === selectedReviewQuestion.value?.questionId,
      )
    : -1,
);
const similarQuizCurrentQuestion = computed(
  () => similarQuizQuestions.value[similarQuizIndex.value] ?? null,
);
const similarQuizCurrentAnswer = computed(() => {
  const question = similarQuizCurrentQuestion.value;
  return question ? similarQuizAnswers.value[question.id] : undefined;
});
const similarQuizCurrentCorrect = computed(
  () =>
    similarQuizCurrentQuestion.value !== null &&
    similarQuizCurrentAnswer.value !== undefined &&
    isSimilarQuizAnswerCorrect(
      similarQuizCurrentQuestion.value,
      similarQuizCurrentAnswer.value,
    ),
);
const similarQuizAnsweredCount = computed(
  () => Object.keys(similarQuizAnswers.value).length,
);
const similarQuizCorrectCount = computed(() =>
  similarQuizQuestions.value.reduce(
    (total, question) =>
      total +
      (similarQuizAnswers.value[question.id] !== undefined &&
      isSimilarQuizAnswerCorrect(
        question,
        similarQuizAnswers.value[question.id],
      )
        ? 1
        : 0),
    0,
  ),
);
const similarQuizResultCopy = computed(() => {
  const correct = similarQuizCorrectCount.value;
  if (correct === 3)
    return {
      title: "Flawless! 🏆",
      description: "Perfect score! You've truly locked it in.",
    };
  if (correct === 2)
    return {
      title: "So close! ⭐",
      description: "Almost perfect — a quick recap and you'll ace it.",
    };
  if (correct === 1)
    return {
      title: "Nice effort! 💪",
      description: "Solid start — a quick review and you'll nail it.",
    };
  return {
    title: "Keep going! 🌱",
    description: "Every attempt sharpens your understanding.",
  };
});
const similarQuizProgress = computed(() => {
  if (!similarQuizQuestions.value.length) return 0;
  return Math.round(
    (similarQuizAnsweredCount.value /
      similarQuizQuestions.value.length) *
      100,
  );
});
const reviewQuestionGroups = computed(() => {
  const groups = new Map<
    string,
    {
      key: string;
      sectionTitle: string;
      module: string;
      route: string;
      questions: SatReportReviewQuestion[];
    }
  >();
  filteredReviewQuestions.value.forEach((question) => {
    const key = `${question.sectionId}|${question.module}|${question.route}`;
    const group = groups.get(key) ?? {
      key,
      sectionTitle: question.sectionTitle,
      module: question.module,
      route: question.route,
      questions: [],
    };
    group.questions.push(question);
    groups.set(key, group);
  });
  return [...groups.values()];
});
const improveTopics = computed(() => {
  if (!manifest.value || !activeResultExam.value || !resultReport.value)
    return [];
  const resultByQuestionId = new Map(
    resultReport.value.questions.map((question) => [
      question.questionId,
      question,
    ]),
  );
  return manifest.value.topics
    .map((topic) => {
      const questions =
        activeResultExam.value?.questions.filter(
          (question) => question.topicId === topic.topicId,
        ) ?? [];
      const results = questions
        .map((question) => resultByQuestionId.get(question.id))
        .filter(Boolean);
      const correct = results.filter(
        (result) => result?.status === "CORRECT",
      ).length;
      const incorrect = results.filter(
        (result) => result?.status === "INCORRECT",
      ).length;
      const omitted = results.filter(
        (result) => result?.status === "OMITTED",
      ).length;
      const attempts = correct + incorrect;
      const missed = incorrect + omitted;
      const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
      const averageSeconds = attempts
        ? Math.round(
            results.reduce(
              (sum, result) => sum + (result?.timeSpentSeconds ?? 0),
              0,
            ) / attempts,
          )
        : 0;
      return {
        ...topic,
        sectionId: topicSectionId(topic.section),
        contentDomain: topic.domain,
        description: topic.summary,
        accuracy,
        attempts,
        averageSeconds,
        missed,
        opportunityScore: Math.round(
          topic.importanceScore * (missed / Math.max(1, results.length)),
        ),
      };
    })
    .filter((topic) => topic.missed > 0)
    .sort(
      (left, right) =>
        right.opportunityScore - left.opportunityScore ||
        right.importanceScore - left.importanceScore,
    );
});
const improveTopicSections = computed(() => {
  const topics = improveTopics.value.filter(
    (topic) =>
      topic.sectionId === improveSection.value &&
      (improvePriority.value === "ALL" ||
        topic.priority === improvePriority.value),
  );
  if (improvePriority.value !== "ALL")
    return topics.length
      ? [
          {
            id: `${improveSection.value}-${improvePriority.value}`,
            title: "",
            examSection: "",
            topics,
          },
        ]
      : [];
  return [...new Set(topics.map((topic) => topic.contentDomain))].map(
    (contentDomain) => ({
      id: `${improveSection.value}-${contentDomain}`,
      title: contentDomain,
      examSection: sectionDisplayTitle(improveSection.value),
      topics: topics.filter((topic) => topic.contentDomain === contentDomain),
    }),
  );
});

const improveTopicSectionClusters = computed(() => {
  const sections = improveTopicSections.value;
  const toCluster = (clusterSections: typeof sections) => ({
    id: `cluster-${clusterSections.map((section) => section.id).join("-")}`,
    sections: clusterSections,
    topicCount: clusterSections.reduce(
      (total, section) => total + section.topics.length,
      0,
    ),
  });

  if (
    !targetedPracticeLocked.value ||
    resultSource.value === "diagnostic" ||
    sections.length < 2
  ) {
    return sections.map((section) => toCluster([section]));
  }

  const clusters: ReturnType<typeof toCluster>[] = [];
  let pendingSections: typeof sections = [];
  let pendingTopicCount = 0;

  sections.forEach((section) => {
    pendingSections.push(section);
    pendingTopicCount += section.topics.length;
    if (pendingTopicCount >= 2) {
      clusters.push(toCluster(pendingSections));
      pendingSections = [];
      pendingTopicCount = 0;
    }
  });

  if (pendingSections.length) {
    const previousCluster = clusters[clusters.length - 1];
    if (previousCluster) {
      clusters.splice(
        -1,
        1,
        toCluster([...previousCluster.sections, ...pendingSections]),
      );
    } else {
      clusters.push(toCluster(pendingSections));
    }
  }

  return clusters;
});

function catalogCourse(
  family: Course["family"],
  title: string,
  topics: number,
  questions: number,
  icon: string,
  search: string,
): Course {
  return {
    family,
    label: family === "abitur" ? "ABITUR" : family.toUpperCase(),
    icon,
    title,
    topics: topics.toLocaleString("en-US"),
    videos: topics.toLocaleString("en-US"),
    questions: questions.toLocaleString("en-US"),
    search,
  };
}

// Source: “iOS备考包-算法及物料”, revision 1460.
// 1 SAT + 1 ACT + 43 AP + 7 Abitur courses = 52 total courses.
const courses: Course[] = [
  catalogCourse("sat", "SAT Prep 2026", 100, 6226, "exam", "digital college admissions math reading writing"),
  catalogCourse("act", "ACT Prep 2026", 235, 14100, "exam", "college admissions english math reading science writing"),

  catalogCourse("ap", "AP 2-D Art and Design", 19, 1140, "art", "advanced placement arts visual design"),
  catalogCourse("ap", "AP 3-D Art and Design", 20, 1200, "art", "advanced placement arts visual design"),
  catalogCourse("ap", "AP African American Studies", 20, 1200, "history", "advanced placement history social science"),
  catalogCourse("ap", "AP Art History", 17, 1020, "art", "advanced placement arts history"),
  catalogCourse("ap", "AP Biology", 32, 1920, "biology", "advanced placement biology science"),
  catalogCourse("ap", "AP Business with Personal Finance", 31, 1860, "business", "advanced placement business finance career kickstart"),
  catalogCourse("ap", "AP Calculus AB", 32, 1920, "math", "advanced placement math calculus"),
  catalogCourse("ap", "AP Calculus BC", 49, 2940, "math", "advanced placement math calculus"),
  catalogCourse("ap", "AP Chemistry", 38, 2280, "chemistry", "advanced placement chemistry science"),
  catalogCourse("ap", "AP Chinese Language and Culture", 24, 1440, "language", "advanced placement chinese language culture"),
  catalogCourse("ap", "AP Comparative Government and Politics", 20, 1200, "government", "advanced placement comparative government politics social science"),
  catalogCourse("ap", "AP Computer Science A", 32, 1920, "code", "advanced placement computer science programming"),
  catalogCourse("ap", "AP Computer Science Principles", 25, 1500, "code", "advanced placement computer science programming principles"),
  catalogCourse("ap", "AP Cybersecurity", 24, 1440, "security", "advanced placement cybersecurity career kickstart computing"),
  catalogCourse("ap", "AP Drawing", 19, 1140, "art", "advanced placement arts drawing design"),
  catalogCourse("ap", "AP English Language and Composition", 34, 2040, "language", "advanced placement english language composition"),
  catalogCourse("ap", "AP English Literature and Composition", 37, 2220, "language", "advanced placement english literature composition"),
  catalogCourse("ap", "AP Environmental Science", 36, 2160, "environment", "advanced placement environmental earth science"),
  catalogCourse("ap", "AP European History", 27, 1620, "history", "advanced placement european history"),
  catalogCourse("ap", "AP French Language and Culture", 24, 1440, "language", "advanced placement french language culture"),
  catalogCourse("ap", "AP German Language and Culture", 24, 1440, "language", "advanced placement german language culture"),
  catalogCourse("ap", "AP Human Geography", 28, 1680, "globe", "advanced placement human geography social science"),
  catalogCourse("ap", "AP Italian Language and Culture", 24, 1440, "language", "advanced placement italian language culture"),
  catalogCourse("ap", "AP Japanese Language and Culture", 24, 1440, "language", "advanced placement japanese language culture"),
  catalogCourse("ap", "AP Latin", 24, 1440, "language", "advanced placement latin language culture"),
  catalogCourse("ap", "AP Macroeconomics", 24, 1440, "economics", "advanced placement macroeconomics economics social science"),
  catalogCourse("ap", "AP Microeconomics", 24, 1440, "economics", "advanced placement microeconomics economics social science"),
  catalogCourse("ap", "AP Music Theory", 29, 1740, "music", "advanced placement arts music theory"),
  catalogCourse("ap", "AP Networking (Pilot)", 22, 1320, "network", "advanced placement networking pilot career kickstart computing"),
  catalogCourse("ap", "AP Physics 1: Algebra-Based", 32, 1920, "physics", "advanced placement physics algebra science"),
  catalogCourse("ap", "AP Physics 2: Algebra-Based", 28, 1680, "physics", "advanced placement physics algebra science"),
  catalogCourse("ap", "AP Physics C: Electricity and Magnetism", 24, 1440, "physics", "advanced placement physics electricity magnetism science"),
  catalogCourse("ap", "AP Physics C: Mechanics", 28, 1680, "physics", "advanced placement physics mechanics science"),
  catalogCourse("ap", "AP Precalculus", 28, 1680, "math", "advanced placement math precalculus"),
  catalogCourse("ap", "AP Psychology", 29, 1740, "psychology", "advanced placement psychology social science"),
  catalogCourse("ap", "AP Research", 40, 2400, "research", "advanced placement capstone research"),
  catalogCourse("ap", "AP Seminar", 30, 1800, "research", "advanced placement capstone seminar research"),
  catalogCourse("ap", "AP Spanish Language and Culture", 24, 1440, "language", "advanced placement spanish language culture"),
  catalogCourse("ap", "AP Spanish Literature and Culture", 32, 1920, "language", "advanced placement spanish literature culture"),
  catalogCourse("ap", "AP Statistics", 35, 2100, "statistics", "advanced placement statistics math data"),
  catalogCourse("ap", "AP United States Government and Politics", 25, 1500, "government", "advanced placement united states government politics social science"),
  catalogCourse("ap", "AP United States History", 27, 1620, "history", "advanced placement united states history"),
  catalogCourse("ap", "AP World History: Modern", 27, 1620, "history", "advanced placement world history modern"),

  catalogCourse("abitur", "Abitur Biologie", 28, 1680, "biology", "german abitur biology biologie science"),
  catalogCourse("abitur", "Abitur Chemie", 37, 2220, "chemistry", "german abitur chemistry chemie science"),
  catalogCourse("abitur", "Abitur Deutsch", 18, 1080, "language", "german abitur deutsch language"),
  catalogCourse("abitur", "Abitur Englisch", 19, 1268, "language", "german abitur englisch english language"),
  catalogCourse("abitur", "Abitur Französisch", 19, 1144, "language", "german abitur french französisch language"),
  catalogCourse("abitur", "Abitur Mathematik", 31, 2929, "math", "german abitur mathematik mathematics math"),
  catalogCourse("abitur", "Abitur Physik", 25, 1503, "physics", "german abitur physics physik science"),
];

const COURSE_ACTIVITY_STORAGE_KEY = "solvely:ep:course-activity";

const filteredCourses = computed(() => {
  const terms = searchQuery.value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return courses.filter((course) => {
    const haystack = `${course.title} ${course.search}`.toLowerCase();
    return (
      (familyFilter.value === "all" || course.family === familyFilter.value) &&
      terms.every((term) => haystack.includes(term))
    );
  });
});
const examLibraryTotal = computed(
  () => createdPredictions.value.length + (showSeededPrediction.value ? 1 : 0) +
    (forcedHomePreview.value === "first-entry" ? 0 : courseActivityList.value.length),
);

const courseSectionOptions = computed(() => [...new Set((manifest.value?.topics ?? []).map((topic) => topic.section))]);
const reportSectionOptions = computed(() => resultReport.value?.sections ?? []);

function topicSectionId(section: string) {
  if (section === "Math") return "math";
  if (section === "Reading and Writing") return "reading-writing";
  return section.toLowerCase().replace(/\s+/g, "-");
}

function sectionDisplayTitle(sectionId: string) {
  return resultReport.value?.sections.find((section) => section.sectionId === sectionId)?.sectionTitle ?? sectionId;
}

const topicsBySection = computed(() => {
  if (!manifest.value) return [];
  const byId = new Map(manifest.value.topics.map((topic) => [topic.id, topic]));
  const sections = manifest.value.sections
    .map((section) => ({
      ...section,
      topics: section.topicIds
        .map((id) => byId.get(id))
        .filter(Boolean) as SatTopic[],
    }))
    .filter((section) => section.examSection === sectionFilter.value);
  if (priorityFilter.value === "all")
    return sections.filter((section) => section.topics.length);
  const topics = sections
    .flatMap((section) => section.topics)
    .filter((topic) => topic.priority.toLowerCase() === priorityFilter.value)
    .sort(
      (left, right) =>
        right.importanceScore - left.importanceScore ||
        right.mappedQuestionCount - left.mappedQuestionCount ||
        left.order - right.order,
    );
  return [
    {
      id: `importance-${sectionFilter.value}-${priorityFilter.value}`,
      examSection: sectionFilter.value,
      title: "",
      topics,
    },
  ];
});

const recommendedStartTopic = computed(() =>
  [...(manifest.value?.topics ?? [])]
    .filter((topic) => topic.section === (isApPackage.value ? "AP Calculus BC" : isActPackage.value ? "English" : "Math") && topic.priority === "CORE")
    .sort((left, right) => left.order - right.order)[0] ?? null,
);

const courseStartTopic = computed(() => {
  const activity = currentCourseActivity.value;
  if (isCourseStarted.value && activity?.kind === "learning") {
    const recentTopic = manifest.value?.topics.find(
      (topic) => topic.id === activity.topicId,
    );
    if (recentTopic) return recentTopic;
  }
  return recommendedStartTopic.value;
});

const courseStartModule = computed(() => {
  const topic = courseStartTopic.value;
  if (!topic) return null;
  const activity = currentCourseActivity.value;
  const isContinuing =
    isCourseStarted.value &&
    activity?.kind === "learning" &&
    activity.topicId === topic.id;
  return {
    label: isContinuing ? "Continue learning" : "Recommended start",
    title: topic.title,
    domain: topic.domain,
    detail: isContinuing && activity?.kind === "learning"
      ? `${activity.progressPercent}% complete`
      : `${topic.importanceScore}% ${priorityLabel(topic.priority)} priority`,
    cta: isContinuing ? "Continue learning" : "Start learning",
  };
});

function topicProgress(topic: SatTopic) {
  if (!isCourseStarted.value) return 0;
  if (isApPackage.value) {
    if (topic.order <= 2) return 100;
    if (topic.order === 3) return 62;
    if (topic.order === 4) return 33;
    return 0;
  }
  if (isActPackage.value) {
    if (topic.order <= 2) return 100;
    if (topic.order === 3) return 62;
    if (topic.order === 4) return 33;
    return 0;
  }
  if (topic.order <= 46) return 100;
  if (topic.order <= 52)
    return topic.order === 50 ? 62 : topic.order % 2 ? 33 : 67;
  return 0;
}

function placeStudyTopicPopover(
  row: HTMLElement,
  clientX: number,
  clientY: number,
) {
  if (window.matchMedia("(max-width: 700px)").matches) return;

  const popover = row.querySelector<HTMLElement>(".study-topic-popover");
  if (!popover) return;

  const viewportInset = 16;
  const pointerGap = 16;
  const popoverWidth = Math.min(360, window.innerWidth - viewportInset * 2);
  const popoverHeight = popover.offsetHeight;
  const canOpenRight =
    clientX + pointerGap + popoverWidth + viewportInset <= window.innerWidth;
  const side = canOpenRight ? "right" : "left";
  const unclampedLeft = canOpenRight
    ? clientX + pointerGap
    : clientX - pointerGap - popoverWidth;
  const left = Math.min(
    Math.max(unclampedLeft, viewportInset),
    window.innerWidth - popoverWidth - viewportInset,
  );
  const halfHeight = popoverHeight / 2;
  const centerY = Math.min(
    Math.max(clientY, viewportInset + halfHeight),
    window.innerHeight - viewportInset - halfHeight,
  );
  const arrowY = Math.min(
    Math.max(clientY - (centerY - halfHeight), 20),
    popoverHeight - 20,
  );

  popover.dataset.side = side;
  popover.style.setProperty("--topic-popover-left", `${left}px`);
  popover.style.setProperty("--topic-popover-top", `${centerY}px`);
  popover.style.setProperty("--topic-popover-arrow-y", `${arrowY}px`);
  row.dataset.popoverAnchored = "true";
  row.dataset.popoverOpen = "true";
}

function positionStudyTopicPopover(event: MouseEvent) {
  const row = event.currentTarget as HTMLElement;
  if (studyTopicPopoverReleaseTimer !== null) {
    window.clearTimeout(studyTopicPopoverReleaseTimer);
    studyTopicPopoverReleaseTimer = null;
  }
  if (row.dataset.popoverAnchored === "true") return;
  document
    .querySelectorAll<HTMLElement>('[data-popover-anchored="true"]')
    .forEach((candidate) => {
      if (candidate !== row) {
        delete candidate.dataset.popoverAnchored;
        delete candidate.dataset.popoverOpen;
      }
    });
  placeStudyTopicPopover(
    row,
    event.clientX,
    event.clientY,
  );
}

function positionStudyTopicPopoverForKeyboard(event: FocusEvent) {
  const row = event.currentTarget as HTMLElement;
  if (row.matches(":hover")) return;
  const rect = row.getBoundingClientRect();
  placeStudyTopicPopover(
    row,
    rect.left + Math.min(rect.width * 0.46, 420),
    rect.top + rect.height / 2,
  );
}

function scheduleStudyTopicPopoverRelease(row: HTMLElement) {
  if (studyTopicPopoverReleaseTimer !== null) {
    window.clearTimeout(studyTopicPopoverReleaseTimer);
  }
  studyTopicPopoverReleaseTimer = window.setTimeout(() => {
    const popover = row.querySelector<HTMLElement>(".study-topic-popover");
    if (
      row.matches(":hover, :focus-within") ||
      popover?.matches(":hover")
    ) {
      studyTopicPopoverReleaseTimer = null;
      return;
    }
    delete row.dataset.popoverAnchored;
    delete row.dataset.popoverOpen;
    studyTopicPopoverReleaseTimer = null;
  }, 180);
}

function releaseStudyTopicPopover(event: MouseEvent | FocusEvent) {
  const row = event.currentTarget as HTMLElement;
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && row.contains(nextTarget)) return;
  scheduleStudyTopicPopoverRelease(row);
}

function keepStudyTopicPopoverOpen(event: MouseEvent) {
  if (studyTopicPopoverReleaseTimer !== null) {
    window.clearTimeout(studyTopicPopoverReleaseTimer);
    studyTopicPopoverReleaseTimer = null;
  }
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(
    ".study-topic-row",
  );
  if (row) row.dataset.popoverOpen = "true";
}

function releaseStudyTopicPopoverPanel(event: MouseEvent) {
  const row = (event.currentTarget as HTMLElement).closest<HTMLElement>(
    ".study-topic-row",
  );
  if (!row) return;
  scheduleStudyTopicPopoverRelease(row);
}

function initializeSectionDisclosure() {
  if (!manifest.value) return;
  const sectionIds = manifest.value.sections
    .filter(
      (section) =>
        section.examSection === sectionFilter.value && section.topicIds.length,
    )
    .map((section) => section.id);
  collapsedSections.value = new Set(sectionIds.slice(1));
}

function examFamilyForCourse(course: Course): ExamFamily {
  const isAct = course.family === "act";
  const isAp = course.family === "ap" && course.title === "AP Calculus BC";
  return isAp ? "ap-calculus-bc" : isAct ? "act" : "sat";
}
function openCourse(course: Course) {
  activeTab.value = "study";
  const targetFamily = examFamilyForCourse(course);
  const isAct = targetFamily === "act";
  const isAp = targetFamily === "ap-calculus-bc";
  const courseState: CourseEntryState = startedCourseFamilies.value.has(targetFamily)
    ? "in-progress"
    : "first-visit";
  sectionFilter.value = isAp ? "AP Calculus BC" : isAct ? "English" : "Math";
  void router.push({
    name: "package",
    query: {
      access: accessState.value,
      ...(forcedHomePreview.value ? { homeState: forcedHomePreview.value } : {}),
      ...(isAp ? { exam: "ap-calculus-bc" } : isAct ? { exam: "act" } : {}),
      courseState: courseState === "first-visit" ? "not-started" : "in-progress",
    },
    hash: isAp ? "#course-2" : isAct ? "#course-1" : "#course-0",
  });
}

function closeCourse() {
  void router.push({
    name: "package",
    query: {
      access: accessState.value,
      ...(forcedHomePreview.value ? { homeState: forcedHomePreview.value } : {}),
    },
    hash: "#examCatalogTitle",
  });
}
function openExamPredictorHome() {
  void router.push({ name: "package" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showNewPredictionDialog(title: string) {
  editingPredictionId.value = null;
  predictionExamName.value = title;
  predictionExamDate.value = "2026-11-12";
  predictionFocus.value = "Balanced review";
  newPredictionDialog.value?.showModal();
}
function openNewPrediction() {
  showNewPredictionDialog("AP Biology Midterm");
}
function openPrepFilePicker() {
  prepFileInput.value?.click();
}
function handlePrepFileSelection(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fileTitle = file.name.replace(/\.[^.]+$/, "").trim();
  showNewPredictionDialog(fileTitle || "My exam");
  input.value = "";
}
function handlePrepFileDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const fileTitle = file.name.replace(/\.[^.]+$/, "").trim();
  showNewPredictionDialog(fileTitle || "My exam");
}
function persistCourseActivity() {
  try {
    window.localStorage.setItem(COURSE_ACTIVITY_STORAGE_KEY, JSON.stringify({
      startedCourseFamilies: [...startedCourseFamilies.value],
      courseActivities: courseActivities.value,
      lastActivity: lastActivity.value,
    }));
  } catch {
    /* The current session still reflects the activity. */
  }
}
function recordCourseActivity(activity: LastActivity) {
  startedCourseFamilies.value = new Set([...startedCourseFamilies.value, activity.examFamily]);
  courseActivities.value = { ...courseActivities.value, [activity.examFamily]: activity };
  lastActivity.value = activity;
  persistCourseActivity();
}
function recordLearningActivity(topic: SatTopic) {
  recordCourseActivity({
    kind: "learning",
    examFamily: examFamily.value,
    examTitle: packageTitle.value,
    sectionTitle: topic.section,
    itemTitle: topic.title,
    resourceLabel: "Study Guide",
    progressPercent: Math.max(1, topicProgress(topic)),
    topicId: topic.id,
  });
}
function recordExamActivity(kind: ResultSource, answered = 0) {
  const total = kind === "diagnostic"
    ? diagnosticExam.value?.questions.length ?? 20
    : practiceTestQuestionCount.value;
  recordCourseActivity({
    kind: "exam",
    examFamily: examFamily.value,
    examTitle: packageTitle.value,
    sectionTitle: kind === "diagnostic" ? "Diagnostic Test" : "Full-Length Practice Test",
    itemTitle: answered > 0 ? `Question ${answered} of ${total}` : "Ready to begin",
    moduleLabel: kind === "diagnostic" ? "Diagnostic" : "Practice Test",
    answered,
    total,
    examId: 1,
  });
}
function setHomeExperiencePreview(state: HomePreviewState) {
  const nextQuery = {
    access: accessState.value,
    homeState: state === "empty" ? "first-entry" : "active",
  };
  void router.replace({ name: "package", query: nextQuery, hash: "" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function editCreatedPrediction(prediction: CreatedPrediction) {
  editingPredictionId.value = prediction.id;
  predictionExamName.value = prediction.title;
  predictionExamDate.value = prediction.date;
  predictionFocus.value = prediction.focus;
  newPredictionDialog.value?.showModal();
}
function closeNewPrediction() {
  newPredictionDialog.value?.close();
}
function createNewPrediction() {
  const title = predictionExamName.value.trim();
  if (!title || !predictionExamDate.value) return;
  const prediction: CreatedPrediction = {
    id: editingPredictionId.value ?? `prediction-${Date.now()}`,
    title,
    date: predictionExamDate.value,
    focus: predictionFocus.value,
  };
  if (editingPredictionId.value) {
    createdPredictions.value = createdPredictions.value.map((item) =>
      item.id === editingPredictionId.value ? prediction : item,
    );
  } else {
    createdPredictions.value = [prediction, ...createdPredictions.value];
  }
  try {
    window.localStorage.setItem(
      "solvely:ep:created-predictions",
      JSON.stringify(createdPredictions.value),
    );
  } catch {
    /* The new plan still appears when browser storage is unavailable. */
  }
  closeNewPrediction();
  if (route.query.homeState) {
    const nextQuery = { ...route.query };
    delete nextQuery.homeState;
    void router.replace({ name: "package", query: nextQuery });
  }
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(".predictor-library-card.created")
      ?.focus();
  });
}
function formatPredictionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
function selectTab(tab: CourseTab) {
  activeTab.value = tab;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toggleSection(id: string) {
  const next = new Set(collapsedSections.value);
  next.has(id) ? next.delete(id) : next.add(id);
  collapsedSections.value = next;
}
function openTopic(
  topic: SatTopic,
  tool: "study-guide" | "flashcards" | "quiz",
) {
  recordLearningActivity(topic);
  void router.push({
    name: tool,
    params: { topicId: topic.id },
    query: { access: accessState.value, ...examRouteQuery.value },
  });
}

function openCourseStartTopic() {
  const topic = courseStartTopic.value;
  if (topic) {
    openTopic(topic, "study-guide");
  }
}

function openCommercialPaywall(context: string, action?: () => void) {
  paywallContext.value = context;
  pendingCommercialAction = action ?? null;
  paywallOpen.value = true;
}

function clearPaywallRouteIntent() {
  if (!route.query.paywall) return;
  const nextQuery = { ...route.query };
  delete nextQuery.paywall;
  void router.replace({ name: "package", query: nextQuery, hash: route.hash });
}

function closeCommercialPaywall() {
  paywallOpen.value = false;
  pendingCommercialAction = null;
  clearPaywallRouteIntent();
}

function unlockPro() {
  const action = pendingCommercialAction;
  pendingCommercialAction = null;
  paywallOpen.value = false;
  setProAccess("member");
  if (action) void nextTick(action);
}
function syncDirectPaywallIntent() {
  if (route.query.paywall !== "full-length" || isProMember.value) return;
  openCommercialPaywall(`the full-length ${examName.value} practice test`, () =>
    startMockExam(1),
  );
}
function improveAnswered(topic: SatTopic) {
  return Math.min(
    topic.quizCount,
    Math.max(0, improvePracticeProgress.value[topic.id] ?? 0),
  );
}
function improvePracticeState(topic: SatTopic) {
  const answered = improveAnswered(topic);
  return answered >= topic.quizCount
    ? "review"
    : answered > 0
      ? "continue"
      : "practice";
}
function improvePracticeLabel(topic: SatTopic) {
  const state = improvePracticeState(topic);
  return state === "review"
    ? "Review"
    : state === "continue"
      ? "Continue"
      : "Practice";
}
function openImprovePractice(topic: SatTopic) {
  if (resultSource.value === "diagnostic" && !isProMember.value) {
    openCommercialPaywall(`adaptive practice for your priority ${examName.value} topics`, () =>
      openImprovePractice(topic),
    );
    return;
  }
  recordLearningActivity(topic);
  void router.push({
    name: "quiz",
    params: { topicId: topic.id },
    query: { source: "improve", access: accessState.value, ...examRouteQuery.value },
  });
}
function dismissImportanceNote(note: "improve") {
  showImproveImportanceNote.value = false;
  try {
    window.localStorage.setItem(
      `solvely:${examName.value.toLowerCase()}:${note}-importance-note-dismissed`,
      "1",
    );
  } catch {
    /* The notice still closes when browser storage is unavailable. */
  }
}
function resumeActivity(activity: LastActivity) {
  if (activity.kind === "learning") {
    void router.push({
      name: "study-guide",
      params: { topicId: activity.topicId },
      query: {
        access: accessState.value,
        ...(activity.examFamily === "sat" ? {} : { exam: activity.examFamily }),
      },
    });
  } else {
    startMockExam(
      activity.examId,
      activity.examFamily,
    );
  }
}
function openCourseFromHome(course: Course) {
  if (!isCourseAvailable(course)) return;
  const activity = courseActivities.value[examFamilyForCourse(course)];
  if (!showFirstEntryHome.value && activity) {
    resumeActivity(activity);
    return;
  }
  openCourse(course);
}
function isCourseAvailable(course: Course) {
  return course.family === "sat" || course.family === "act" || course.title === "AP Calculus BC";
}
function courseHomeAction(course: Course) {
  const activity = courseActivities.value[examFamilyForCourse(course)];
  if (!showFirstEntryHome.value && activity)
    return activityCta(activity);
  return isCourseAvailable(course) ? "Open course" : "Coming soon";
}
function startMockExam(
  examId: number,
  targetExamFamily: ExamFamily = examFamily.value,
) {
  if (!isProMember.value) {
    const targetExamName = targetExamFamily === "ap-calculus-bc"
      ? "AP Calculus BC"
      : targetExamFamily === "act"
        ? "ACT"
        : "SAT";
    openCommercialPaywall(`the full-length ${targetExamName} practice test`, () =>
      startMockExam(examId, targetExamFamily),
    );
    return;
  }
  recordExamActivity("practice");
  void router.push({
    name: "mock-exam",
    params: { examId },
    query: { access: accessState.value, ...(targetExamFamily === "sat" ? {} : { exam: targetExamFamily }) },
  });
}
function requestRetake() {
  if (resultSource.value === "diagnostic") {
    diagnosticTestState.value = "not-started";
    activeTab.value = "study";
    void router.push({
      name: "package",
      query: {
        ...route.query,
        tab: "study",
        diagnosticState: "not-started",
        reportSource: "diagnostic",
      },
      hash: activeCourseHash.value,
    });
    return;
  }
  if (retakeDialog.value && !retakeDialog.value.open)
    retakeDialog.value.showModal();
}
function closeRetakeConfirm() {
  retakeDialog.value?.close();
}
function clearPracticeScoringTimer() {
  if (practiceScoringTimer !== null)
    window.clearTimeout(practiceScoringTimer);
  practiceScoringTimer = null;
}
function clearDiagnosticScoringTimer() {
  if (diagnosticScoringTimer !== null)
    window.clearTimeout(diagnosticScoringTimer);
  diagnosticScoringTimer = null;
}
function scheduleScoringCompletion(kind: AssessmentKind) {
  if (kind === "diagnostic") {
    clearDiagnosticScoringTimer();
    if (diagnosticTestState.value !== "scoring") return;
    diagnosticScoringTimer = window.setTimeout(() => {
      diagnosticScoringTimer = null;
      diagnosticTestState.value = "results";
      resultSource.value = "diagnostic";
      activeTab.value = "study";
      void router.replace({
        name: "package",
        query: {
          ...route.query,
          tab: "study",
          view: undefined,
          reportSource: "diagnostic",
          courseState: "in-progress",
          diagnosticState: "results",
          practiceState: practiceTestState.value,
          resultState: undefined,
        },
        hash: activeCourseHash.value,
      });
    }, 2000);
    return;
  }

  clearPracticeScoringTimer();
  if (practiceTestState.value !== "scoring") return;
  practiceScoringTimer = window.setTimeout(() => {
    practiceScoringTimer = null;
    practiceTestState.value = "results";
    resultSource.value = "practice";
    activeTab.value = "study";
    void router.replace({
      name: "package",
      query: {
        ...route.query,
        tab: "study",
        view: undefined,
        reportSource: "practice",
        courseState: "in-progress",
        diagnosticState: diagnosticTestState.value,
        practiceState: "results",
        resultState: undefined,
      },
      hash: activeCourseHash.value,
    });
  }, 2000);
}
function setAssessmentTestState(kind: AssessmentKind, state: AssessmentState) {
  const normalized = normalizePrepState({
    courseHasLearningProgress: isCourseStarted.value,
    diagnosticState: kind === "diagnostic" ? state : diagnosticTestState.value,
    practiceState: kind === "practice" ? state : practiceTestState.value,
    preferredActiveAssessment: kind,
  });
  diagnosticTestState.value = normalized.diagnosticState;
  practiceTestState.value = normalized.practiceState;
  if (state === "results" || state === "scoring") resultSource.value = kind;
  void router.replace({
    name: "package",
    query: {
      ...route.query,
      courseState: normalized.courseState === "first-visit" ? "not-started" : "in-progress",
      diagnosticState: normalized.diagnosticState,
      practiceState: normalized.practiceState,
      resultState: undefined,
    },
    hash: activeCourseHash.value,
  });
  scheduleScoringCompletion(kind);
}
function setPracticeTestState(state: PracticeTestState) {
  setAssessmentTestState("practice", state);
}
function setDiagnosticTestState(state: DiagnosticTestState) {
  setAssessmentTestState("diagnostic", state);
}
function setCourseEntryState(state: CourseEntryState) {
  void router.replace({
    name: "package",
    query: {
      ...route.query,
      tab: "study",
      courseState: state === "first-visit" ? "not-started" : "in-progress",
      ...(state === "first-visit"
        ? {
            diagnosticState: "not-started",
            practiceState: "not-started",
            resultState: undefined,
          }
        : {}),
    },
    hash: activeCourseHash.value,
  });
}
function confirmRetake() {
  closeRetakeConfirm();
  setPracticeTestState("not-started");
  startMockExam(1);
}
function handlePracticeTestAction() {
  if (practiceTestState.value === "scoring") return;
  if (practiceTestState.value === "results" && !isProMember.value) {
    openCommercialPaywall(
      `the full-length ${examName.value} test and score analysis`,
      handlePracticeTestAction,
    );
    return;
  }
  if (practiceTestState.value === "results") {
    resultSource.value = "practice";
    resultView.value = "full";
    activeTab.value = "results";
    void router.push({
      name: "package",
      query: {
        ...route.query,
        tab: "results",
        resultState: undefined,
        practiceState: "results",
        reportSource: "practice",
      },
      hash: activeCourseHash.value,
    });
    return;
  }
  startMockExam(1);
}
function handleDiagnosticTestAction() {
  if (diagnosticTestState.value === "scoring") return;
  if (diagnosticTestState.value === "results") {
    resultSource.value = "diagnostic";
    resultView.value = "full";
    activeTab.value = "results";
    void router.push({
      name: "package",
      query: {
        ...route.query,
        tab: "results",
        view: "full",
        reportSource: "diagnostic",
        diagnosticState: "results",
      },
      hash: activeCourseHash.value,
    });
    return;
  }
  recordExamActivity("diagnostic");
  setDiagnosticTestState("in-progress");
  void router.push({
    name: "mock-exam",
    params: { examId: 1 },
    query: {
      access: accessState.value,
      mode: "diagnostic",
      diagnosticState: "in-progress",
      ...examRouteQuery.value,
    },
  });
}
function handleResultsPrerequisiteAction() {
  if (resultSource.value === "diagnostic") {
    handleDiagnosticTestAction();
    return;
  }
  handlePracticeTestAction();
}
function toggleTheme() {
  document.body.classList.toggle("dark");
}
function setResultView(view: ResultView) {
  resultView.value = view;
  if (
    (view === "review" || view === "full") &&
    selectedReviewQuestionId.value === null
  )
    selectedReviewQuestionId.value =
      reportQuestions.value[0]?.questionId ?? null;
  void router.replace({
    name: "package",
    query: { ...route.query, tab: "results", view },
    hash: activeCourseHash.value,
  });
}
function setResultSource(source: ResultSource) {
  resultSource.value = source;
  selectedReviewQuestionId.value = null;
  reviewFilter.value = "ALL";
  reviewSectionFilter.value = "ALL";
  void router.replace({
    name: "package",
    query: {
      ...route.query,
      tab: "results",
      view: undefined,
      reportSource: source,
    },
    hash: activeCourseHash.value,
  });
}
function moveResultSource(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
    return;
  event.preventDefault();
  const currentIndex = resultSources.value.findIndex(
    (source) => source.id === resultSource.value,
  );
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? resultSources.value.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) +
            resultSources.value.length) %
          resultSources.value.length;
  const nextSource = resultSources.value[nextIndex];
  if (!nextSource) return;
  setResultSource(nextSource.id);
  void nextTick(() => {
    document
      .querySelector<HTMLButtonElement>(
        `[data-result-source="${nextSource.id}"]`,
      )
      ?.focus();
  });
}
function setReviewFilter(filter: ReviewFilter) {
  reviewFilter.value = filter;
  selectedReviewQuestionId.value = null;
}
function setReviewFilterFromEvent(event: Event) {
  setReviewFilter((event.target as HTMLSelectElement).value as ReviewFilter);
}
function setReviewSectionFilter(filter: ReviewSectionFilter) {
  reviewSectionFilter.value = filter;
  selectedReviewQuestionId.value = null;
}
function setReviewSectionFilterFromEvent(event: Event) {
  setReviewSectionFilter(
    (event.target as HTMLSelectElement).value as ReviewSectionFilter,
  );
}
function moveReviewQuestion(direction: -1 | 1) {
  if (!filteredReviewQuestions.value.length) return;
  const current = Math.max(0, selectedReviewQuestionPosition.value);
  const next = Math.min(
    filteredReviewQuestions.value.length - 1,
    Math.max(0, current + direction),
  );
  selectedReviewQuestionId.value =
    filteredReviewQuestions.value[next]?.questionId ?? null;
}
function reviewTopic(question: SatReportReviewQuestion) {
  return (
    manifest.value?.topics.find(
      (topic) => topic.topicId === question.topicId,
    ) ?? null
  );
}
function reviewTopicTitle(question: SatReportReviewQuestion) {
  return reviewTopic(question)?.title ?? question.officialSkill;
}
function practiceReviewQuestion(question: SatReportReviewQuestion) {
  const topic = reviewTopic(question);
  if (!topic) return;
  similarQuizTopic.value = topic;
  restartSimilarQuiz();
  if (!similarQuizDrawer.value?.open) similarQuizDrawer.value?.showModal();
  void loadSimilarQuiz(topic);
}
async function loadSimilarQuiz(topic: SatTopic) {
  const requestId = ++similarQuizRequestId;
  similarQuizLoading.value = true;
  similarQuizLoadError.value = "";
  try {
    const questions = await (isApPackage.value
      ? loadApTopicQuiz(topic.id)
      : isActPackage.value
        ? loadActTopicQuiz(topic.id)
        : loadTopicQuiz(topic.id));
    if (requestId !== similarQuizRequestId) return;
    similarQuizQuestions.value = questions.slice(0, 3);
    if (!questions.length)
      similarQuizLoadError.value =
        "No extra questions are available for this topic yet.";
  } catch {
    if (requestId !== similarQuizRequestId) return;
    similarQuizLoadError.value =
      "We couldn’t load these similar questions. Please try again.";
  } finally {
    if (requestId === similarQuizRequestId) similarQuizLoading.value = false;
  }
}
function retrySimilarQuiz() {
  if (similarQuizTopic.value) void loadSimilarQuiz(similarQuizTopic.value);
}
function closeSimilarQuiz() {
  similarQuizRequestId += 1;
  similarQuizLoading.value = false;
  similarQuizDrawer.value?.close();
}
function resetSimilarQuizScroll() {
  void nextTick(() => similarQuizBody.value?.scrollTo({ top: 0 }));
}
function restartSimilarQuiz() {
  similarQuizIndex.value = 0;
  similarQuizAnswers.value = {};
  similarQuizResponse.value = "";
  similarQuizQuestions.value = [];
  similarQuizLoadError.value = "";
  similarQuizComplete.value = false;
  resetSimilarQuizScroll();
}
function reviewCompletedSimilarQuiz() {
  similarQuizIndex.value = 0;
  const firstAnswer = similarQuizQuestions.value[0]
    ? similarQuizAnswers.value[similarQuizQuestions.value[0].id]
    : undefined;
  similarQuizResponse.value =
    typeof firstAnswer === "string" ? firstAnswer : "";
  similarQuizComplete.value = false;
  resetSimilarQuizScroll();
}
function answerSimilarQuiz(index: number) {
  const question = similarQuizCurrentQuestion.value;
  if (!question || similarQuizCurrentAnswer.value !== undefined) return;
  similarQuizAnswers.value = {
    ...similarQuizAnswers.value,
    [question.id]: index,
  };
}
function submitSimilarQuizResponse() {
  const question = similarQuizCurrentQuestion.value;
  const response = similarQuizResponse.value.trim();
  if (
    !question ||
    question.options.length ||
    !response ||
    similarQuizCurrentAnswer.value !== undefined
  )
    return;
  similarQuizAnswers.value = {
    ...similarQuizAnswers.value,
    [question.id]: response,
  };
}
function advanceSimilarQuiz() {
  if (similarQuizCurrentAnswer.value === undefined) return;
  if (similarQuizIndex.value >= similarQuizQuestions.value.length - 1) {
    similarQuizComplete.value = true;
    resetSimilarQuizScroll();
    return;
  }
  similarQuizIndex.value += 1;
  const nextQuestion = similarQuizQuestions.value[similarQuizIndex.value];
  const nextAnswer = nextQuestion
    ? similarQuizAnswers.value[nextQuestion.id]
    : undefined;
  similarQuizResponse.value =
    typeof nextAnswer === "string" ? nextAnswer : "";
  resetSimilarQuizScroll();
}
function similarQuizOptionState(index: number) {
  const question = similarQuizCurrentQuestion.value;
  if (!question || similarQuizCurrentAnswer.value === undefined)
    return "neutral";
  if (index === question.correctIndex) return "correct";
  return typeof similarQuizCurrentAnswer.value === "number" &&
    index === similarQuizCurrentAnswer.value
    ? "incorrect"
    : "neutral";
}
function isSimilarQuizAnswerCorrect(
  question: SatQuizQuestion,
  answer: number | string,
) {
  if (question.options.length)
    return typeof answer === "number" && answer === question.correctIndex;
  return normalizeSimilarQuizAnswer(answer) === normalizeSimilarQuizAnswer(question.answer);
}
function normalizeSimilarQuizAnswer(value: number | string) {
  return String(value).trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
function quizChoiceLabel(index: number) {
  const sourceLabel = similarQuizCurrentQuestion.value?.optionLabels?.[index];
  if (sourceLabel) return sourceLabel;
  let number = index + 1;
  let label = "";
  while (number > 0) {
    number -= 1;
    label = String.fromCharCode(65 + (number % 26)) + label;
    number = Math.floor(number / 26);
  }
  return label;
}
function similarQuizPrompt(question: SatQuizQuestion) {
  const firstOption = question.options[0];
  if (!firstOption) return question.question;
  const optionIndex = question.question.indexOf(firstOption);
  if (optionIndex > 0) {
    const markerIndex = question.question.lastIndexOf("A)", optionIndex);
    if (markerIndex > 0 && optionIndex - markerIndex <= 4)
      return question.question.slice(0, markerIndex).trim();
  }
  const marker = question.question.search(/(?:\s|\n)A[).:]\s+/);
  return marker > 0 ? question.question.slice(0, marker).trim() : question.question;
}
function optionEntries(question: SatReportReviewQuestion) {
  return Object.entries(question.options).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}
function optionState(question: SatReportReviewQuestion, answer: string) {
  if (answer === question.correctAnswer) return "correct";
  if (answer === question.userAnswer && question.status === "INCORRECT")
    return "incorrect";
  return "neutral";
}
function formatReportTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}
function formatReportDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
function formatOrdinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}
function reviewStatusLabel(status: ReviewFilter) {
  return status === "OMITTED"
    ? "Unanswered"
    : status.charAt(0) + status.slice(1).toLowerCase();
}
function priorityLabel(priority: SatTopic["priority"]) {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function syncTabFromRoute() {
  const requestedTab = String(route.query.tab || "");
  activeTab.value = requestedTab === "results" ? "results" : "study";
  const requestedResultSource = String(route.query.reportSource || "");
  const requestedDiagnosticState = String(route.query.diagnosticState || "not-started");
  const legacyResultState = String(route.query.resultState || "");
  const requestedPracticeState = String(
    route.query.practiceState || (legacyResultState === "unlocked" ? "results" : "not-started"),
  );
  const courseOverride = String(route.query.courseState || "");
  const courseHasLearningProgress = courseOverride === "in-progress"
    ? true
    : courseOverride === "not-started"
      ? false
      : startedCourseFamilies.value.has(examFamily.value);
  const preferredActiveAssessment: AssessmentKind = requestedResultSource === "diagnostic"
    ? "diagnostic"
    : "practice";
  const normalized = normalizePrepState({
    courseHasLearningProgress,
    diagnosticState: requestedDiagnosticState,
    practiceState: requestedPracticeState,
    preferredActiveAssessment,
  });
  diagnosticTestState.value = normalized.diagnosticState;
  practiceTestState.value = normalized.practiceState;
  resultSource.value =
    requestedResultSource === "diagnostic" ||
    requestedResultSource === "practice"
      ? requestedResultSource
      : normalized.diagnosticState === "results"
        ? "diagnostic"
        : "practice";
  if (activeTab.value === "results") {
    const requestedView = String(route.query.view || "");
    resultView.value = ["full", "score", "review", "improve"].includes(requestedView)
      ? requestedView as ResultView
      : "full";
  }

  scheduleScoringCompletion("diagnostic");
  scheduleScoringCompletion("practice");

  const hasInvalidConcurrentAttempts =
    isActiveAttemptState(requestedDiagnosticState as AssessmentState) &&
    isActiveAttemptState(requestedPracticeState as AssessmentState);
  const needsCanonicalRoute = legacyResultState.length > 0 || hasInvalidConcurrentAttempts ||
    (courseOverride === "not-started" && normalized.courseState === "in-progress");
  if (needsCanonicalRoute) {
    void router.replace({
      name: "package",
      query: {
        ...route.query,
        courseState: normalized.courseState === "first-visit" ? "not-started" : "in-progress",
        diagnosticState: normalized.diagnosticState,
        practiceState: normalized.practiceState,
        resultState: undefined,
      },
      hash: activeCourseHash.value,
    });
  }
}

watch(
  [
    () => route.hash,
    () => route.query.tab,
    () => route.query.view,
    () => route.query.reportSource,
    () => route.query.diagnosticState,
    () => route.query.practiceState,
    () => route.query.resultState,
    () => route.query.courseState,
  ],
  () => {
    if (["#course-0", "#course-1", "#course-2"].includes(route.hash)) syncTabFromRoute();
    else activeTab.value = "study";
  },
);
watch([() => route.query.paywall, isProMember], syncDirectPaywallIntent);

watch(sectionFilter, initializeSectionDisclosure);

function syncFirstEntryTabFromScroll() {
  firstEntryScrollFrame = null;
  if (
    !showFirstEntryHome.value ||
    isCourseOpen.value ||
    firstEntryScrollLockTimer !== null ||
    !firstEntryCoursesPanel.value
  ) return;

  const activationLine = Math.min(260, window.innerHeight * 0.34);
  firstEntryTab.value =
    firstEntryCoursesPanel.value.getBoundingClientRect().top <= activationLine
      ? "courses"
      : "create";
}

function scheduleFirstEntryTabSync() {
  if (firstEntryScrollFrame !== null) return;
  firstEntryScrollFrame = window.requestAnimationFrame(syncFirstEntryTabFromScroll);
}

function scrollToFirstEntrySection(section: FirstEntryTab) {
  firstEntryTab.value = section;
  const target = section === "create"
    ? firstEntryCreatePanel.value
    : firstEntryCoursesPanel.value;
  if (!target) return;

  if (firstEntryScrollLockTimer !== null) {
    window.clearTimeout(firstEntryScrollLockTimer);
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stickyOffset = window.innerWidth <= 820 ? 156 : 88;
  const top = window.scrollY + target.getBoundingClientRect().top - stickyOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  firstEntryScrollLockTimer = window.setTimeout(() => {
    firstEntryScrollLockTimer = null;
    scheduleFirstEntryTabSync();
  }, reduceMotion ? 0 : 700);
}

function clampDemoControllerPosition(x: number, y: number) {
  const controller = demoController.value;
  if (!controller) return { x, y };

  const viewportMargin = 8;
  const maxX = Math.max(
    viewportMargin,
    window.innerWidth - controller.offsetWidth - viewportMargin,
  );
  const maxY = Math.max(
    viewportMargin,
    window.innerHeight - controller.offsetHeight - viewportMargin,
  );

  return {
    x: Math.min(Math.max(viewportMargin, x), maxX),
    y: Math.min(Math.max(viewportMargin, y), maxY),
  };
}

function moveDemoController(event: PointerEvent) {
  if (
    !demoControllerDrag ||
    event.pointerId !== demoControllerDrag.pointerId
  ) {
    return;
  }

  demoControllerPosition.value = clampDemoControllerPosition(
    event.clientX - demoControllerDrag.offsetX,
    event.clientY - demoControllerDrag.offsetY,
  );
}

function stopDemoControllerDrag(event?: PointerEvent) {
  if (
    event &&
    demoControllerDrag &&
    event.pointerId !== demoControllerDrag.pointerId
  ) {
    return;
  }

  demoControllerDrag = null;
  demoControllerDragging.value = false;
  window.removeEventListener("pointermove", moveDemoController);
  window.removeEventListener("pointerup", stopDemoControllerDrag);
  window.removeEventListener("pointercancel", stopDemoControllerDrag);
}

function startDemoControllerDrag(event: PointerEvent) {
  if (event.button !== 0) return;

  const controller = demoController.value;
  if (!controller) return;

  const bounds = controller.getBoundingClientRect();
  demoControllerDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
  };
  demoControllerPosition.value = { x: bounds.left, y: bounds.top };
  demoControllerDragging.value = true;
  window.addEventListener("pointermove", moveDemoController);
  window.addEventListener("pointerup", stopDemoControllerDrag);
  window.addEventListener("pointercancel", stopDemoControllerDrag);
  try {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  } catch {
    /* Some browser automation emits uncaptured synthetic pointer events. */
  }
  event.preventDefault();
}

function moveDemoControllerWithKeyboard(event: KeyboardEvent) {
  const controller = demoController.value;
  if (!controller || !event.key.startsWith("Arrow")) return;

  const distance = event.shiftKey ? 24 : 8;
  const bounds = controller.getBoundingClientRect();
  const movement = {
    ArrowLeft: { x: -distance, y: 0 },
    ArrowRight: { x: distance, y: 0 },
    ArrowUp: { x: 0, y: -distance },
    ArrowDown: { x: 0, y: distance },
  }[event.key];
  if (!movement) return;

  demoControllerPosition.value = clampDemoControllerPosition(
    bounds.left + movement.x,
    bounds.top + movement.y,
  );
  event.preventDefault();
}

function keepDemoControllerInViewport() {
  if (!demoControllerPosition.value) return;
  demoControllerPosition.value = clampDemoControllerPosition(
    demoControllerPosition.value.x,
    demoControllerPosition.value.y,
  );
}

async function loadPackageData() {
  manifest.value = null;
  resultExam.value = null;
  diagnosticSourceExam.value = null;
  loadError.value = "";
  resultLoadError.value = "";
  sectionFilter.value = isApPackage.value ? "AP Calculus BC" : isActPackage.value ? "English" : "Math";
  improveSection.value = isApPackage.value ? "ap-calculus-bc" : isActPackage.value ? "english" : "math";
  try {
    manifest.value = isApPackage.value ? await loadApManifest() : isActPackage.value ? await loadActManifest() : await loadSatManifest();
    initializeSectionDisclosure();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : `Unable to load ${examName.value} materials.`;
  }
  try {
    resultExam.value = isApPackage.value ? await loadApEpExam(1) : isActPackage.value ? await loadActEpExam(1) : await loadEpExam(1);
    diagnosticSourceExam.value = isApPackage.value ? resultExam.value : isActPackage.value ? await loadActEpExam(2) : resultExam.value;
  } catch (error) {
    resultLoadError.value = error instanceof Error ? error.message : `Unable to load the ${examName.value} score report.`;
  }
}

watch(examFamily, () => { void loadPackageData(); });

onMounted(async () => {
  document.body.classList.add("package-route");
  window.addEventListener("resize", keepDemoControllerInViewport);
  window.addEventListener("scroll", scheduleFirstEntryTabSync, { passive: true });
  syncTabFromRoute();
  try {
    const savedPredictions =
      window.localStorage.getItem("solvely:ep:created-predictions") ??
      window.localStorage.getItem("solvely:ep:created-prediction");
    if (savedPredictions) {
      const parsedPredictions = JSON.parse(savedPredictions) as unknown;
      if (Array.isArray(parsedPredictions)) {
        createdPredictions.value = parsedPredictions.filter(
          (prediction): prediction is CreatedPrediction =>
            typeof prediction === "object" &&
            prediction !== null &&
            typeof prediction.id === "string" &&
            typeof prediction.title === "string" &&
            typeof prediction.date === "string" &&
            typeof prediction.focus === "string",
        );
      } else if (
        typeof parsedPredictions === "object" &&
        parsedPredictions !== null &&
        "title" in parsedPredictions &&
        "date" in parsedPredictions &&
        "focus" in parsedPredictions &&
        typeof parsedPredictions.title === "string" &&
        typeof parsedPredictions.date === "string" &&
        typeof parsedPredictions.focus === "string"
      ) {
        createdPredictions.value = [{
          id: "prediction-migrated",
          title: parsedPredictions.title,
          date: parsedPredictions.date,
          focus: parsedPredictions.focus,
        }];
      }
    }
    const savedCourseActivity = window.localStorage.getItem(COURSE_ACTIVITY_STORAGE_KEY);
    if (savedCourseActivity) {
      const parsedActivity = JSON.parse(savedCourseActivity) as {
        startedCourseFamilies?: unknown;
        courseActivities?: unknown;
        lastActivity?: unknown;
      };
      if (Array.isArray(parsedActivity.startedCourseFamilies)) {
        const validFamilies = parsedActivity.startedCourseFamilies.filter(
          (family): family is ExamFamily =>
            family === "sat" || family === "act" || family === "ap-calculus-bc",
        );
        startedCourseFamilies.value = new Set(validFamilies);
      }
      if (typeof parsedActivity.courseActivities === "object" && parsedActivity.courseActivities !== null) {
        const restoredActivities: Partial<Record<ExamFamily, LastActivity>> = {};
        for (const [family, activity] of Object.entries(parsedActivity.courseActivities)) {
          if (
            (family === "sat" || family === "act" || family === "ap-calculus-bc") &&
            isLastActivity(activity) && activity.examFamily === family
          ) restoredActivities[family] = activity;
        }
        courseActivities.value = restoredActivities;
        startedCourseFamilies.value = new Set([
          ...startedCourseFamilies.value,
          ...(Object.keys(restoredActivities) as ExamFamily[]),
        ]);
      }
      const activity = parsedActivity.lastActivity;
      if (isLastActivity(activity)) {
        lastActivity.value = activity;
        if (!courseActivities.value[activity.examFamily]) {
          courseActivities.value = { ...courseActivities.value, [activity.examFamily]: activity };
          startedCourseFamilies.value = new Set([...startedCourseFamilies.value, activity.examFamily]);
        }
      }
    }
    showImproveImportanceNote.value =
      window.localStorage.getItem(
        `solvely:${examName.value.toLowerCase()}:improve-importance-note-dismissed`,
      ) !== "1";
  } catch {
    /* Keep both notices visible when browser storage is unavailable. */
  }
  syncTabFromRoute();
  syncDirectPaywallIntent();
  improvePracticeProgress.value = loadImprovePracticeProgress();
  await loadPackageData();
  await nextTick();
  scheduleFirstEntryTabSync();
});

onBeforeUnmount(() => {
  similarQuizRequestId += 1;
  if (similarQuizDrawer.value?.open) similarQuizDrawer.value.close();
  clearPracticeScoringTimer();
  clearDiagnosticScoringTimer();
  if (studyTopicPopoverReleaseTimer !== null) {
    window.clearTimeout(studyTopicPopoverReleaseTimer);
  }
  if (firstEntryScrollFrame !== null) {
    window.cancelAnimationFrame(firstEntryScrollFrame);
  }
  if (firstEntryScrollLockTimer !== null) {
    window.clearTimeout(firstEntryScrollLockTimer);
  }
  stopDemoControllerDrag();
  window.removeEventListener("resize", keepDemoControllerInViewport);
  window.removeEventListener("scroll", scheduleFirstEntryTabSync);
  document.body.classList.remove("package-route", "dark");
});
</script>

<template>
  <svg
    aria-hidden="true"
    style="position: absolute; width: 0; height: 0; overflow: hidden"
  >
    <symbol id="i-home" viewBox="0 0 24 24">
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </symbol>
    <symbol id="i-book" viewBox="0 0 24 24">
      <path
        d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z"
      />
    </symbol>
    <symbol id="i-mic" viewBox="0 0 24 24">
      <rect x="8" y="2" width="8" height="13" rx="4" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </symbol>
    <symbol id="i-interview" viewBox="0 0 18 18">
      <path d="M2 4.5C2 3.5335 2.7835 2.75 3.75 2.75H14.25C15.2165 2.75 16 3.5335 16 4.5V11C16 11.9665 15.2165 12.75 14.25 12.75H8L4.25 15.75V12.75H3.75C2.7835 12.75 2 11.9665 2 11V4.5Z" />
      <path d="M7.5 9C7.5 9.55229 8.17157 10 9 10C9.82845 10 10.5 9.55229 10.5 9" />
      <path d="M6.655 5.5v2M11.155 5.5v2" />
    </symbol>
    <symbol id="i-wand" viewBox="0 0 24 24">
      <path d="m15 4 5 5L8 21l-5-5zM6 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </symbol>
    <symbol id="i-exam" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 8h8M8 12h4M16 14l2 2M18 14l-2 2" />
    </symbol>
    <symbol id="i-game" viewBox="0 0 24 24">
      <path
        d="M7 8h10a5 5 0 0 1 4.6 6.9l-1.2 3a2.5 2.5 0 0 1-4.1.8L14.8 17H9.2l-1.5 1.7a2.5 2.5 0 0 1-4.1-.8l-1.2-3A5 5 0 0 1 7 8Z"
      />
      <path d="M7 12v4M5 14h4M16 13h.01M19 15h.01" />
    </symbol>
    <symbol id="i-grid" viewBox="0 0 24 24">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M18 14v8M14 18h8" />
    </symbol>
    <symbol id="i-study-guide-spark" viewBox="0 0 26 26">
      <path
        d="M20.051 3.5415 20.5887 4.79068 21.8604 5.31879 20.5887 5.8469 20.051 7.09607 19.5134 5.8469 18.2417 5.31879 19.5134 4.79068Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2.8"
      />
      <path
        d="M16.5587 11.0645 16.866 11.7783 17.5928 12.08 16.866 12.3818 16.5587 13.0957 16.2513 12.3818 15.5244 12.08 16.2513 11.7783Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="M11.3888 24.267V8.52527M11.3888 24.267C11.3888 22.5841 14.1659 21.2202 17.5924 21.2202C19.1815 21.2202 20.631 21.5147 21.7279 21.9961V12.0798M11.3888 24.267C11.3888 22.5841 8.61188 21.2202 5.18544 21.2202C3.59633 21.2202 2.14782 21.5147 1.0498 21.9961V6.25442C1.0498 6.25442 2.08372 5.47852 5.18544 5.47852C8.61188 5.47852 11.3888 6.84246 11.3888 8.52527M11.3888 8.52527C11.3888 7.90275 11.7694 7.32282 12.4228 6.84043"
        fill="none"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M11.3888 8.52527V24.267C11.3888 22.5841 8.61188 21.2202 5.18544 21.2202C3.59633 21.2202 2.14782 21.5147 1.0498 21.9961V6.25442C1.0498 6.25442 2.08372 5.47852 5.18544 5.47852C8.61188 5.47852 11.3888 6.84246 11.3888 8.52527Z"
        fill="currentColor"
        stroke="none"
      />
    </symbol>
    <symbol id="i-flashcards-solid" viewBox="0 0 26 25">
      <path
        d="M2.59501 21.8413 1.49213 21.3872C.821753 21.1061.373033 20.6195.145969 19.9275-.081094 19.2355-.0432502 18.5543.259501 17.8839L2.59501 12.8237V21.8413ZM7.78503 24.6958C7.0714 24.6958 6.46049 24.4417 5.9523 23.9336 5.44411 23.4254 5.19002 22.8145 5.19002 22.1008V14.3158L8.62841 23.8525C8.69328 24.0038 8.75816 24.1498 8.82303 24.2904 8.88791 24.4309 8.97441 24.5661 9.08253 24.6958H7.78503ZM14.4672 24.5661C13.7752 24.8256 13.1048 24.7932 12.456 24.4688 11.8073 24.1444 11.3532 23.6362 11.0937 22.9442L5.31977 7.11465C5.06027 6.42265 5.08189 5.74686 5.38464 5.0873 5.6874 4.42774 6.18477 3.97901 6.87678 3.74114L16.6729.173001C17.3649-.0865003 18.0353-.0540627 18.6841.270314 19.3328.59469 19.7869 1.10288 20.0464 1.79488L25.8203 17.6244C26.0798 18.3164 26.0582 18.9922 25.7555 19.6518 25.4527 20.3114 24.9553 20.7601 24.2633 20.998L14.4672 24.5661ZM11.6775 9.12578C12.0452 9.12578 12.3533 9.00144 12.602 8.75275 12.8507 8.50406 12.975 8.1959 12.975 7.82828 12.975 7.46065 12.8507 7.15249 12.602 6.90381 12.3533 6.65512 12.0452 6.53077 11.6775 6.53077 11.3099 6.53077 11.0018 6.65512 10.7531 6.90381 10.5044 7.15249 10.38 7.46065 10.38 7.82828 10.38 8.1959 10.5044 8.50406 10.7531 8.75275 11.0018 9.00144 11.3099 9.12578 11.6775 9.12578Z"
        fill="currentColor"
        stroke="none"
      />
    </symbol>
    <symbol id="i-quiz-stacked" viewBox="0 0 24 24">
      <path
        d="M14.4 15.6C14.74 15.6 15.035 15.475 15.285 15.225 15.535 14.975 15.66 14.68 15.66 14.34 15.66 14 15.535 13.705 15.285 13.455 15.035 13.205 14.74 13.08 14.4 13.08 14.06 13.08 13.765 13.205 13.515 13.455 13.265 13.705 13.14 14 13.14 14.34 13.14 14.68 13.265 14.975 13.515 15.225 13.765 15.475 14.06 15.6 14.4 15.6ZM13.5 11.76H15.3C15.3 11.18 15.36 10.755 15.48 10.485 15.6 10.215 15.88 9.86 16.32 9.42 16.92 8.82 17.32 8.335 17.52 7.965 17.72 7.595 17.82 7.16 17.82 6.66 17.82 5.76 17.505 5.025 16.875 4.455 16.245 3.885 15.42 3.6 14.4 3.6 13.58 3.6 12.865 3.83 12.255 4.29 11.645 4.75 11.22 5.36 10.98 6.12L12.6 6.78C12.78 6.28 13.025 5.905 13.335 5.655 13.645 5.405 14 5.28 14.4 5.28 14.88 5.28 15.27 5.415 15.57 5.685 15.87 5.955 16.02 6.32 16.02 6.78 16.02 7.06 15.94 7.325 15.78 7.575 15.62 7.825 15.34 8.14 14.94 8.52 14.28 9.1 13.875 9.555 13.725 9.885 13.575 10.215 13.5 10.84 13.5 11.76ZM7.2 19.2C6.54 19.2 5.975 18.965 5.505 18.495 5.035 18.025 4.8 17.46 4.8 16.8V2.4C4.8 1.74 5.035 1.175 5.505.705 5.975.235 6.54 0 7.2 0H21.6C22.26 0 22.825.235 23.295.705 23.765 1.175 24 1.74 24 2.4V16.8C24 17.46 23.765 18.025 23.295 18.495 22.825 18.965 22.26 19.2 21.6 19.2H7.2ZM2.4 24C1.74 24 1.175 23.765.705 23.295.235 22.825 0 22.26 0 21.6V4.8H2.4V21.6H19.2V24H2.4Z"
        fill="currentColor"
        stroke="none"
      />
    </symbol>
    <symbol id="i-play-solid" viewBox="0 0 24 24">
      <path d="M6 3 20 12 6 21Z" fill="currentColor" stroke="none" />
    </symbol>
    <symbol id="i-history" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </symbol>
    <symbol id="i-lock" viewBox="0 0 24 24">
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </symbol>
    <symbol id="i-user" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </symbol>
    <symbol id="i-moon" viewBox="0 0 24 24">
      <path d="M20 16.5A9 9 0 0 1 7.5 4 8 8 0 1 0 20 16.5Z" />
    </symbol>
    <symbol id="i-target" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </symbol>
    <symbol id="i-chart" viewBox="0 0 24 24">
      <path d="M4 20V10M10 20V5M16 20v-8M22 20H2" />
    </symbol>
    <symbol id="i-spark" viewBox="0 0 24 24">
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
    </symbol>
    <symbol id="i-search" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </symbol>
    <symbol id="i-plus" viewBox="0 0 24 24">
      <path d="M5 12h14M12 5v14" />
    </symbol>
    <symbol id="i-upload" viewBox="0 0 24 24">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </symbol>
    <symbol id="i-image" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 18 5-5 3 3 2-2 6 6" />
    </symbol>
    <symbol id="i-chevron" viewBox="0 0 24 24">
      <path d="m7 10 5 5 5-5" />
    </symbol>
    <symbol id="i-close" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </symbol>
    <symbol id="i-course-math" viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M7.5 7.5h9M8 12h2M14 12h2M8 16h2M14 16h2" />
    </symbol>
    <symbol id="i-course-biology" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="13" cy="11" r="2.5" />
      <path d="M7.5 9.5h.01M9 16h.01M16.5 15h.01" />
    </symbol>
    <symbol id="i-course-history" viewBox="0 0 24 24">
      <path d="M3 9h18L12 3zM5 20h14M7 9v8M12 9v8M17 9v8" />
    </symbol>
    <symbol id="i-course-globe" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" />
    </symbol>
    <symbol id="i-course-psychology" viewBox="0 0 24 24">
      <path d="M10 19H8a4 4 0 0 1-3.2-6.4A4.5 4.5 0 0 1 8 5a4 4 0 0 1 4 4v10M14 19h2a4 4 0 0 0 3.2-6.4A4.5 4.5 0 0 0 16 5a4 4 0 0 0-4 4M8 10h1M15 10h1M7 15h2M15 15h2" />
    </symbol>
    <symbol id="i-course-chemistry" viewBox="0 0 24 24">
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 16h9" />
    </symbol>
    <symbol id="i-course-statistics" viewBox="0 0 24 24">
      <path d="M4 20V10M10 20V5M16 20v-8M21 20H2" />
      <circle cx="19" cy="7" r="2" />
    </symbol>
    <symbol id="i-course-language" viewBox="0 0 24 24">
      <path d="M4 5h10v8H8l-4 3zM11 16h5l4 3V9h-3" />
      <path d="m8 10 2-4 2 4M8.7 8.5h2.6" />
    </symbol>
    <symbol id="i-course-code" viewBox="0 0 24 24">
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </symbol>
    <symbol id="i-course-art" viewBox="0 0 24 24">
      <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12Z" />
      <circle cx="7.5" cy="10" r="1" /><circle cx="9.5" cy="6.5" r="1" /><circle cx="14" cy="6" r="1" /><circle cx="17" cy="9" r="1" />
    </symbol>
    <symbol id="i-course-business" viewBox="0 0 24 24">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </symbol>
    <symbol id="i-course-government" viewBox="0 0 24 24">
      <path d="m3 9 9-6 9 6M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16M3 21h18" />
    </symbol>
    <symbol id="i-course-security" viewBox="0 0 24 24">
      <path d="M12 3 20 6v5c0 5-3.2 8.4-8 10-4.8-1.6-8-5-8-10V6Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </symbol>
    <symbol id="i-course-environment" viewBox="0 0 24 24">
      <path d="M20 4C11 4 5 8.2 5 14a5 5 0 0 0 5 5c5.8 0 10-6 10-15Z" />
      <path d="M4 21c2.6-5.6 6.5-9.3 12-12" />
    </symbol>
    <symbol id="i-course-economics" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5c-.7-1-1.8-1.5-3.5-1.5-2 0-3.5 1-3.5 2.5s1.2 2.2 3.8 2.7c2.2.4 3.2 1.1 3.2 2.5S14.1 17 12 17c-1.8 0-3.1-.6-3.8-1.7M12 5v14" />
    </symbol>
    <symbol id="i-course-music" viewBox="0 0 24 24">
      <path d="M9 18V6l10-2v12" />
      <ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="16" cy="16" rx="3" ry="2" />
    </symbol>
    <symbol id="i-course-network" viewBox="0 0 24 24">
      <rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </symbol>
    <symbol id="i-course-research" viewBox="0 0 24 24">
      <circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 6 6M8 7h4M7 10h6M8 13h3" />
    </symbol>
    <symbol id="i-course-physics" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="1.5" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" />
    </symbol>
  </svg>

  <div
    :class="[
      'app',
      'solvely-home-app',
      { 'sidebar-collapsed': sidebarCollapsed },
    ]"
  >
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="brand-row">
        <div class="brand-mark">
          <img
            class="brand-logo"
            src="/assets/solvely-ai-logo.jpeg"
            alt=""
            width="26"
            height="26"
          />
        </div>
        <div class="brand">Solvely.ai</div>
        <button
          class="sidebar-collapse"
          type="button"
          aria-label="Collapse sidebar"
          @click="sidebarCollapsed = true"
        >
          <svg class="icon icon-sm" viewBox="0 0 24 24">
            <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
            <path d="M9 5v14M14.5 8.5 11 12l3.5 3.5" />
          </svg>
        </button>
      </div>
      <nav class="sidebar-nav">
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-home" /></svg
          ><span class="nav-label">Home</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-book" /></svg
          ><span class="nav-label">AI Study</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-interview" /></svg
          ><span class="nav-label">AI Interview</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-mic" /></svg
          ><span class="nav-label">AI Live Notes</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-wand" /></svg
          ><span class="nav-label">AI Writing Tools</span>
        </button>
        <button class="nav-button active" type="button" @click="openExamPredictorHome">
          <svg class="icon"><use href="#i-exam" /></svg
          ><span class="nav-label">Exam Prep &amp; Courses</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-game" /></svg
          ><span class="nav-label">Mini Games</span>
        </button>
      </nav>
      <div class="sidebar-spacer" />
      <div class="side-meta">
        <section
          class="app-download-card"
          aria-label="Download the Solvely app"
        >
          <div class="app-store-links">
            <span class="app-store-entry"
              ><a
                class="app-store-link apple-store"
                href="https://apps.apple.com/us/app/solvely-ai-study-tools/id6446930976"
                target="_blank"
                rel="noopener"
                ><img
                  src="/assets/download-on-app-store.svg"
                  alt="Download on the App Store"
                  width="96"
                  height="32" /></a></span
            ><span class="app-store-entry"
              ><a
                class="app-store-link google-play"
                href="https://play.google.com/store/apps/details?id=com.solvely.photo.math.solver.calculator.ai"
                target="_blank"
                rel="noopener"
                ><img
                  src="/assets/get-it-on-google-play-trimmed.png"
                  alt="Get it on Google Play"
                  width="107"
                  height="32" /></a
            ></span>
          </div>
          <span class="app-qr-popover" role="tooltip"
            ><img
              src="/assets/solvely-mobile-qr.svg"
              alt=""
              width="132"
              height="132"
            /><small>Scan to download Solvely</small></span
          >
        </section>
        <button class="upgrade" type="button" aria-disabled="true">
          <span class="discount">57%<br />OFF</span
          ><span class="upgrade-label">⬆ Upgrade</span>
        </button>
        <div class="user-row">
          <div class="avatar">
            <svg class="icon icon-sm"><use href="#i-user" /></svg>
          </div>
          <span class="user-name">Anna</span
          ><button
            class="theme-toggle"
            type="button"
            aria-label="Toggle dark mode"
            @click="toggleTheme"
          >
            <svg class="icon"><use href="#i-moon" /></svg>
          </button>
        </div>
      </div>
    </aside>

    <main>
      <div
        v-if="false"
        class="extension-entry"
        aria-label="Solvely Chrome extension"
      >
        <a
          class="extension-cta"
          href="https://chromewebstore.google.com/detail/aedglnfjjccpifohekdeoogffomjcikm"
          target="_blank"
          rel="noopener"
          ><svg class="extension-browser-icon" viewBox="0 0 24 24">
            <path
              d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z"
            /></svg
          ><span>Get the Chrome Extension</span
          ><span class="extension-tooltip">Solve anywhere on the web</span></a
        >
      </div>
      <button
        v-if="false"
        class="history-entry"
        type="button"
        aria-disabled="true"
      >
        <svg class="icon"><use href="#i-history" /></svg><span>History</span>
      </button>

      <div
        v-if="!isCourseOpen"
        :class="['workspace', 'predictor-home-workspace', { 'is-first-entry': showFirstEntryHome }]"
      >
        <template v-if="showFirstEntryHome">
          <header class="first-entry-heading">
            <h1 id="firstEntryTitle">{{ FIRST_ENTRY_HOME_TITLE }}</h1>
            <p>{{ FIRST_ENTRY_HOME_SUBTITLE }}</p>
          </header>
          <div class="first-entry-tabs-wrap">
            <div class="first-entry-tabs" role="navigation" aria-label="Choose how to prepare">
              <button
                id="firstEntryCreateTab"
                class="first-entry-tab"
                type="button"
                :aria-current="firstEntryTab === 'create' ? 'page' : undefined"
                aria-controls="firstEntryCreatePanel"
                @click="scrollToFirstEntrySection('create')"
              >
                Custom Plan
              </button>
              <button
                id="firstEntryCoursesTab"
                class="first-entry-tab"
                type="button"
                :aria-current="firstEntryTab === 'courses' ? 'page' : undefined"
                aria-controls="firstEntryCoursesPanel"
                @click="scrollToFirstEntrySection('courses')"
              >
                Prep Courses
              </button>
            </div>
            <span
              v-if="firstEntryTab === 'create'"
              class="first-entry-courses-guide"
              role="note"
            >SAT, ACT and AP Prep</span>
          </div>
          <section class="first-entry-hero" aria-labelledby="firstEntryTitle">
            <div
              ref="firstEntryCreatePanel"
              id="firstEntryCreatePanel"
              class="first-entry-tab-panel"
              aria-labelledby="firstEntryCreateTab"
            >
              <div
                class="first-entry-upload"
                @dragover.prevent
                @drop.prevent="handlePrepFileDrop"
              >
                <div class="first-entry-upload-copy">
                  <img
                    class="first-entry-upload-icon light"
                    src="/assets/ep-home/exam-upload-icon.webp"
                    alt=""
                  />
                  <img
                    class="first-entry-upload-icon dark"
                    src="/assets/ep-home/exam-upload-icon-dark.webp"
                    alt=""
                  />
                  <h2>Upload your study materials here for a personalized study plan and realistic mock exams.</h2>
                  <p class="first-entry-upload-formats">PDF, Word, PPT, TXT, or images · Up to 50 pages</p>
                  <button type="button" @click="openPrepFilePicker">Select files</button>
                </div>
                <div class="first-entry-upload-visual" aria-hidden="true">
                  <span class="first-entry-generator-art">
                    <span class="generator-materials">
                      <span class="generator-file generator-file-notes">
                        <b>Notes</b>
                        <small>Course notes</small>
                      </span>
                      <span class="generator-file generator-file-pdf">
                        <b>PDF</b>
                        <small>Past exam</small>
                      </span>
                    </span>
                    <span class="generator-flow" />
                    <span class="generator-engine">
                      <span class="generator-spark">✦</span>
                      <strong>Solvely AI</strong>
                      <small>Building your prep</small>
                    </span>
                    <span class="generator-flow" />
                    <span class="generator-outcomes">
                      <span class="generator-result-card plan">
                        <small>STUDY PLAN</small>
                        <strong>Personalized plan</strong>
                        <span class="generator-plan-lines"><i /><i /><i /></span>
                      </span>
                      <span class="generator-result-card exam">
                        <small>MOCK EXAM</small>
                        <strong>Realistic questions</strong>
                        <span class="generator-answer-line"><i /> A</span>
                        <span class="generator-answer-line selected"><i /> B</span>
                      </span>
                    </span>
                  </span>
                </div>
                <input
                  ref="prepFileInput"
                  class="sr-only"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.heic,.webp"
                  aria-label="Choose exam materials"
                  @change="handlePrepFileSelection"
                />
              </div>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="predictor-home-hero" aria-labelledby="predictorHomeTitle">
            <div class="predictor-home-copy">
              <h1 id="predictorHomeTitle">{{ ACTIVE_HOME_TITLE }}</h1>
              <p>{{ ACTIVE_HOME_SUBTITLE }}</p>
            </div>
            <button
              class="new-prediction-button"
              type="button"
              @click="openNewPrediction"
            >
              <svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg>
              <span>New Prep Plan</span>
            </button>
          </section>

          <section class="predictor-library" aria-labelledby="examLibraryTitle">
            <div class="predictor-library-heading">
              <h2 id="examLibraryTitle">Exam Library</h2>
              <span>{{ examLibraryTotal }} Total</span>
            </div>
            <div class="predictor-library-grid">
              <button
                v-for="activity in (showFirstEntryHome ? [] : courseActivityList)"
                :key="activity.examFamily"
                class="predictor-library-card package-progress"
                type="button"
                :aria-label="`${activityCta(activity)}: ${activity.examTitle}, ${activity.itemTitle}`"
                @click="resumeActivity(activity)"
              >
                <div class="predictor-library-banner">
                  <span class="predictor-library-state">IN PROGRESS</span>
                  <h3>{{ activity.examTitle }}</h3>
                </div>
                <div class="predictor-library-details">
                  <span><svg class="icon" aria-hidden="true"><use href="#i-target" /></svg>{{ activityProgressLabel(activity) }}</span>
                  <span><svg class="icon" aria-hidden="true"><use href="#i-history" /></svg>{{ activityContextLabel(activity) }}</span>
                  <small>{{ activity.itemTitle }}</small>
                </div>
              </button>
              <button
                v-for="prediction in createdPredictions"
                :key="prediction.id"
                class="predictor-library-card created"
                type="button"
                :aria-label="`Edit ${prediction.title}`"
                @click="editCreatedPrediction(prediction)"
              >
                <div class="predictor-library-banner">
                  <span class="predictor-library-state">READY</span>
                  <h3>{{ prediction.title }}</h3>
                </div>
                <div class="predictor-library-details">
                  <span><svg class="icon"><use href="#i-target" /></svg>0% Mastered</span>
                  <span><svg class="icon"><use href="#i-history" /></svg>{{ prediction.focus }}</span>
                  <small>Exam Date {{ formatPredictionDate(prediction.date) }}</small>
                </div>
              </button>
              <article v-if="showSeededPrediction" class="predictor-library-card">
                <div class="predictor-library-banner">
                  <span class="predictor-library-state">IN PROGRESS</span>
                  <h3>Biology 101 Final Exam</h3>
                </div>
                <div class="predictor-library-details">
                  <span><svg class="icon"><use href="#i-target" /></svg>3% Mastered</span>
                  <small>Exam Date Oct 24</small>
                </div>
              </article>
              <button
                class="new-prediction-card"
                type="button"
                @click="openNewPrediction"
              >
                <span><svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg></span>
                <strong>New Prep Plan</strong>
              </button>
            </div>
          </section>
        </template>

        <header class="hero" hidden>
          <h1>Solvely: Your AI Study Companion</h1>
          <div
            class="workspace-mode-switch"
            role="tablist"
            aria-label="Choose workspace mode"
          >
            <button
              class="workspace-mode-button"
              type="button"
              role="tab"
              aria-selected="false"
              aria-disabled="true"
            >
              <svg class="icon"><use href="#i-book" /></svg
              ><span>Study</span></button
            ><button
              class="workspace-mode-button"
              type="button"
              role="tab"
              aria-selected="true"
            >
              <svg class="icon"><use href="#i-target" /></svg
              ><span>Exam Prep</span></button
            ><button
              class="workspace-mode-button"
              type="button"
              role="tab"
              aria-selected="false"
              aria-disabled="true"
            >
              <svg class="icon"><use href="#i-wand" /></svg><span>Writing</span>
            </button>
          </div>
        </header>
        <section class="composer-shell" aria-label="Solvely learning composer" hidden>
          <div class="composer-input-wrap">
            <textarea
              class="composer-input"
              aria-label="Tell Solvely what you want to learn"
              placeholder="Choose an exam or describe what you are preparing for"
            />
          </div>
          <div class="composer-toolbar">
            <button
              class="tool-button"
              type="button"
              aria-label="Attach files"
              aria-disabled="true"
            >
              <svg class="icon"><use href="#i-upload" /></svg></button
            ><button
              class="tool-button"
              type="button"
              aria-label="Upload images"
              aria-disabled="true"
            >
              <svg class="icon"><use href="#i-image" /></svg></button
            ><span class="toolbar-spacer" /><button
              class="send-button"
              type="button"
              disabled
            >
              <svg class="icon"><use href="#i-spark" /></svg
              ><span>Create plan</span>
            </button>
          </div>
        </section>

        <section class="examples-section" aria-label="Exam prep examples" hidden>
          <div class="examples-heading">
            <div class="examples-copy"><h2>Exam prep plan</h2></div>
            <p class="examples-description">
              Plan, practice, and track your exam progress.
            </p>
          </div>
          <div class="examples-grid four-up">
            <button
              class="example-card feature-card sample-disabled"
              type="button"
              disabled
            >
              <span class="example-meta"
                ><span>Plan</span
                ><svg class="icon"><use href="#i-target" /></svg
              ></span>
              <h3>Daily study plan</h3>
              <div class="example-preview exam-feature-visual exam-plan-visual">
                <section class="exam-visual-panel">
                  <header class="exam-plan-header">
                    <div>
                      <strong>Study Plan</strong
                      ><span class="exam-plan-meta"
                        >Exam: Aug 31, 2026<i />6-day plan</span
                      >
                    </div>
                  </header>
                  <div class="exam-plan-calendar">
                    <span
                      v-for="(day, index) in [
                        '24',
                        '25',
                        '26',
                        '27',
                        '28',
                        '29',
                        '30',
                      ]"
                      :key="day"
                      :class="['exam-plan-day', { active: index === 1 }]"
                      ><b>{{ day }}</b></span
                    >
                  </div>
                  <div class="exam-plan-task-area">
                    <div class="exam-plan-task-head">
                      <span>6 days until exam</span><span>3 tasks</span>
                    </div>
                    <div class="exam-plan-task">
                      <span class="exam-plan-check" /><span
                        >Model Selection</span
                      >
                    </div>
                    <div class="exam-plan-task done">
                      <span class="exam-plan-check">✓</span
                      ><span>Stationarity Testing</span>
                    </div>
                  </div>
                </section>
              </div>
            </button>
            <button
              class="example-card feature-card sample-disabled"
              type="button"
              disabled
            >
              <span class="example-meta"
                ><span>Review</span
                ><svg class="icon"><use href="#i-target" /></svg
              ></span>
              <h3>Core topics</h3>
              <div
                class="example-preview exam-feature-visual exam-topics-visual"
              >
                <div class="exam-topics-table">
                  <div class="exam-topics-head">
                    <span>Topic</span><span>Likelihood</span
                    ><span>Mastery</span>
                  </div>
                  <div
                    v-for="(topicName, index) in [
                      'Model Selection',
                      'Stationarity Testing',
                      'ARIMA Modeling',
                      'SARIMA Modeling',
                      'Dynamic Regression',
                    ]"
                    :key="topicName"
                    class="exam-topic-row"
                  >
                    <span>{{ topicName }}</span
                    ><strong class="exam-likelihood"
                      >{{ 98 - index * 2 }}%</strong
                    ><span class="exam-mastery"
                      ><strong>{{ index ? 0 : 30 }}%</strong
                      ><span class="exam-mastery-track"
                        ><i :style="{ width: index ? '0%' : '30%' }" /></span
                    ></span>
                  </div>
                </div>
              </div>
            </button>
            <button
              class="example-card feature-card sample-disabled"
              type="button"
              disabled
            >
              <span class="example-meta"
                ><span>Practice</span
                ><svg class="icon"><use href="#i-target" /></svg
              ></span>
              <h3>Mock exams</h3>
              <div class="example-preview exam-feature-visual exam-mock-visual">
                <div class="exam-mock-visual-grid">
                  <section
                    v-for="exam in 2"
                    :key="exam"
                    class="exam-mock-visual-card"
                  >
                    <span class="exam-mock-visual-icon"
                      ><svg class="icon">
                        <use
                          :href="exam === 1 ? '#i-target' : '#i-spark'"
                        /></svg
                    ></span>
                    <div class="exam-mock-title-row">
                      <strong>Mock Exam {{ exam }}</strong
                      ><span class="exam-mock-badge">{{
                        exam === 1 ? "≥90% likely" : "80–90% likely"
                      }}</span>
                    </div>
                    <p>The must-know questions. Nail these first</p>
                    <p class="exam-mock-meta">34 mins · 25 Questions</p>
                    <span class="exam-mock-state">Not started</span
                    ><span class="exam-mock-button">Start exam →</span>
                  </section>
                </div>
              </div>
            </button>
            <button
              class="example-card feature-card sample-disabled"
              type="button"
              disabled
            >
              <span class="example-meta"
                ><span>Assess</span
                ><svg class="icon"><use href="#i-target" /></svg
              ></span>
              <h3>Progress tracking</h3>
              <div
                class="example-preview exam-feature-visual exam-result-shell"
              >
                <div class="exam-result-progress"><i /></div>
                <section class="exam-result-summary">
                  <h4>FINAL Exam: Biology 101</h4>
                  <div class="exam-result-stats">
                    <span>Points: <strong>21 / 26</strong></span
                    ><span>Percentage: <strong>81%</strong></span>
                  </div>
                  <div class="exam-result-analysis">
                    <strong>Final exam analysis</strong
                    ><span
                      >You demonstrated strong understanding of cell structure,
                      genetics, and ecology.</span
                    >
                  </div>
                </section>
                <section class="exam-result-question">
                  <small>Multiple Choice · 1/26</small>
                  <h5>Where does the electron transport chain occur?</h5>
                  <div class="exam-result-answer wrong">A. Cytoplasm</div>
                  <div class="exam-result-answer correct">
                    D. Inner mitochondrial membrane
                  </div>
                </section>
              </div>
            </button>
          </div>
        </section>

        <section
          ref="firstEntryCoursesPanel"
          id="firstEntryCoursesPanel"
          :class="['exam-catalog', { 'first-entry-courses-panel': showFirstEntryHome }]"
          :aria-labelledby="showFirstEntryHome ? 'firstEntryCoursesTab' : 'examCatalogTitle'"
        >
          <div class="predictor-library-heading exam-catalog-heading">
            <h2 id="examCatalogTitle">Standardized Test Prep Courses</h2>
          </div>
          <div class="exam-catalog-toolbar">
            <label class="exam-search-wrap"
              ><svg class="icon"><use href="#i-search" /></svg
              ><input
                v-model="searchQuery"
                aria-label="Search standardized test prep courses"
                placeholder="Search a ready-made course for the exam you are preparing for..." /></label
            ><label class="exam-filter-wrap"
              ><span class="sr-only">Filter standardized test prep courses</span
              ><select v-model="familyFilter" aria-label="Filter standardized test prep courses">
                <option value="all">All courses</option>
                <option value="sat">SAT</option>
                <option value="act">ACT</option>
                <option value="ap">AP</option>
                <option value="abitur">Abitur</option>
                </select
              ><svg class="icon"><use href="#i-chevron" /></svg
            ></label>
          </div>
          <div class="course-grid" aria-label="Standardized test prep courses">
            <button
              v-for="course in filteredCourses"
              :key="course.title"
              :class="[
                'course-card',
                `course-card-${course.family}`,
                { 'sample-course': !isCourseAvailable(course) },
              ]"
              type="button"
              :disabled="!isCourseAvailable(course)"
              :aria-label="`${courseHomeAction(course)}: ${course.title}`"
              @click="openCourseFromHome(course)"
            >
              <span class="course-card-banner">
                <span
                  :class="['course-card-icon', { 'course-card-icon-exam': course.icon === 'exam' }]"
                  aria-hidden="true"
                >
                  <span v-if="course.icon === 'exam'">{{ course.label }}</span>
                  <svg v-else class="icon"><use :href="`#i-course-${course.icon}`" /></svg>
                </span>
                <strong>{{ course.title }}</strong>
              </span>
              <span class="course-card-body">
                <span class="course-card-detail">
                  • {{ course.topics }} topics · video lessons
                </span>
                <span class="course-card-detail">
                  • {{ course.questions }} practice questions
                </span>
                <span class="course-card-detail">
                  • 1 full-length test • score insights
                </span>
                <strong class="course-card-action">
                  {{ courseHomeAction(course) }}
                  <svg v-if="isCourseAvailable(course)" class="icon" aria-hidden="true"><use href="#i-chevron" /></svg>
                </strong>
              </span>
            </button>
          </div>
          <p v-if="!filteredCourses.length" class="course-empty">
            No matching courses. Try another exam name.
          </p>
        </section>
      </div>

      <section
        v-else
        class="course-workspace"
        aria-labelledby="courseWorkspaceTitle"
      >
        <header class="course-package-hero">
          <div class="course-package-hero-inner">
            <span class="course-package-art" aria-hidden="true"
              ><i /><i /><i
            /></span>
            <button class="course-back" type="button" @click="closeCourse">
              <svg class="icon"><use href="#i-chevron" /></svg
              ><span>Back to courses</span>
            </button>
            <div class="course-package-hero-main">
              <div class="course-package-copy">
                <h1 id="courseWorkspaceTitle">{{ packageTitle }}</h1>
                <p>
                  {{ packageTitle }} with focused study tools, a realistic {{ examName }} test,
                  a score report, and targeted practice.
                </p>
                <div class="course-package-stats" aria-label="Course contents">
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-book" /></svg
                    ><strong>{{ isApPackage ? '49' : isActPackage ? '235' : '100' }}</strong> video lessons</span
                  >
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-grid" /></svg
                    ><strong>{{ isApPackage ? '2,940' : isActPackage ? '6,600' : '3,879' }}</strong> practice questions</span
                  >
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-exam" /></svg
                    ><strong>1</strong> full-length test</span
                  >
                </div>
              </div>
              <aside
                v-if="!isCourseStarted"
                class="course-journey-start"
                aria-label="Start your prep journey"
              >
                <svg
                  class="course-journey-art"
                  viewBox="0 4 184 76"
                  aria-hidden="true"
                  focusable="false"
                >
                  <defs>
                    <path id="prepJourneyLineOne" d="M62.93 28.84Q62.93 30.4 62.13 31.64Q61.32 32.89 59.78 33.59Q58.23 34.29 56.11 34.29Q53.57 34.29 51.91 33.33Q50.74 32.64 50.01 31.49Q49.28 30.33 49.28 29.24Q49.28 28.61 49.72 28.16Q50.16 27.71 50.84 27.71Q51.39 27.71 51.77 28.06Q52.15 28.41 52.42 29.1Q52.75 29.92 53.13 30.47Q53.51 31.02 54.2 31.38Q54.89 31.74 56.02 31.74Q57.56 31.74 58.53 31.02Q59.5 30.3 59.5 29.22Q59.5 28.36 58.97 27.83Q58.45 27.3 57.63 27.02Q56.8 26.73 55.42 26.42Q53.57 25.98 52.32 25.4Q51.07 24.82 50.34 23.82Q49.61 22.82 49.61 21.33Q49.61 19.91 50.38 18.81Q51.15 17.71 52.62 17.12Q54.08 16.53 56.06 16.53Q57.64 16.53 58.8 16.92Q59.95 17.31 60.71 17.96Q61.48 18.61 61.83 19.33Q62.18 20.04 62.18 20.72Q62.18 21.34 61.74 21.84Q61.3 22.34 60.64 22.34Q60.05 22.34 59.74 22.04Q59.43 21.74 59.06 21.06Q58.59 20.09 57.94 19.54Q57.28 19 55.83 19Q54.48 19 53.65 19.59Q52.83 20.18 52.83 21.02Q52.83 21.53 53.11 21.91Q53.39 22.28 53.88 22.55Q54.38 22.82 54.88 22.97Q55.38 23.12 56.54 23.42Q58 23.76 59.17 24.17Q60.35 24.58 61.18 25.16Q62 25.75 62.47 26.65Q62.93 27.54 62.93 28.84Z M65.84 21.57H66.19V19.64Q66.19 18.87 66.23 18.43Q66.27 17.99 66.46 17.68Q66.64 17.35 67 17.14Q67.35 16.94 67.78 16.94Q68.39 16.94 68.88 17.39Q69.21 17.7 69.3 18.14Q69.39 18.58 69.39 19.39V21.57H70.56Q71.24 21.57 71.6 21.89Q71.95 22.21 71.95 22.71Q71.95 23.36 71.44 23.62Q70.93 23.88 69.98 23.88H69.39V29.76Q69.39 30.51 69.44 30.91Q69.49 31.32 69.72 31.57Q69.95 31.82 70.46 31.82Q70.75 31.82 71.23 31.72Q71.71 31.62 71.98 31.62Q72.36 31.62 72.67 31.93Q72.98 32.24 72.98 32.7Q72.98 33.47 72.14 33.88Q71.3 34.29 69.71 34.29Q68.21 34.29 67.44 33.79Q66.67 33.29 66.43 32.39Q66.19 31.5 66.19 30.02V23.88H65.77Q65.07 23.88 64.71 23.55Q64.35 23.22 64.35 22.71Q64.35 22.21 64.73 21.89Q65.11 21.57 65.84 21.57Z M82.24 32.49Q81.08 33.39 80 33.84Q78.91 34.29 77.57 34.29Q76.34 34.29 75.4 33.81Q74.47 33.32 73.97 32.49Q73.46 31.66 73.46 30.68Q73.46 29.37 74.3 28.45Q75.13 27.52 76.58 27.2Q76.89 27.13 78.09 26.89Q79.3 26.64 80.16 26.44Q81.02 26.23 82.03 25.94Q81.97 24.67 81.52 24.08Q81.07 23.49 79.65 23.49Q78.43 23.49 77.82 23.83Q77.2 24.17 76.76 24.85Q76.32 25.53 76.14 25.74Q75.96 25.96 75.36 25.96Q74.82 25.96 74.43 25.62Q74.04 25.27 74.04 24.73Q74.04 23.89 74.64 23.09Q75.23 22.29 76.5 21.78Q77.77 21.26 79.65 21.26Q81.76 21.26 82.97 21.76Q84.18 22.26 84.67 23.34Q85.17 24.41 85.17 26.2Q85.17 27.32 85.17 28.11Q85.16 28.89 85.15 29.85Q85.15 30.75 85.45 31.73Q85.75 32.71 85.75 32.99Q85.75 33.48 85.28 33.89Q84.82 34.29 84.23 34.29Q83.74 34.29 83.26 33.83Q82.78 33.37 82.24 32.49ZM82.03 27.86Q81.33 28.12 79.99 28.4Q78.64 28.69 78.13 28.83Q77.61 28.96 77.14 29.35Q76.68 29.75 76.68 30.45Q76.68 31.18 77.23 31.69Q77.78 32.2 78.67 32.2Q79.62 32.2 80.42 31.78Q81.22 31.36 81.6 30.71Q82.03 29.98 82.03 28.32Z M91.59 29.68V32.35Q91.59 33.32 91.14 33.81Q90.68 34.29 89.98 34.29Q89.29 34.29 88.84 33.8Q88.39 33.31 88.39 32.35V23.44Q88.39 21.29 89.95 21.29Q90.75 21.29 91.1 21.79Q91.45 22.29 91.49 23.28Q92.06 22.29 92.67 21.79Q93.27 21.29 94.28 21.29Q95.29 21.29 96.23 21.79Q97.18 22.29 97.18 23.12Q97.18 23.71 96.78 24.09Q96.38 24.47 95.91 24.47Q95.73 24.47 95.06 24.26Q94.38 24.04 93.87 24.04Q93.16 24.04 92.72 24.41Q92.27 24.78 92.03 25.5Q91.78 26.23 91.69 27.23Q91.59 28.23 91.59 29.68Z M99.11 21.57H99.46V19.64Q99.46 18.87 99.5 18.43Q99.54 17.99 99.73 17.68Q99.91 17.35 100.27 17.14Q100.62 16.94 101.05 16.94Q101.66 16.94 102.15 17.39Q102.48 17.7 102.57 18.14Q102.66 18.58 102.66 19.39V21.57H103.83Q104.51 21.57 104.87 21.89Q105.22 22.21 105.22 22.71Q105.22 23.36 104.71 23.62Q104.2 23.88 103.25 23.88H102.66V29.76Q102.66 30.51 102.71 30.91Q102.76 31.32 102.99 31.57Q103.22 31.82 103.73 31.82Q104.02 31.82 104.5 31.72Q104.98 31.62 105.25 31.62Q105.63 31.62 105.94 31.93Q106.25 32.24 106.25 32.7Q106.25 33.47 105.41 33.88Q104.57 34.29 102.98 34.29Q101.48 34.29 100.71 33.79Q99.94 33.29 99.7 32.39Q99.46 31.5 99.46 30.02V23.88H99.04Q98.34 23.88 97.98 23.55Q97.62 23.22 97.62 22.71Q97.62 22.21 98 21.89Q98.38 21.57 99.11 21.57Z  M116.38 34.69 116.67 33.98 112.73 24.06Q112.37 23.21 112.37 22.82Q112.37 22.41 112.58 22.06Q112.79 21.71 113.16 21.5Q113.53 21.29 113.93 21.29Q114.62 21.29 114.97 21.72Q115.32 22.16 115.59 22.98L118.3 30.86L120.87 23.54Q121.17 22.64 121.42 22.14Q121.66 21.64 121.94 21.46Q122.21 21.29 122.72 21.29Q123.08 21.29 123.42 21.48Q123.75 21.67 123.93 22Q124.11 22.33 124.11 22.69Q124.07 22.91 123.96 23.32Q123.86 23.73 123.7 24.16L119.53 35.08Q118.99 36.52 118.48 37.34Q117.96 38.16 117.11 38.6Q116.26 39.04 114.82 39.04Q113.41 39.04 112.71 38.73Q112.01 38.43 112.01 37.62Q112.01 37.07 112.34 36.77Q112.68 36.47 113.33 36.47Q113.59 36.47 113.84 36.54Q114.14 36.61 114.36 36.61Q114.91 36.61 115.23 36.45Q115.55 36.29 115.8 35.88Q116.05 35.48 116.38 34.69Z M138.41 27.79Q138.41 29.22 137.96 30.43Q137.52 31.63 136.68 32.5Q135.83 33.37 134.66 33.83Q133.49 34.29 132.02 34.29Q130.57 34.29 129.41 33.82Q128.25 33.36 127.4 32.48Q126.55 31.61 126.11 30.42Q125.67 29.23 125.67 27.79Q125.67 26.34 126.12 25.13Q126.56 23.92 127.39 23.07Q128.23 22.21 129.41 21.75Q130.59 21.29 132.02 21.29Q133.48 21.29 134.66 21.75Q135.84 22.22 136.69 23.09Q137.53 23.96 137.97 25.15Q138.41 26.35 138.41 27.79ZM135.2 27.79Q135.2 25.83 134.34 24.74Q133.48 23.65 132.02 23.65Q131.09 23.65 130.37 24.14Q129.66 24.62 129.27 25.57Q128.88 26.52 128.88 27.79Q128.88 29.04 129.26 29.98Q129.64 30.92 130.35 31.42Q131.06 31.91 132.02 31.91Q133.48 31.91 134.34 30.82Q135.2 29.72 135.2 27.79Z M149.24 32.49V32.08Q148.66 32.8 148.03 33.3Q147.4 33.79 146.65 34.03Q145.9 34.27 144.94 34.27Q143.78 34.27 142.86 33.79Q141.94 33.31 141.43 32.46Q140.84 31.45 140.84 29.54V23.2Q140.84 22.23 141.27 21.76Q141.7 21.29 142.42 21.29Q143.14 21.29 143.59 21.77Q144.04 22.25 144.04 23.2V28.32Q144.04 29.43 144.22 30.19Q144.41 30.94 144.9 31.37Q145.38 31.8 146.21 31.8Q147.02 31.8 147.74 31.32Q148.45 30.84 148.78 30.06Q149.05 29.38 149.05 27.09V23.2Q149.05 22.25 149.5 21.77Q149.94 21.29 150.66 21.29Q151.37 21.29 151.8 21.76Q152.24 22.23 152.24 23.2V32.46Q152.24 33.38 151.82 33.84Q151.41 34.29 150.75 34.29Q150.09 34.29 149.67 33.82Q149.24 33.34 149.24 32.49Z M158.6 29.68V32.35Q158.6 33.32 158.14 33.81Q157.69 34.29 156.98 34.29Q156.29 34.29 155.85 33.8Q155.4 33.31 155.4 32.35V23.44Q155.4 21.29 156.96 21.29Q157.76 21.29 158.11 21.79Q158.46 22.29 158.5 23.28Q159.07 22.29 159.67 21.79Q160.28 21.29 161.29 21.29Q162.29 21.29 163.24 21.79Q164.19 22.29 164.19 23.12Q164.19 23.71 163.79 24.09Q163.38 24.47 162.91 24.47Q162.74 24.47 162.06 24.26Q161.39 24.04 160.88 24.04Q160.17 24.04 159.73 24.41Q159.28 24.78 159.04 25.5Q158.79 26.23 158.7 27.23Q158.6 28.23 158.6 29.68Z" />
                    <path id="prepJourneyLineTwo" d="M11.18 50.71V51.15Q12.2 49.9 13.29 49.31Q14.38 48.72 15.77 48.72Q17.43 48.72 18.83 49.58Q20.23 50.44 21.04 52.08Q21.85 53.73 21.85 55.99Q21.85 57.65 21.38 59.04Q20.91 60.43 20.09 61.37Q19.28 62.31 18.16 62.82Q17.05 63.33 15.77 63.33Q14.23 63.33 13.18 62.71Q12.13 62.09 11.18 60.89V66.3Q11.18 68.67 9.45 68.67Q8.44 68.67 8.11 68.06Q7.78 67.44 7.78 66.27V50.74Q7.78 49.71 8.23 49.2Q8.68 48.7 9.45 48.7Q10.22 48.7 10.7 49.22Q11.18 49.74 11.18 50.71ZM18.23 55.95Q18.23 54.52 17.8 53.5Q17.36 52.48 16.59 51.93Q15.82 51.39 14.89 51.39Q13.4 51.39 12.37 52.56Q11.35 53.73 11.35 56.01Q11.35 58.16 12.37 59.35Q13.38 60.55 14.89 60.55Q15.78 60.55 16.55 60.03Q17.31 59.51 17.77 58.46Q18.23 57.42 18.23 55.95Z M28.31 58.14V61.14Q28.31 62.24 27.79 62.78Q27.28 63.33 26.49 63.33Q25.71 63.33 25.21 62.78Q24.71 62.22 24.71 61.14V51.12Q24.71 48.7 26.46 48.7Q27.36 48.7 27.75 49.26Q28.15 49.83 28.19 50.94Q28.83 49.83 29.51 49.26Q30.19 48.7 31.33 48.7Q32.46 48.7 33.53 49.26Q34.6 49.83 34.6 50.77Q34.6 51.42 34.14 51.85Q33.69 52.28 33.16 52.28Q32.96 52.28 32.2 52.04Q31.44 51.79 30.86 51.79Q30.07 51.79 29.57 52.21Q29.07 52.62 28.79 53.44Q28.52 54.26 28.41 55.39Q28.31 56.51 28.31 58.14Z M46.61 56.9H39.57Q39.58 58.12 40.06 59.06Q40.54 59.99 41.34 60.47Q42.14 60.94 43.1 60.94Q43.74 60.94 44.28 60.79Q44.81 60.64 45.31 60.32Q45.81 59.99 46.24 59.62Q46.66 59.26 47.33 58.62Q47.61 58.39 48.12 58.39Q48.68 58.39 49.02 58.69Q49.36 58.99 49.36 59.55Q49.36 60.03 48.98 60.69Q48.6 61.34 47.82 61.94Q47.05 62.54 45.89 62.93Q44.72 63.33 43.2 63.33Q39.74 63.33 37.81 61.35Q35.89 59.37 35.89 55.99Q35.89 54.39 36.36 53.03Q36.84 51.66 37.75 50.69Q38.66 49.71 39.99 49.19Q41.32 48.67 42.94 48.67Q45.05 48.67 46.56 49.56Q48.07 50.45 48.82 51.86Q49.57 53.27 49.57 54.73Q49.57 56.09 48.79 56.49Q48.02 56.9 46.61 56.9ZM39.57 54.85H46.09Q45.96 53.01 45.1 52.09Q44.23 51.17 42.82 51.17Q41.48 51.17 40.61 52.1Q39.75 53.03 39.57 54.85Z M55.93 50.71V51.15Q56.94 49.9 58.04 49.31Q59.13 48.72 60.51 48.72Q62.18 48.72 63.57 49.58Q64.97 50.44 65.78 52.08Q66.59 53.73 66.59 55.99Q66.59 57.65 66.12 59.04Q65.66 60.43 64.84 61.37Q64.02 62.31 62.91 62.82Q61.79 63.33 60.51 63.33Q58.97 63.33 57.92 62.71Q56.88 62.09 55.93 60.89V66.3Q55.93 68.67 54.2 68.67Q53.18 68.67 52.85 68.06Q52.52 67.44 52.52 66.27V50.74Q52.52 49.71 52.97 49.2Q53.42 48.7 54.2 48.7Q54.96 48.7 55.45 49.22Q55.93 49.74 55.93 50.71ZM62.98 55.95Q62.98 54.52 62.54 53.5Q62.11 52.48 61.34 51.93Q60.57 51.39 59.63 51.39Q58.14 51.39 57.12 52.56Q56.1 53.73 56.1 56.01Q56.1 58.16 57.11 59.35Q58.13 60.55 59.63 60.55Q60.53 60.55 61.29 60.03Q62.06 59.51 62.52 58.46Q62.98 57.42 62.98 55.95Z  M79.85 50.84V63.05Q79.85 64.36 79.77 65.18Q79.68 66.01 79.52 66.38Q78.63 68.67 75.71 68.67Q74.08 68.67 73.24 68.22Q72.39 67.77 72.39 66.92Q72.39 66.28 72.77 65.88Q73.16 65.48 73.78 65.48Q73.86 65.48 74.03 65.5Q74.21 65.52 74.56 65.54Q74.91 65.57 75.04 65.57Q75.77 65.57 76.01 65Q76.26 64.44 76.26 62.97V50.84Q76.26 49.78 76.76 49.24Q77.26 48.7 78.07 48.7Q78.87 48.7 79.36 49.23Q79.85 49.76 79.85 50.84ZM78.07 47.02Q77.32 47.02 76.79 46.56Q76.26 46.1 76.26 45.25Q76.26 44.49 76.8 44Q77.35 43.5 78.07 43.5Q78.77 43.5 79.31 43.95Q79.85 44.4 79.85 45.25Q79.85 46.09 79.33 46.55Q78.8 47.02 78.07 47.02Z M97.02 56.01Q97.02 57.62 96.52 58.98Q96.02 60.34 95.07 61.31Q94.12 62.29 92.8 62.81Q91.48 63.33 89.83 63.33Q88.2 63.33 86.89 62.8Q85.59 62.27 84.63 61.29Q83.68 60.31 83.18 58.97Q82.69 57.63 82.69 56.01Q82.69 54.38 83.19 53.02Q83.69 51.66 84.63 50.7Q85.56 49.74 86.89 49.22Q88.23 48.7 89.83 48.7Q91.47 48.7 92.8 49.22Q94.13 49.75 95.08 50.73Q96.03 51.7 96.53 53.05Q97.02 54.39 97.02 56.01ZM93.41 56.01Q93.41 53.81 92.44 52.58Q91.47 51.36 89.83 51.36Q88.78 51.36 87.98 51.91Q87.17 52.45 86.74 53.52Q86.3 54.59 86.3 56.01Q86.3 57.42 86.73 58.48Q87.16 59.53 87.96 60.09Q88.75 60.65 89.83 60.65Q91.47 60.65 92.44 59.42Q93.41 58.19 93.41 56.01Z M109.2 61.3V60.84Q108.56 61.66 107.84 62.21Q107.13 62.76 106.29 63.03Q105.44 63.3 104.36 63.3Q103.06 63.3 102.02 62.76Q100.99 62.22 100.42 61.27Q99.75 60.13 99.75 57.98V50.84Q99.75 49.76 100.24 49.23Q100.72 48.7 101.53 48.7Q102.35 48.7 102.85 49.24Q103.35 49.78 103.35 50.84V56.61Q103.35 57.86 103.56 58.71Q103.77 59.56 104.32 60.04Q104.86 60.52 105.8 60.52Q106.71 60.52 107.51 59.98Q108.32 59.44 108.69 58.57Q108.99 57.81 108.99 55.22V50.84Q108.99 49.78 109.49 49.24Q109.99 48.7 110.8 48.7Q111.6 48.7 112.09 49.23Q112.58 49.76 112.58 50.84V61.27Q112.58 62.3 112.11 62.82Q111.64 63.33 110.9 63.33Q110.16 63.33 109.68 62.8Q109.2 62.26 109.2 61.3Z M119.73 58.14V61.14Q119.73 62.24 119.22 62.78Q118.71 63.33 117.92 63.33Q117.14 63.33 116.64 62.78Q116.14 62.22 116.14 61.14V51.12Q116.14 48.7 117.89 48.7Q118.79 48.7 119.18 49.26Q119.58 49.83 119.62 50.94Q120.26 49.83 120.94 49.26Q121.62 48.7 122.75 48.7Q123.89 48.7 124.96 49.26Q126.02 49.83 126.02 50.77Q126.02 51.42 125.57 51.85Q125.11 52.28 124.59 52.28Q124.39 52.28 123.63 52.04Q122.87 51.79 122.29 51.79Q121.5 51.79 121 52.21Q120.5 52.62 120.22 53.44Q119.95 54.26 119.84 55.39Q119.73 56.51 119.73 58.14Z M131.26 50.69V51.12Q132.21 49.87 133.33 49.28Q134.46 48.7 135.92 48.7Q137.35 48.7 138.47 49.32Q139.59 49.94 140.14 51.07Q140.5 51.73 140.6 52.49Q140.71 53.26 140.71 54.44V61.14Q140.71 62.22 140.22 62.78Q139.72 63.33 138.93 63.33Q138.13 63.33 137.62 62.76Q137.12 62.2 137.12 61.14V55.14Q137.12 53.36 136.63 52.42Q136.14 51.48 134.66 51.48Q133.7 51.48 132.91 52.05Q132.11 52.62 131.75 53.63Q131.48 54.43 131.48 56.63V61.14Q131.48 62.24 130.97 62.78Q130.47 63.33 129.66 63.33Q128.88 63.33 128.38 62.76Q127.88 62.2 127.88 61.14V50.74Q127.88 49.71 128.33 49.2Q128.78 48.7 129.56 48.7Q130.03 48.7 130.41 48.92Q130.8 49.14 131.03 49.59Q131.26 50.04 131.26 50.69Z M154.34 56.9H147.3Q147.31 58.12 147.8 59.06Q148.28 59.99 149.07 60.47Q149.87 60.94 150.83 60.94Q151.48 60.94 152.01 60.79Q152.55 60.64 153.05 60.32Q153.55 59.99 153.97 59.62Q154.39 59.26 155.07 58.62Q155.34 58.39 155.86 58.39Q156.41 58.39 156.75 58.69Q157.1 58.99 157.1 59.55Q157.1 60.03 156.71 60.69Q156.33 61.34 155.56 61.94Q154.79 62.54 153.62 62.93Q152.46 63.33 150.94 63.33Q147.47 63.33 145.55 61.35Q143.62 59.37 143.62 55.99Q143.62 54.39 144.1 53.03Q144.57 51.66 145.48 50.69Q146.39 49.71 147.72 49.19Q149.06 48.67 150.68 48.67Q152.79 48.67 154.3 49.56Q155.81 50.45 156.56 51.86Q157.31 53.27 157.31 54.73Q157.31 56.09 156.53 56.49Q155.75 56.9 154.34 56.9ZM147.3 54.85H153.83Q153.7 53.01 152.83 52.09Q151.97 51.17 150.56 51.17Q149.21 51.17 148.35 52.1Q147.49 53.03 147.3 54.85Z M163.66 63.78 163.99 62.97 159.56 51.82Q159.15 50.86 159.15 50.42Q159.15 49.96 159.39 49.57Q159.63 49.17 160.04 48.93Q160.46 48.7 160.91 48.7Q161.69 48.7 162.08 49.19Q162.48 49.68 162.78 50.61L165.82 59.47L168.71 51.23Q169.05 50.23 169.33 49.66Q169.61 49.09 169.92 48.89Q170.23 48.7 170.79 48.7Q171.2 48.7 171.58 48.91Q171.96 49.13 172.16 49.5Q172.36 49.87 172.36 50.28Q172.31 50.53 172.19 50.99Q172.07 51.45 171.9 51.93L167.21 64.21Q166.6 65.83 166.02 66.76Q165.44 67.68 164.49 68.17Q163.53 68.67 161.91 68.67Q160.33 68.67 159.54 68.33Q158.75 67.98 158.75 67.07Q158.75 66.45 159.12 66.12Q159.5 65.78 160.23 65.78Q160.52 65.78 160.8 65.86Q161.14 65.94 161.4 65.94Q162.01 65.94 162.37 65.76Q162.73 65.57 163.01 65.12Q163.29 64.66 163.66 63.78Z" />
                  </defs>
                  <path
                    class="course-journey-route"
                    d="M4 73C39 80 126 75 174 16m-11 1 11-1-3 10"
                  />
                  <g transform="rotate(-3 92 42)">
                    <g
                      class="course-journey-lettering-shadow"
                      transform="translate(1.5 2)"
                    >
                      <use href="#prepJourneyLineOne" />
                      <use href="#prepJourneyLineTwo" />
                    </g>
                    <g class="course-journey-lettering">
                      <use href="#prepJourneyLineOne" />
                      <use href="#prepJourneyLineTwo" />
                    </g>
                  </g>
                </svg>
              </aside>
            </div>
            <nav
              class="course-package-tabs"
              role="tablist"
              aria-label="Course views"
            >
              <button
                v-for="tab in [
                  ['study', 'Course Content'],
                  ['results', 'Performance & Insights'],
                ] as [CourseTab, string][]"
                :key="tab[0]"
                class="course-package-tab"
                type="button"
                role="tab"
                :aria-selected="activeTab === tab[0]"
                @click="selectTab(tab[0])"
              >
                {{ tab[1] }}
              </button>
            </nav>
          </div>
        </header>
        <div class="course-workspace-body">
          <div class="course-package-panel" role="tabpanel" aria-live="polite">
            <section
              v-if="activeTab === 'study'"
              class="study-practice-layout"
              :aria-label="`${examName} lessons and practice tests`"
            >
              <div class="course-study-column">
                <section
                  class="study-breakdown course-content-region"
                  aria-labelledby="lessonsTitle"
                >
                <header
                  class="course-region-heading course-topics-heading"
                  aria-label="Filter lessons"
                >
                  <h2 id="lessonsTitle">Lessons</h2>
                  <div class="course-topic-filters">
                    <label v-if="!isApPackage" class="course-topic-select">
                      <select
                        v-model="sectionFilter"
                        aria-label="Filter lessons by section"
                      >
                        <option v-for="section in courseSectionOptions" :key="section" :value="section">
                          Section: {{ section }}
                        </option>
                      </select>
                      <svg class="icon" aria-hidden="true">
                        <use href="#i-chevron" />
                      </svg>
                    </label>
                    <label class="course-topic-select priority">
                      <select
                        v-model="priorityFilter"
                        aria-label="Filter lessons by priority"
                      >
                        <option value="all">Priority: All</option>
                        <option value="core">Priority: Core</option>
                        <option value="likely">Priority: Likely</option>
                        <option value="possible">Priority: Possible</option>
                      </select>
                      <svg class="icon" aria-hidden="true">
                        <use href="#i-chevron" />
                      </svg>
                    </label>
                  </div>
                </header>
                <div v-if="loadError" class="study-topic-empty">
                  {{ loadError }}
                </div>
                <div v-else-if="!manifest" class="study-topic-empty">
                  Loading {{ examName }} lessons…
                </div>
                <div v-else class="study-topic-sections">
                  <section
                    v-for="section in topicsBySection"
                    :key="section.id"
                    :class="[
                      'study-topic-section',
                      {
                        collapsed:
                          priorityFilter === 'all' &&
                          collapsedSections.has(section.id),
                      },
                    ]"
                    :aria-labelledby="
                      priorityFilter === 'all' ? section.id : undefined
                    "
                    :aria-label="
                      priorityFilter !== 'all'
                        ? `${priorityFilter} topics sorted by priority`
                        : undefined
                    "
                  >
                    <button
                      v-if="priorityFilter === 'all'"
                      class="study-section-head"
                      type="button"
                      :aria-expanded="!collapsedSections.has(section.id)"
                      @click="toggleSection(section.id)"
                    >
                      <h3 :id="section.id">
                        {{ isApPackage ? section.title : `${section.examSection} · ${section.title}` }}
                      </h3>
                      <span class="study-section-meta"
                        ><span>{{ section.topics.length }} Topics</span
                        ><svg class="icon"><use href="#i-chevron" /></svg
                      ></span>
                    </button>
                    <div
                      v-if="
                        priorityFilter !== 'all' ||
                        !collapsedSections.has(section.id)
                      "
                      role="table"
                    >
                      <div class="study-topic-table-head" role="row">
                        <span role="columnheader">Topic</span
                        ><span role="columnheader">Priority</span
                        ><span role="columnheader">Progress</span>
                      </div>
                      <article
                        v-for="topic in section.topics"
                        :key="topic.id"
                        class="study-topic-row lesson-topic-row"
                        role="row"
                        tabindex="0"
                        @mouseenter="positionStudyTopicPopover"
                        @mouseleave="releaseStudyTopicPopover"
                        @focusin="positionStudyTopicPopoverForKeyboard"
                        @focusout="releaseStudyTopicPopover"
                      >
                        <div class="study-topic-copy" role="cell">
                          <strong>{{ topic.title }}</strong>
                        </div>
                        <div class="study-topic-priority-cell" role="cell">
                          <span
                            :class="[
                              'study-topic-importance',
                              topic.priority.toLowerCase(),
                            ]"
                            >{{ topic.importanceScore }}% ·
                            {{ priorityLabel(topic.priority) }}</span
                          >
                        </div>
                        <div class="study-topic-progress" role="cell">
                          <span class="study-topic-progress-meter"
                            ><strong>{{ topicProgress(topic) }}%</strong
                            ><span class="study-topic-progress-track"
                              ><i
                                :class="{
                                  complete: topicProgress(topic) === 100,
                                }"
                                :style="{
                                  width: `${topicProgress(topic)}%`,
                                }" /></span
                          ></span>
                        </div>
                        <aside
                          class="study-topic-popover"
                          :aria-label="`Study tools for ${topic.title}`"
                          @mouseenter="keepStudyTopicPopoverOpen"
                          @mouseleave="releaseStudyTopicPopoverPanel"
                        >
                          <div class="study-topic-popover-head">
                            <h4>{{ topic.title }}</h4>
                            <span>{{ topicProgress(topic) }}% complete</span>
                          </div>
                          <p class="study-topic-probability">
                            {{ topic.importanceScore }}% exam probability
                          </p>
                          <small>Study with</small>
                          <div class="study-topic-actions">
                            <button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'study-guide')"
                            >
                              <span class="study-topic-tool-icon-row">
                                <svg
                                  class="study-topic-tool-icon"
                                  aria-hidden="true"
                                >
                                  <use href="#i-study-guide-spark" />
                                </svg>
                                <svg
                                  class="study-topic-tool-arrow"
                                  aria-hidden="true"
                                >
                                  <use href="#i-play-solid" />
                                </svg>
                              </span>
                              <span class="study-topic-tool-label"
                                >Study Guide</span
                              ></button
                            ><button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'flashcards')"
                            >
                              <span class="study-topic-tool-icon-row">
                                <svg
                                  class="study-topic-tool-icon"
                                  aria-hidden="true"
                                >
                                  <use href="#i-flashcards-solid" />
                                </svg>
                                <svg
                                  class="study-topic-tool-arrow"
                                  aria-hidden="true"
                                >
                                  <use href="#i-play-solid" />
                                </svg>
                              </span>
                              <span class="study-topic-tool-label"
                                >Flashcards</span
                              ></button
                            ><button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'quiz')"
                            >
                              <span class="study-topic-tool-icon-row">
                                <svg
                                  class="study-topic-tool-icon"
                                  aria-hidden="true"
                                >
                                  <use href="#i-quiz-stacked" />
                                </svg>
                                <svg
                                  class="study-topic-tool-arrow"
                                  aria-hidden="true"
                                >
                                  <use href="#i-play-solid" />
                                </svg>
                              </span>
                              <span class="study-topic-tool-label">Quiz</span>
                            </button>
                          </div>
                        </aside>
                      </article>
                    </div>
                  </section>
                </div>
                </section>
              </div>
              <aside class="practice-test-rail" aria-labelledby="testsTitle">
                <header class="course-region-heading course-tests-heading">
                  <h2 id="testsTitle">Tests</h2>
                </header>
                <article
                  :class="[
                    'mock-entry-card',
                    'compact',
                    'diagnostic-entry-card',
                    diagnosticTestState,
                    {
                      'is-clickable': !diagnosticTestCard.disabled,
                      'is-disabled': diagnosticTestCard.disabled,
                    },
                  ]"
                >
                  <div class="mock-entry-content">
                    <div class="mock-entry-icon" aria-hidden="true">
                      <svg class="icon"><use href="#i-target" /></svg>
                    </div>
                    <header class="mock-entry-title-row">
                      <h3>Free {{ examName }} Diagnostic Test</h3>
                      <span
                        :class="[
                          'mock-entry-state',
                          diagnosticTestState,
                          'free-diagnostic',
                        ]"
                        ><i />{{ diagnosticTestCard.stateLabel }}</span
                      >
                    </header>
                    <div class="mock-entry-copy">
                      <p>{{ diagnosticTestCard.description }}</p>
                    </div>
                    <div class="mock-entry-details" aria-label="Test details">
                      <template
                        v-for="(metric, index) in diagnosticTestCard.metrics"
                        :key="`${metric.value}-${metric.label}`"
                      >
                        <span
                          ><strong>{{ metric.value }}</strong
                          ><template v-if="metric.label">
                            {{ metric.label }}</template
                          ></span
                        ><i
                          v-if="index < diagnosticTestCard.metrics.length - 1"
                          aria-hidden="true"
                          >·</i
                        >
                      </template>
                    </div>
                    <div class="mock-entry-state-slot">
                      <div class="mock-entry-status-summary">
                        <div class="mock-entry-status-value">
                          <strong>{{ diagnosticTestCard.statusValue }}</strong
                          ><span v-if="diagnosticTestCard.statusTotal">{{
                            diagnosticTestCard.statusTotal
                          }}</span
                          ><small v-if="diagnosticTestCard.statusUnit">{{
                            diagnosticTestCard.statusUnit
                          }}</small>
                        </div>
                        <p>{{ diagnosticTestCard.statusMeta }}</p>
                      </div>
                    </div>
                  </div>
                  <footer class="mock-entry-footer">
                    <span
                      :class="[
                        'mock-card-link',
                        { disabled: diagnosticTestCard.disabled },
                      ]"
                    >
                      <span>{{ diagnosticTestCard.cta }}</span
                      ><span class="mock-card-link-arrow" aria-hidden="true"
                        >→</span
                      >
                    </span>
                  </footer>
                  <button
                    class="mock-card-click-target"
                    type="button"
                    :aria-label="diagnosticTestCard.cta"
                    :disabled="diagnosticTestCard.disabled"
                    @click="handleDiagnosticTestAction"
                  ></button>
                </article>
                <article
                  :class="[
                    'mock-entry-card',
                    'compact',
                    practiceTestState,
                    {
                      'is-clickable': !practiceTestCard.disabled,
                      'is-disabled': practiceTestCard.disabled,
                    },
                  ]"
                >
                  <div class="mock-entry-content">
                    <div class="mock-entry-icon" aria-hidden="true">
                      <svg class="icon"><use href="#i-exam" /></svg>
                    </div>
                    <header class="mock-entry-title-row">
                      <h3>{{ examName }} Full-Length Practice Test</h3>
                      <img
                        v-if="!isProMember"
                        class="pro-label-badge mock-entry-pro-label"
                        src="/assets/solvely-pro-label.webp"
                        alt="Pro membership required"
                        title="Full-length practice tests and score reports require Pro."
                      />
                      <span
                        v-if="practiceTestCard.stateLabel"
                        :class="['mock-entry-state', practiceTestState]"
                        ><i />{{ practiceTestCard.stateLabel }}</span
                      >
                    </header>
                    <div class="mock-entry-copy">
                      <p>{{ practiceTestCard.description }}</p>
                    </div>
                    <div class="mock-entry-details" aria-label="Test details">
                      <template
                        v-for="(metric, index) in practiceTestCard.metrics"
                        :key="`${metric.value}-${metric.label}`"
                      >
                        <span
                          ><strong>{{ metric.value }}</strong>
                          {{ metric.label }}</span
                        ><i
                          v-if="index < practiceTestCard.metrics.length - 1"
                          aria-hidden="true"
                          >·</i
                        >
                      </template>
                    </div>
                    <div class="mock-entry-state-slot">
                      <div class="mock-entry-status-summary">
                        <div class="mock-entry-status-value">
                          <strong>{{ practiceTestCard.statusValue }}</strong
                          ><span v-if="practiceTestCard.statusTotal">{{
                            practiceTestCard.statusTotal
                          }}</span
                          ><small v-if="practiceTestCard.statusUnit">{{
                            practiceTestCard.statusUnit
                          }}</small>
                        </div>
                        <p>{{ practiceTestCard.statusMeta }}</p>
                      </div>
                    </div>
                  </div>
                  <footer class="mock-entry-footer">
                    <span
                      :class="[
                        'mock-card-link',
                        { disabled: practiceTestCard.disabled },
                      ]"
                    >
                      <span>{{ practiceTestCard.cta }}</span
                      ><span class="mock-card-link-arrow" aria-hidden="true"
                        >→</span
                      >
                    </span>
                  </footer>
                  <button
                    class="mock-card-click-target"
                    type="button"
                    :aria-label="practiceTestCard.cta"
                    :disabled="practiceTestCard.disabled"
                    @click="handlePracticeTestAction"
                  ></button>
                </article>
              </aside>
            </section>

            <div v-else class="results-experience">
              <header class="course-region-heading results-page-heading">
                <h2>Test Results</h2>
                <nav
                  :class="[
                    'results-source-switch',
                    { 'is-practice': resultSource === 'practice' },
                  ]"
                  role="tablist"
                  aria-label="Select test results"
                  @keydown="moveResultSource"
                >
                  <button
                    v-for="source in resultSources"
                    :key="source.id"
                    type="button"
                    role="tab"
                    :data-result-source="source.id"
                    :aria-selected="resultSource === source.id"
                    :tabindex="resultSource === source.id ? 0 : -1"
                    @click="setResultSource(source.id)"
                  >
                    {{ source.label }}
                  </button>
                </nav>
              </header>

              <div class="results-preview-shell">
                <div
                  :class="[
                    'results-preview-content',
                    {
                      'is-locked': resultsLocked,
                      'full-report': resultView === 'full',
                    },
                  ]"
                  :inert="resultsLocked && !showResultsGateAction"
                  :aria-hidden="resultsLocked && !showResultsGateAction"
                >
              <div v-if="resultLoadError" class="results-empty">
                {{ resultLoadError }}
              </div>
              <div v-else-if="!resultReport" class="results-empty">
                Loading score report…
              </div>

              <template v-else>
              <div
                v-if="resultView === 'full' || resultView === 'score'"
                :class="[
                  'score-report-view',
                  { 'results-waterfall-module': resultView === 'full' },
                ]"
              >
                <header class="results-waterfall-heading">
                  <h2>Score Analysis</h2>
                </header>
                <div
                  :class="[
                    'results-score-overview-group',
                    { 'results-locked-subsection': resultsLocked },
                  ]"
                >
                <section v-if="isApPackage" class="ap-score-report-card" aria-label="AP Calculus BC score summary">
                  <header class="ap-score-report-cover">
                    <img src="/assets/report/ap/calculus-bc-header.png" alt="" />
                    <span>AP® Calculus BC</span>
                  </header>
                  <div class="ap-score-report-main">
                    <em>{{ formatOrdinal(resultReport.percentile) }} percentile</em>
                    <div class="ap-score-orbit">
                      <span>Your score</span>
                      <strong>{{ resultReport.totalScore }}</strong>
                      <img src="/assets/report/ap/score-illustration.png" alt="" />
                    </div>
                  </div>
                </section>
                <section v-else class="score-report-card">
                  <header class="score-report-cover">
                    <span>{{ examName }} Prep 2026</span
                    ><small>{{
                      resultSource === "diagnostic"
                        ? "Diagnostic result"
                        : "Score report"
                    }}</small>
                  </header>
                  <div
                    :class="[
                      'score-report-main',
                      { 'act-report-main': isActPackage },
                    ]"
                  >
                    <div class="score-report-total">
                      <span>{{
                        isActPackage
                          ? resultSource === "diagnostic"
                            ? "Predicted composite score"
                            : "Composite score"
                          : resultSource === "diagnostic"
                            ? "Predicted total score"
                            : "Total score"
                      }}</span>
                      <strong
                        >{{ resultReport.totalScore }}<small
                          >/{{ resultReport.maximumScore }}</small
                        ></strong
                      >
                      <div
                        v-if="resultSource === 'diagnostic'"
                        class="score-report-meta"
                      >
                        <span
                          >Accuracy <b>{{ resultReport.accuracy }}%</b></span
                        ><span>Time limit <b>Untimed</b></span
                        ><em>Free report</em>
                      </div>
                      <div v-else class="score-report-meta">
                        <span
                          >Score range
                          <b
                            >{{ resultReport.scoreRange[0] }}–{{
                              resultReport.scoreRange[1]
                            }}</b
                          ></span
                        ><span
                          >Average score
                          <b>{{ resultReport.averageScore }}</b></span
                        ><em>{{ formatOrdinal(resultReport.percentile) }} percentile</em>
                      </div>
                    </div>
                    <div
                      v-if="isActPackage"
                      class="act-score-pathways"
                      aria-label="ACT section and combined scores"
                    >
                      <section
                        v-for="pathway in actScorePathways"
                        :key="pathway.id"
                        :class="[
                          'act-score-pathway',
                          'is-' + pathway.id,
                        ]"
                      >
                        <div class="act-pathway-section-list">
                          <article
                            v-for="section in pathway.sections"
                            :key="section.sectionId"
                            class="act-pathway-section"
                          >
                            <div>
                              <span>{{ section.sectionTitle }}</span>
                              <p v-if="resultSource === 'diagnostic'">
                                {{ section.accuracy }}% accuracy ·
                                {{
                                  section.correct +
                                  section.incorrect +
                                  section.omitted
                                }}
                                questions
                              </p>
                              <p v-else>
                                Score range {{ section.scoreRange[0] }}–{{
                                  section.scoreRange[1]
                                }}
                                · {{ formatOrdinal(section.percentile) }} percentile
                              </p>
                            </div>
                            <strong
                              >{{ section.score }}<small
                                >/{{ section.maximumScore }}</small
                              ></strong
                            >
                          </article>
                          <article
                            v-for="missingSection in pathway.missingSections"
                            :key="missingSection.id"
                            class="act-pathway-section is-missing"
                          >
                            <div>
                              <span
                                >{{ missingSection.label }}
                                <em v-if="missingSection.optional"
                                  >Optional</em
                                ></span
                              >
                              <p>Not included in this test</p>
                            </div>
                            <strong aria-label="Not available">—</strong>
                          </article>
                        </div>
                        <footer
                          :class="[
                            'act-pathway-summary',
                            { muted: pathway.summary.muted },
                          ]"
                        >
                          <div>
                            <span>{{ pathway.summary.label }}</span>
                            <small>{{ pathway.summary.note }}</small>
                          </div>
                          <b v-if="pathway.summary.value !== null"
                            >{{ pathway.summary.value }}<small
                              >/{{ pathway.summary.maximumScore }}</small
                            ></b
                          >
                          <b v-else aria-label="Not available">—</b>
                          <button
                            type="button"
                            class="act-score-info"
                            :aria-label="'How ' + pathway.summary.label + ' is calculated'"
                          >
                            <span aria-hidden="true">i</span>
                            <span role="tooltip">{{ pathway.summary.tooltip }}</span>
                          </button>
                        </footer>
                      </section>
                    </div>
                    <div v-else class="score-report-sections">
                      <article
                        v-for="section in resultReport.sections"
                        :key="section.sectionId"
                      >
                        <span>{{ section.sectionTitle }}</span
                        ><strong
                          >{{ section.score }}<small
                            >/{{ section.maximumScore }}</small
                          ></strong
                        >
                        <p v-if="resultSource === 'diagnostic'">
                          Predicted from
                          {{
                            section.correct +
                            section.incorrect +
                            section.omitted
                          }}
                          diagnostic questions<br />{{ section.accuracy }}%
                          accuracy
                        </p>
                        <p v-else>
                          Score range {{ section.scoreRange[0] }}–{{
                            section.scoreRange[1]
                          }}<br />Average {{ section.averageScore }}
                        </p>
                        <em>{{
                          resultSource === "diagnostic"
                            ? "Starting point"
                            : formatOrdinal(section.percentile) + " percentile"
                        }}</em>
                      </article>
                    </div>
                  </div>
                </section>

                <section :class="['report-ai-overview', { 'ap-report-overview': isApPackage }]">
                  <img
                    v-if="isApPackage"
                    class="ap-overview-decoration"
                    src="/assets/report/ap/overview-decoration.svg"
                    alt=""
                  />
                  <img
                    v-if="isApPackage"
                    class="ap-overview-sparkles"
                    src="/assets/report/ap/sparkles.svg"
                    alt=""
                  />
                  <span v-else class="report-ai-icon"
                    ><svg class="icon"><use href="#i-spark" /></svg
                  ></span>
                  <div>
                    <span>{{
                      isApPackage
                        ? "AP Overview"
                        : resultSource === "diagnostic"
                        ? "Diagnostic Overview"
                        : `${examName} Overview`
                    }}</span>
                    <p>{{ resultReport.overview }}</p>
                  </div>
                </section>
                <p
                  v-if="resultSource === 'diagnostic'"
                  class="diagnostic-score-disclaimer"
                >
                  This predicted score is an estimate based on 20 untimed
                  questions. It does not replace a full-length {{ examName }} Practice
                  Test.
                </p>
                  <div
                    v-if="resultsLocked"
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-gate-action': showResultsGateAction,
                        'is-prerequisite': resultsNeedAssessment,
                      },
                    ]"
                  >
                    <img
                      v-if="showResultsUnlockAction"
                      class="pro-label-badge results-subsection-pro-label"
                      src="/assets/solvely-pro-label.webp"
                      alt="Solvely Pro"
                    />
                    <span v-else aria-hidden="true"
                      ><svg class="icon">
                        <use
                          :href="resultsNeedAssessment ? '#i-exam' : '#i-lock'"
                        /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <button
                      v-if="showResultsStartAction"
                      type="button"
                      @click="handleResultsPrerequisiteAction"
                    >
                      {{ resultsPrerequisiteActionLabel }}
                    </button>
                    <button
                      v-else-if="showResultsUnlockAction"
                      type="button"
                      @click="openCommercialPaywall(resultsCommercialBenefit)"
                    >
                      {{ resultsCommercialActionLabel }}
                    </button>
                  </div>
                </div>

                <section
                  v-if="!isApPackage"
                  :class="[
                    'knowledge-report',
                    { 'results-locked-subsection': resultsLocked },
                  ]"
                  aria-labelledby="knowledgeReportTitle"
                >
                  <header class="report-section-heading">
                    <div>
                      <h3 id="knowledgeReportTitle">Knowledge and Skills</h3>
                      <p>
                        Performance across the
                        {{ resultReport.domains.length }} content domains measured
                        in this
                        {{
                          resultSource === "diagnostic"
                            ? "diagnostic"
                            : examName
                        }}.
                      </p>
                    </div>
                  </header>
                  <div class="knowledge-section-grid">
                    <article
                      v-for="section in resultReport.sections"
                      :key="`domain-${section.sectionId}`"
                      class="knowledge-section-card"
                    >
                      <h4>{{ section.sectionTitle }}</h4>
                      <div
                        v-for="domain in resultReport.domains.filter(
                          (item) => item.sectionId === section.sectionId,
                        )"
                        :key="domain.contentDomain"
                        class="knowledge-domain-row"
                      >
                        <div>
                          <strong>{{ domain.contentDomain }}</strong
                          ><span
                            >{{ domain.total }} questions ·
                            {{ domain.accuracy }}% accuracy</span
                          >
                        </div>
                        <span
                          class="mastery-segments"
                          :aria-label="`${domain.masteryLevel} of 5 mastery`"
                          ><i
                            v-for="level in 5"
                            :key="level"
                            :class="{ active: level <= domain.masteryLevel }"
                        /></span>
                      </div>
                    </article>
                  </div>
                  <div
                    v-if="resultsLocked"
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-gate-action': showResultsGateAction,
                        'is-prerequisite': resultsNeedAssessment,
                      },
                    ]"
                  >
                    <img
                      v-if="showResultsUnlockAction"
                      class="pro-label-badge results-subsection-pro-label"
                      src="/assets/solvely-pro-label.webp"
                      alt="Solvely Pro"
                    />
                    <span v-else aria-hidden="true"
                      ><svg class="icon">
                        <use
                          :href="resultsNeedAssessment ? '#i-exam' : '#i-lock'"
                        /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <button
                      v-if="showResultsStartAction"
                      type="button"
                      @click="handleResultsPrerequisiteAction"
                    >
                      {{ resultsPrerequisiteActionLabel }}
                    </button>
                    <button
                      v-else-if="showResultsUnlockAction"
                      type="button"
                      @click="openCommercialPaywall(resultsCommercialBenefit)"
                    >
                      {{ resultsCommercialActionLabel }}
                    </button>
                  </div>
                </section>

                <section
                  :class="[
                    'report-performance-details',
                    { 'results-locked-subsection': resultsLocked },
                  ]"
                >
                  <header class="report-section-heading">
                    <div>
                      <h3>Performance details</h3>
                      <p>
                        See which {{ examName }} skills are both accurate and efficient,
                        and identify where extra review can help.
                      </p>
                    </div>
                  </header>
                  <div class="report-stat-strip">
                    <div>
                      <span>Correct</span
                      ><strong
                        >{{ resultReport.correct
                        }}<small>/{{ reportQuestions.length }}</small></strong
                      >
                    </div>
                    <div>
                      <span>Incorrect</span
                      ><strong>{{ resultReport.incorrect }}</strong>
                    </div>
                    <div>
                      <span>Unanswered</span
                      ><strong>{{ resultReport.omitted }}</strong>
                    </div>
                    <div>
                      <span>Accuracy</span
                      ><strong>{{ resultReport.accuracy }}%</strong>
                    </div>
                    <div>
                      <span>Time used</span
                      ><strong>{{
                        formatReportDuration(resultReport.durationSeconds)
                      }}</strong>
                    </div>
                  </div>
                  <article
                    class="report-confidence-model"
                    aria-labelledby="reportConfidenceTitle"
                  >
                    <header class="report-confidence-head">
                      <div>
                        <h4 id="reportConfidenceTitle">
                          Topic performance matrix
                        </h4>
                        <p>
                          Each dot represents a tested topic. Its position shows
                          how its accuracy and average response time compare
                          with the section averages. Hover over or focus a dot
                          to view details.
                        </p>
                      </div>
                      <div class="report-confidence-axes" aria-hidden="true">
                        <span>↑ Accuracy</span><span>Time →</span>
                      </div>
                    </header>
                    <div class="report-confidence-grid">
                      <section
                        v-for="section in resultReport.sections"
                        :key="`confidence-${section.sectionId}`"
                        class="report-confidence-column"
                      >
                        <header>
                          <h5>{{ section.sectionTitle }}</h5>
                          <span
                            >{{
                              confidenceTopics.filter(
                                (topic) =>
                                  topic.sectionId === section.sectionId,
                              ).length
                            }}
                            topics</span
                          >
                        </header>
                        <div
                          class="report-confidence-chart"
                          role="group"
                          :aria-label="`${section.sectionTitle} topic confidence quadrant by accuracy and average response time`"
                        >
                          <span class="report-quad-label proficient"
                            >Proficient</span
                          ><span class="report-quad-label inefficient"
                            >Inefficient</span
                          ><span class="report-quad-label careless">Rushed</span
                          ><span class="report-quad-label struggling"
                            >Struggling</span
                          >
                          <button
                            v-for="topic in confidenceTopics.filter(
                              (item) => item.sectionId === section.sectionId,
                            )"
                            :key="topic.pointId"
                            type="button"
                            :class="[
                              'report-confidence-dot',
                              topic.quadrant,
                              {
                                'edge-right': topic.edgeRight,
                                'edge-bottom': topic.edgeBottom,
                              },
                            ]"
                            :style="{
                              left: `${topic.left}%`,
                              top: `${topic.top}%`,
                            }"
                            :aria-label="`${topic.label}: ${topic.accuracy}% accuracy, ${topic.correct} of ${topic.attempts} answered questions correct, ${topic.averageSeconds ? formatReportTime(topic.averageSeconds) : 'no recorded time'} average time`"
                            :aria-describedby="`confidence-tooltip-${topic.pointId}`"
                          >
                            <span
                              :id="`confidence-tooltip-${topic.pointId}`"
                              class="report-confidence-tooltip"
                              role="tooltip"
                              ><strong>{{ topic.label }}</strong
                              ><em>{{ topic.domain }}</em
                              ><span
                                ><small>Accuracy</small
                                ><b>{{ topic.accuracy }}%</b></span
                              ><span
                                ><small>Average time</small
                                ><b>{{
                                  topic.averageSeconds
                                    ? formatReportTime(topic.averageSeconds)
                                    : "—"
                                }}</b></span
                              ><span
                                ><small>Correct</small
                                ><b
                                  >{{ topic.correct }}/{{ topic.attempts }}</b
                                ></span
                              ><span
                                ><small>Answered</small
                                ><b
                                  >{{ topic.attempts }}/{{ topic.total }}</b
                                ></span
                              ></span
                            >
                          </button>
                        </div>
                      </section>
                    </div>
                  </article>
                  <div
                    v-if="resultsLocked"
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-gate-action': showResultsGateAction,
                        'is-prerequisite': resultsNeedAssessment,
                      },
                    ]"
                  >
                    <img
                      v-if="showResultsUnlockAction"
                      class="pro-label-badge results-subsection-pro-label"
                      src="/assets/solvely-pro-label.webp"
                      alt="Solvely Pro"
                    />
                    <span v-else aria-hidden="true"
                      ><svg class="icon">
                        <use
                          :href="resultsNeedAssessment ? '#i-exam' : '#i-lock'"
                        /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <button
                      v-if="showResultsStartAction"
                      type="button"
                      @click="handleResultsPrerequisiteAction"
                    >
                      {{ resultsPrerequisiteActionLabel }}
                    </button>
                    <button
                      v-else-if="showResultsUnlockAction"
                      type="button"
                      @click="openCommercialPaywall(resultsCommercialBenefit)"
                    >
                      {{ resultsCommercialActionLabel }}
                    </button>
                  </div>
                </section>

                <footer v-if="resultView !== 'full'" class="report-footer">
                  <p>
                    Practice scores are estimates and are not official {{ examName }} scores.
                  </p>
                  <div v-if="!resultsLocked">
                    <button
                      class="report-retake-button"
                      type="button"
                      @click="requestRetake"
                    >
                      {{ retakeActionLabel }}</button
                    ><button
                      class="report-practice-button"
                      type="button"
                      @click="setResultView('improve')"
                    >
                      Practice Weak Topics
                    </button>
                  </div>
                </footer>
              </div>

              <div
                v-if="resultView === 'full' || resultView === 'review'"
                :class="[
                  'question-review-view',
                  { 'results-waterfall-module': resultView === 'full' },
                ]"
              >
                <header
                  class="results-waterfall-heading results-filter-heading"
                  aria-label="Filter reviewed questions"
                >
                  <h2>Question Review</h2>
                  <div class="course-topic-filters">
                      <label v-if="!isApPackage" class="course-topic-select">
                        <select
                          :value="reviewSectionFilter"
                          aria-label="Filter reviewed questions by section"
                          @change="setReviewSectionFilterFromEvent"
                        >
                          <option value="ALL">Section: All</option>
                          <option v-for="section in reportSectionOptions" :key="section.sectionId" :value="section.sectionId">
                            Section: {{ section.sectionTitle }}
                          </option>
                        </select>
                        <svg class="icon" aria-hidden="true">
                          <use href="#i-chevron" />
                        </svg>
                      </label>
                      <label class="course-topic-select priority">
                        <select
                          :value="reviewFilter"
                          aria-label="Filter reviewed questions by answer status"
                          @change="setReviewFilterFromEvent"
                        >
                          <option
                          v-for="filter in [
                            'ALL',
                            'INCORRECT',
                            'OMITTED',
                            'CORRECT',
                          ] as ReviewFilter[]"
                          :key="filter"
                          :value="filter"
                        >
                          {{ filter === "ALL" ? "Answer: All" : `Answer: ${reviewStatusLabel(filter)}` }}
                          ({{
                            filter === "ALL"
                              ? sectionReviewQuestions.length
                              : sectionReviewQuestions.filter(
                                  (question) => question.status === filter,
                                ).length
                          }})
                          </option>
                        </select>
                        <svg class="icon" aria-hidden="true">
                          <use href="#i-chevron" />
                        </svg>
                      </label>
                  </div>
                </header>

                <div
                  v-if="selectedReviewQuestion"
                  :class="[
                    'question-review-workspace',
                    { 'results-locked-subsection': resultsLocked },
                  ]"
                >
                  <aside
                    class="review-question-navigator"
                    aria-label="Question navigator"
                  >
                    <header>
                      <div>
                        <span>Question map</span
                        ><strong
                          >{{ filteredReviewQuestions.length }} shown</strong
                        >
                      </div>
                      <small>Choose a question to review</small>
                    </header>
                    <div class="review-question-groups">
                      <section
                        v-for="group in reviewQuestionGroups"
                        :key="group.key"
                        class="review-question-group"
                      >
                        <header>
                          <div>
                            <strong>{{ group.sectionTitle }}</strong
                            ><span>{{ group.module }}</span>
                          </div>
                        </header>
                        <div class="review-question-number-grid">
                          <button
                            v-for="question in group.questions"
                            :key="question.questionId"
                            type="button"
                            :class="[
                              question.status.toLowerCase(),
                              {
                                active:
                                  selectedReviewQuestion.questionId ===
                                  question.questionId,
                              },
                            ]"
                            :aria-label="`Question ${question.index + 1}, ${reviewStatusLabel(question.status)}`"
                            :aria-current="
                              selectedReviewQuestion.questionId ===
                              question.questionId
                                ? 'true'
                                : undefined
                            "
                            @click="
                              selectedReviewQuestionId = question.questionId
                            "
                          >
                            {{ question.index + 1 }}
                          </button>
                        </div>
                      </section>
                    </div>
                    <footer>
                      <span><i class="incorrect" />Incorrect</span
                      ><span><i class="omitted" />Unanswered</span
                      ><span><i class="correct" />Correct</span>
                    </footer>
                  </aside>

                  <article class="review-question-detail">
                    <header class="review-question-header">
                      <div class="review-question-identity">
                        <strong
                          >Question
                          {{ selectedReviewQuestion.index + 1 }}</strong
                        ><span
                          >Time spent ·
                          {{
                            selectedReviewQuestion.timeSpentSeconds
                              ? formatReportTime(
                                  selectedReviewQuestion.timeSpentSeconds,
                                )
                              : "—"
                          }}</span
                        >
                      </div>
                      <div class="review-question-tags">
                        <span>{{ selectedReviewQuestion.sectionTitle }}</span
                        ><span>{{ selectedReviewQuestion.module }}</span
                        ><span>{{ selectedReviewQuestion.difficulty }}</span
                        ><em
                          :class="selectedReviewQuestion.status.toLowerCase()"
                          >{{
                            reviewStatusLabel(selectedReviewQuestion.status)
                          }}</em
                        >
                      </div>
                    </header>
                    <h3>{{ selectedReviewQuestion.stem }}</h3>
                    <div
                      v-if="
                        selectedReviewQuestion.responseType ===
                        'MULTIPLE_CHOICE'
                      "
                      class="review-option-list"
                    >
                      <div
                        v-for="[answer, copy] in optionEntries(
                          selectedReviewQuestion,
                        )"
                        :key="answer"
                        :class="[
                          'review-option',
                          optionState(selectedReviewQuestion, answer),
                        ]"
                      >
                        <i>{{ answer }}</i
                        ><span>{{ copy }}</span
                        ><b
                          v-if="answer === selectedReviewQuestion.correctAnswer"
                          >Correct answer</b
                        ><b
                          v-else-if="
                            answer === selectedReviewQuestion.userAnswer
                          "
                          >Your answer</b
                        >
                      </div>
                    </div>
                    <div v-else class="review-produced-response">
                      <div>
                        <span>Your answer</span
                        ><strong
                          :class="selectedReviewQuestion.status.toLowerCase()"
                          >{{
                            selectedReviewQuestion.userAnswer ?? "No answer"
                          }}</strong
                        >
                      </div>
                      <div>
                        <span>Correct answer</span
                        ><strong class="correct">{{
                          selectedReviewQuestion.correctAnswer
                        }}</strong>
                      </div>
                    </div>
                    <section
                      :class="[
                        'review-feedback-panel',
                        selectedReviewQuestion.status.toLowerCase(),
                      ]"
                    >
                      <header>
                        <span>{{
                          selectedReviewQuestion.status === "CORRECT"
                            ? "✓"
                            : selectedReviewQuestion.status === "INCORRECT"
                              ? "×"
                              : "–"
                        }}</span
                        ><strong>{{
                          selectedReviewQuestion.status === "CORRECT"
                            ? "You got it right"
                            : selectedReviewQuestion.status === "INCORRECT"
                              ? "Review this answer"
                              : "You left this unanswered"
                        }}</strong
                        ><em
                          >{{ selectedReviewQuestion.earnedRawPoints }}/{{
                            selectedReviewQuestion.maximumRawPoints
                          }}
                          point</em
                        >
                      </header>
                      <p>
                        <b>Explanation</b
                        >{{ selectedReviewQuestion.explanation }}
                      </p>
                    </section>
                    <section class="review-skill-panel">
                      <div>
                        <span>Similar questions</span
                        ><strong>{{
                          reviewTopicTitle(selectedReviewQuestion)
                        }}</strong>
                        <p>3 questions</p>
                      </div>
                      <button
                        type="button"
                        @click="practiceReviewQuestion(selectedReviewQuestion)"
                      >
                        Start mini quiz
                      </button>
                    </section>
                    <footer class="review-detail-pagination">
                      <button
                        type="button"
                        :disabled="selectedReviewQuestionPosition <= 0"
                        @click="moveReviewQuestion(-1)"
                      >
                        ← Previous</button
                      ><span
                        >{{ selectedReviewQuestionPosition + 1 }} of
                        {{ filteredReviewQuestions.length }} in this view</span
                      ><button
                        type="button"
                        :disabled="
                          selectedReviewQuestionPosition >=
                          filteredReviewQuestions.length - 1
                        "
                        @click="moveReviewQuestion(1)"
                      >
                        Next →
                      </button>
                    </footer>
                  </article>
                  <div
                    v-if="resultsLocked"
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-gate-action': showResultsGateAction,
                        'is-prerequisite': resultsNeedAssessment,
                      },
                    ]"
                  >
                    <img
                      v-if="showResultsUnlockAction"
                      class="pro-label-badge results-subsection-pro-label"
                      src="/assets/solvely-pro-label.webp"
                      alt="Solvely Pro"
                    />
                    <span v-else aria-hidden="true"
                      ><svg class="icon">
                        <use
                          :href="resultsNeedAssessment ? '#i-exam' : '#i-lock'"
                        /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <button
                      v-if="showResultsStartAction"
                      type="button"
                      @click="handleResultsPrerequisiteAction"
                    >
                      {{ resultsPrerequisiteActionLabel }}
                    </button>
                    <button
                      v-else-if="showResultsUnlockAction"
                      type="button"
                      @click="openCommercialPaywall(resultsCommercialBenefit)"
                    >
                      {{ resultsCommercialActionLabel }}
                    </button>
                  </div>
                </div>
                <div v-else class="results-empty">
                  No questions match these filters.
                </div>
                <footer v-if="resultView !== 'full'" class="report-footer">
                  <p>
                    Practice results are estimates and are not official {{ examName }} scores.
                  </p>
                  <div v-if="!resultsLocked">
                    <button
                      class="report-retake-button"
                      type="button"
                      @click="requestRetake"
                    >
                      {{ retakeActionLabel }}</button
                    ><button
                      class="report-practice-button"
                      type="button"
                      @click="setResultView('improve')"
                    >
                      Practice Weak Topics
                    </button>
                  </div>
                </footer>
              </div>

              <section
                v-if="resultView === 'full' || resultView === 'improve'"
                :class="[
                  'topics-improve-view',
                  'study-breakdown',
                  { 'results-waterfall-module': resultView === 'full' },
                ]"
                aria-label="Topics to improve"
              >
                <header
                  class="results-waterfall-heading results-filter-heading"
                  aria-label="Filter improvement topics"
                >
                  <h2>Targeted Practice</h2>
                  <div class="course-topic-filters">
                      <label v-if="!isApPackage" class="course-topic-select">
                        <select
                          v-model="improveSection"
                          aria-label="Filter improvement topics by section"
                        >
                          <option v-for="section in reportSectionOptions" :key="section.sectionId" :value="section.sectionId">
                            Section: {{ section.sectionTitle }}
                          </option>
                        </select>
                        <svg class="icon" aria-hidden="true">
                          <use href="#i-chevron" />
                        </svg>
                      </label>
                      <label class="course-topic-select priority">
                        <select
                          v-model="improvePriority"
                          aria-label="Filter improvement topics by priority"
                        >
                          <option
                          v-for="filter in [
                            'ALL',
                            'CORE',
                            'LIKELY',
                            'POSSIBLE',
                          ] as const"
                          :key="filter"
                          :value="filter"
                        >
                          Priority: {{ filter.charAt(0) + filter.slice(1).toLowerCase() }}
                          </option>
                        </select>
                        <svg class="icon" aria-hidden="true">
                          <use href="#i-chevron" />
                        </svg>
                      </label>
                  </div>
                </header>
                <div
                  v-if="showImproveImportanceNote"
                  class="study-priority-note"
                >
                  <svg class="icon" aria-hidden="true">
                    <use href="#i-target" /></svg
                  ><span
                    >Topics are prioritized using your latest test results and
                    {{ examName }} priority. Practice progress is tracked
                    separately from Lessons.</span
                  ><button
                    class="study-priority-note-close"
                    type="button"
                    aria-label="Dismiss topic-priority explanation"
                    title="Dismiss"
                    @click="dismissImportanceNote('improve')"
                  >
                    <svg class="icon" aria-hidden="true">
                      <use href="#i-close" />
                    </svg>
                  </button>
                </div>
                <div
                  v-if="!improveTopicSections.length"
                  class="study-topic-empty"
                >
                  No topics match this priority filter.
                </div>
                <div
                  v-else
                  :class="[
                    'study-topic-sections',
                    {
                      'results-locked-subsection diagnostic-improve-lock':
                        targetedPracticeLocked &&
                        resultSource === 'diagnostic',
                    },
                  ]"
                >
                  <div
                    v-for="cluster in improveTopicSectionClusters"
                    :key="cluster.id"
                    :class="[
                      'improve-section-cluster',
                      {
                        'results-locked-subsection':
                          targetedPracticeLocked &&
                          resultSource !== 'diagnostic',
                        'is-short-lock':
                          targetedPracticeLocked &&
                          resultSource !== 'diagnostic' &&
                          cluster.topicCount < 3,
                      },
                    ]"
                  >
                    <section
                      v-for="section in cluster.sections"
                      :key="section.id"
                      class="study-topic-section"
                      :aria-labelledby="
                        improvePriority === 'ALL' ? section.id : undefined
                      "
                      :aria-label="
                        improvePriority !== 'ALL'
                          ? `${improvePriority} topics sorted by priority`
                          : undefined
                      "
                    >
                      <header
                        v-if="improvePriority === 'ALL'"
                        class="study-section-head static"
                      >
                        <h3 :id="section.id">
                          {{ isApPackage ? section.title : `${section.examSection} · ${section.title}` }}
                        </h3>
                        <span class="study-section-meta"
                          ><span
                            >{{ section.topics.length }}
                            {{
                              section.topics.length === 1 ? "Topic" : "Topics"
                            }}</span
                          ></span
                        >
                      </header>
                      <div role="table">
                        <article
                          v-for="topic in section.topics"
                          :key="topic.id"
                          class="study-topic-row improve-topic-row"
                          role="row"
                        >
                          <div class="study-topic-copy" role="cell">
                            <strong>{{ topic.title }}</strong
                            ><span>{{ topic.description }}</span>
                            <div class="study-topic-meta">
                              <span
                                :class="[
                                  'study-topic-importance',
                                  topic.priority.toLowerCase(),
                                ]"
                                >{{ topic.importanceScore }}% ·
                                {{ priorityLabel(topic.priority) }}</span
                              ><span
                                >{{ topic.missed }} missed ·
                                {{ topic.accuracy }}% accuracy</span
                              ><span>{{ topic.contentDomain }}</span>
                            </div>
                          </div>
                          <div class="improve-topic-action" role="cell">
                            <button
                              type="button"
                              :class="improvePracticeState(topic)"
                              @click="openImprovePractice(topic)"
                            >
                              {{ improvePracticeLabel(topic) }}
                            </button>
                          </div>
                        </article>
                      </div>
                    </section>
                    <div
                      v-if="
                        targetedPracticeLocked &&
                        resultSource !== 'diagnostic'
                      "
                      :class="[
                        'results-subsection-lock',
                        {
                          'has-gate-action': showTargetedPracticeGateAction,
                          'is-prerequisite':
                            targetedPracticeNeedsAssessment,
                        },
                      ]"
                    >
                      <img
                        v-if="showTargetedPracticeUnlockAction"
                        class="pro-label-badge results-subsection-pro-label"
                        src="/assets/solvely-pro-label.webp"
                        alt="Solvely Pro"
                      />
                      <span v-else aria-hidden="true"
                        ><svg class="icon">
                          <use
                            :href="
                              targetedPracticeNeedsAssessment
                                ? '#i-exam'
                                : '#i-lock'
                            "
                          /></svg
                      ></span>
                      <strong>{{ targetedPracticeLockTitle }}</strong>
                      <button
                        v-if="showTargetedPracticeStartAction"
                        type="button"
                        @click="handleResultsPrerequisiteAction"
                      >
                        {{ resultsPrerequisiteActionLabel }}
                      </button>
                      <button
                        v-else-if="showTargetedPracticeUnlockAction"
                        type="button"
                        @click="
                          openCommercialPaywall(targetedPracticeCommercialBenefit)
                        "
                      >
                        {{ targetedPracticeCommercialActionLabel }}
                      </button>
                    </div>
                  </div>
                  <div
                    v-if="
                      targetedPracticeLocked && resultSource === 'diagnostic'
                    "
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-gate-action': showTargetedPracticeGateAction,
                        'is-prerequisite': targetedPracticeNeedsAssessment,
                      },
                    ]"
                  >
                    <img
                      v-if="showTargetedPracticeUnlockAction"
                      class="pro-label-badge results-subsection-pro-label"
                      src="/assets/solvely-pro-label.webp"
                      alt="Solvely Pro"
                    />
                    <span v-else aria-hidden="true"
                      ><svg class="icon">
                        <use
                          :href="
                            targetedPracticeNeedsAssessment
                              ? '#i-exam'
                              : '#i-lock'
                          "
                        /></svg
                    ></span>
                    <strong>{{ targetedPracticeLockTitle }}</strong>
                    <button
                      v-if="showTargetedPracticeStartAction"
                      type="button"
                      @click="handleResultsPrerequisiteAction"
                    >
                      {{ resultsPrerequisiteActionLabel }}
                    </button>
                    <button
                      v-else-if="showTargetedPracticeUnlockAction"
                      type="button"
                      @click="
                        openCommercialPaywall(targetedPracticeCommercialBenefit)
                      "
                    >
                      {{ targetedPracticeCommercialActionLabel }}
                    </button>
                  </div>
                </div>
              </section>
              <footer
                v-if="resultView === 'full' || resultView === 'improve'"
                class="report-footer full-report-footer"
              >
                <p v-if="isApPackage">
                  AP® is a registered trademark of the College Board, which is
                  not affiliated with or endorsed by this product. Practice
                  scores are estimates, not official College Board scores.
                </p>
                <p v-else-if="isActPackage">
                  ACT® is a registered trademark of ACT, Inc., which is not
                  affiliated with or endorsed by this product. Practice scores
                  are estimates, not official ACT scores.
                </p>
                <p v-else>
                  SAT® is a registered trademark of the College Board, which
                  is not affiliated with or endorsed by this product. Practice
                  scores are estimates, not official College Board scores.
                </p>
                <div v-if="!resultsLocked">
                  <button
                    class="report-retake-button"
                    type="button"
                    @click="requestRetake"
                  >
                    {{ retakeActionLabel }}
                  </button>
                </div>
              </footer>
              </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <CommercialDemoController
      v-if="!isCourseOpen"
      :model-value="accessState"
      :home-state="controllerHomeState"
      movable
      @update:model-value="setProAccess"
      @update:home-state="setHomeExperiencePreview"
    />
    <aside
      v-else-if="isCourseOpen"
      ref="demoController"
      :class="[
        'mock-demo-controller unified-demo-controller',
        { 'is-dragging': demoControllerDragging },
      ]"
      :style="demoControllerStyle"
      aria-label="备考包演示状态控制器"
    >
      <header
        class="mock-demo-controller-head"
        role="button"
        tabindex="0"
        aria-label="拖动演示控制器，可使用方向键移动"
        title="拖动调整位置"
        @pointerdown="startDemoControllerDrag"
        @keydown="moveDemoControllerWithKeyboard"
      >
        <strong>演示控制器</strong>
        <span
          ><i class="demo-controller-drag-grip" aria-hidden="true"></i
          >仅供演示</span
        >
      </header>
      <section class="mock-demo-controller-group">
        <span class="mock-demo-controller-label">会员状态</span>
        <nav class="mock-state-nav" aria-label="预览会员状态">
          <button
            v-for="state in commercialAccessStates"
            :key="state.id"
            :class="[
              'mock-state-button',
              { active: accessState === state.id },
            ]"
            type="button"
            :aria-pressed="accessState === state.id"
            @click="setProAccess(state.id)"
          >
            {{ state.label }}
          </button>
        </nav>
      </section>
      <template v-if="activeTab === 'study'">
        <section class="mock-demo-controller-group">
          <span class="mock-demo-controller-label">学习状态</span>
          <nav class="mock-state-nav" aria-label="预览课程进入状态">
            <button
              v-for="state in courseEntryStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: courseEntryState === state.id },
              ]"
              type="button"
              :aria-pressed="courseEntryState === state.id"
              @click="setCourseEntryState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
        <section class="mock-demo-controller-group">
          <span class="mock-demo-controller-label">诊断测试</span>
          <nav class="mock-state-nav" aria-label="预览诊断测试卡片状态">
            <button
              v-for="state in diagnosticTestStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: diagnosticTestState === state.id },
              ]"
              type="button"
              :aria-pressed="diagnosticTestState === state.id"
              @click="setDiagnosticTestState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
        <section class="mock-demo-controller-group">
          <span class="mock-demo-controller-label">完整模考</span>
          <nav class="mock-state-nav" aria-label="预览完整模考卡片状态">
            <button
              v-for="state in practiceTestStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: practiceTestState === state.id },
              ]"
              type="button"
              :aria-pressed="practiceTestState === state.id"
              @click="setPracticeTestState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
      </template>
      <template v-else>
        <section class="mock-demo-controller-group">
          <span class="mock-demo-controller-label">报告来源</span>
          <nav class="mock-state-nav" aria-label="预览报告来源">
            <button
              v-for="source in resultSources"
              :key="source.id"
              :class="[
                'mock-state-button',
                { active: resultSource === source.id },
              ]"
              type="button"
              :aria-pressed="resultSource === source.id"
              @click="setResultSource(source.id)"
            >
              {{ source.id === "diagnostic" ? "诊断测试" : "完整模考" }}
            </button>
          </nav>
        </section>
        <section
          v-if="resultSource === 'diagnostic'"
          class="mock-demo-controller-group"
        >
          <span class="mock-demo-controller-label">诊断测试结果</span>
          <nav class="mock-state-nav" aria-label="预览诊断测试结果状态">
            <button
              v-for="state in diagnosticTestStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: diagnosticTestState === state.id },
              ]"
              type="button"
              :aria-pressed="diagnosticTestState === state.id"
              @click="setDiagnosticTestState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
        <section v-else class="mock-demo-controller-group">
          <span class="mock-demo-controller-label">完整模考结果</span>
          <nav class="mock-state-nav" aria-label="预览完整模考结果状态">
            <button
              v-for="state in practiceTestStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: practiceTestState === state.id },
              ]"
              type="button"
              :aria-pressed="practiceTestState === state.id"
              @click="setPracticeTestState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
      </template>
    </aside>
    <dialog
      ref="newPredictionDialog"
      class="new-prediction-dialog"
      aria-labelledby="newPredictionTitle"
      @cancel.prevent="closeNewPrediction"
      @click.self="closeNewPrediction"
    >
      <form class="new-prediction-form" @submit.prevent="createNewPrediction">
        <header>
          <span class="new-prediction-dialog-icon" aria-hidden="true">
            <svg class="icon"><use href="#i-exam" /></svg>
          </span>
          <div>
            <h2 id="newPredictionTitle">
              {{ editingPredictionId ? 'Edit prep plan' : 'Create a prep plan' }}
            </h2>
            <p>Tell Solvely what you are preparing for to build your plan.</p>
          </div>
          <button
            class="new-prediction-close"
            type="button"
            aria-label="Close"
            @click="closeNewPrediction"
          >
            <svg class="icon"><use href="#i-close" /></svg>
          </button>
        </header>
        <div class="new-prediction-fields">
          <label>
            <span>Exam or course name</span>
            <input
              v-model="predictionExamName"
              type="text"
              required
              placeholder="e.g. Biology 101 Final Exam"
            />
          </label>
          <label>
            <span>Exam date</span>
            <input v-model="predictionExamDate" type="date" required />
          </label>
          <label>
            <span>Plan focus</span>
            <select v-model="predictionFocus">
              <option>Balanced review</option>
              <option>High-probability topics</option>
              <option>Mock exam practice</option>
            </select>
          </label>
        </div>
        <footer>
          <button type="button" class="prediction-secondary" @click="closeNewPrediction">
            Cancel
          </button>
          <button type="submit" class="prediction-primary">
            <svg class="icon"><use href="#i-spark" /></svg>
            {{ editingPredictionId ? 'Save changes' : 'Create prep plan' }}
          </button>
        </footer>
      </form>
    </dialog>
    <dialog
      ref="similarQuizDrawer"
      class="similar-quiz-drawer"
      aria-labelledby="similarQuizTitle"
      @cancel.prevent="closeSimilarQuiz"
      @click.self="closeSimilarQuiz"
    >
      <div class="similar-quiz-shell">
        <header class="similar-quiz-head">
          <h2 id="similarQuizTitle">Mini quiz</h2>
          <button
            class="similar-quiz-close"
            type="button"
            aria-label="Close mini quiz"
            @click="closeSimilarQuiz"
          >
            <svg class="icon"><use href="#i-close" /></svg>
          </button>
        </header>

        <div ref="similarQuizBody" class="similar-quiz-body">
          <div v-if="similarQuizLoading" class="similar-quiz-loading" role="status">
            <span aria-hidden="true" />
            <strong>Loading questions…</strong>
          </div>

          <div v-else-if="similarQuizLoadError" class="similar-quiz-error" role="alert">
            <span aria-hidden="true">!</span>
            <strong>Questions unavailable</strong>
            <p>{{ similarQuizLoadError }}</p>
            <button type="button" @click="retrySimilarQuiz">Try again</button>
          </div>

          <section v-else-if="similarQuizComplete" class="similar-quiz-complete">
            <div class="similar-quiz-result-card">
              <div class="similar-quiz-result-main">
                <div class="similar-quiz-score">
                  <span>Your Score</span>
                  <strong :aria-label="`${similarQuizCorrectCount} of ${similarQuizQuestions.length} correct`">
                    <b>{{ similarQuizCorrectCount }}</b>
                    <i>/</i>
                    <em>{{ similarQuizQuestions.length }}</em>
                  </strong>
                </div>
                <div class="similar-quiz-result-copy">
                  <h3>{{ similarQuizResultCopy.title }}</h3>
                  <p>{{ similarQuizResultCopy.description }}</p>
                </div>
              </div>
              <button type="button" class="similar-quiz-review-button" @click="reviewCompletedSimilarQuiz">
                Review Quiz
              </button>
            </div>
          </section>

          <article
            v-else-if="similarQuizCurrentQuestion"
            class="similar-quiz-question"
          >
            <div class="similar-quiz-meta">
              <span>
                Question {{ similarQuizIndex + 1 }} of
                {{ similarQuizQuestions.length }}
              </span>
            </div>
            <div
              class="similar-quiz-progress"
              role="progressbar"
              :aria-valuenow="similarQuizProgress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Mini quiz progress"
            >
              <i :style="{ width: `${similarQuizProgress}%` }" />
            </div>
            <h3>{{ similarQuizPrompt(similarQuizCurrentQuestion) }}</h3>
            <figure
              v-if="similarQuizCurrentQuestion.pictureKey"
              class="similar-quiz-figure"
            >
              <img
                :src="similarQuizCurrentQuestion.pictureKey"
                :alt="`Reference for question ${similarQuizIndex + 1}`"
              />
            </figure>
            <div
              v-if="similarQuizCurrentQuestion.options.length"
              class="similar-quiz-options"
              role="radiogroup"
              :aria-label="similarQuizPrompt(similarQuizCurrentQuestion)"
            >
              <button
                v-for="(option, index) in similarQuizCurrentQuestion.options"
                :key="`${similarQuizCurrentQuestion.id}-${index}`"
                :class="[
                  'similar-quiz-choice',
                  similarQuizOptionState(index),
                ]"
                type="button"
                role="radio"
                :aria-checked="similarQuizCurrentAnswer === index"
                :disabled="similarQuizCurrentAnswer !== undefined"
                @click="answerSimilarQuiz(index)"
              >
                <i>{{ quizChoiceLabel(index) }}</i>
                <span>{{ option }}</span>
                <b
                  v-if="
                    similarQuizCurrentAnswer !== undefined &&
                    index === similarQuizCurrentQuestion.correctIndex
                  "
                  >Correct</b
                >
                <b
                  v-else-if="
                    similarQuizCurrentAnswer === index &&
                    index !== similarQuizCurrentQuestion.correctIndex
                  "
                  >Your answer</b
                >
              </button>
            </div>
            <div v-else class="similar-quiz-short-response">
              <label :for="`similar-response-${similarQuizCurrentQuestion.id}`">
                Enter your answer
              </label>
              <div>
                <input
                  :id="`similar-response-${similarQuizCurrentQuestion.id}`"
                  v-model="similarQuizResponse"
                  type="text"
                  autocomplete="off"
                  :disabled="similarQuizCurrentAnswer !== undefined"
                  placeholder="Type your answer"
                  @keydown.enter.prevent="submitSimilarQuizResponse"
                />
                <button
                  type="button"
                  :disabled="
                    !similarQuizResponse.trim() ||
                    similarQuizCurrentAnswer !== undefined
                  "
                  @click="submitSimilarQuizResponse"
                >
                  Check answer
                </button>
              </div>
            </div>
            <section
              v-if="similarQuizCurrentAnswer !== undefined"
              :class="[
                'similar-quiz-feedback',
                { correct: similarQuizCurrentCorrect },
              ]"
              aria-live="polite"
            >
              <strong>{{ similarQuizCurrentCorrect ? "Correct" : "Not quite" }}</strong>
              <span v-if="!similarQuizCurrentQuestion.options.length">
                Correct answer: <b>{{ similarQuizCurrentQuestion.answer }}</b>
              </span>
              <p>{{ similarQuizCurrentQuestion.explanation }}</p>
            </section>
          </article>
        </div>

        <footer
          v-if="
            !similarQuizLoading &&
            !similarQuizLoadError &&
            !similarQuizComplete &&
            similarQuizCurrentQuestion
          "
          class="similar-quiz-actions"
        >
          <button type="button" class="similar-quiz-secondary" @click="closeSimilarQuiz">
            Close
          </button>
          <button
            type="button"
            class="similar-quiz-primary"
            :disabled="similarQuizCurrentAnswer === undefined"
            @click="advanceSimilarQuiz"
          >
            {{
              similarQuizIndex >= similarQuizQuestions.length - 1
                ? "Results"
                : "Next"
            }}
          </button>
        </footer>
      </div>
    </dialog>
    <ProPaywall
      :open="paywallOpen"
      :context="paywallContext"
      @close="closeCommercialPaywall"
      @unlock="unlockPro"
    />
    <dialog
      ref="retakeDialog"
      class="retake-confirm-dialog"
      aria-labelledby="retakeConfirmTitle"
      aria-describedby="retakeConfirmDescription"
      @cancel.prevent="closeRetakeConfirm"
    >
      <div class="retake-confirm-content">
        <span class="retake-confirm-icon" aria-hidden="true"
          ><svg class="icon"><use href="#i-history" /></svg
        ></span>
        <div>
          <h2 id="retakeConfirmTitle">Retake This Practice Test?</h2>
          <p id="retakeConfirmDescription">
            Retaking this practice test will permanently delete your current
            result, answers, and score analysis. This can’t be undone.
          </p>
        </div>
      </div>
      <footer class="retake-confirm-actions">
        <button
          type="button"
          class="retake-cancel-button"
          @click="closeRetakeConfirm"
        >
          Cancel</button
        ><button
          type="button"
          class="retake-confirm-button"
          @click="confirmRetake"
        >
          Retake Test
        </button>
      </footer>
    </dialog>
  </div>
</template>
