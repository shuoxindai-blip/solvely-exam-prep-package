<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CommercialDemoController from "../components/CommercialDemoController.vue";
import ProPaywall from "../components/ProPaywall.vue";
import { useProAccess } from "../composables/useProAccess";
import { loadEpExam, loadSatManifest } from "../data/satData";
import { buildSatDiagnosticExam } from "../data/satDiagnostic";
import { buildReviewQuestions, buildSatReport } from "../data/satReport";
import { loadImprovePracticeProgress } from "../data/improvePracticeProgress";
import type { SatReportReviewQuestion } from "../data/satReport";
import type { EpExam } from "../types/epV2";
import type { SatManifest, SatTopic } from "../types/sat";

type CourseTab = "study" | "results";
type ResultView = "full" | "score" | "review" | "improve";
type ResultSource = "diagnostic" | "practice";
type CourseEntryState = "first-visit" | "in-progress";
type DiagnosticTestState =
  | "not-started"
  | "in-progress"
  | "scoring"
  | "results";
type PracticeTestState = "not-started" | "in-progress" | "scoring" | "results";
type ResultsAccessState = "locked" | "unlocked";
type ReviewFilter = "ALL" | "INCORRECT" | "CORRECT" | "OMITTED";
type ReviewSectionFilter = "ALL" | "reading-writing" | "math";
type Course = {
  family: string;
  label: string;
  title: string;
  topics: string;
  videos: string;
  questions: string;
  search: string;
};
type LastActivity =
  | {
      kind: "learning";
      examTitle: string;
      sectionTitle: string;
      itemTitle: string;
      resourceLabel: string;
      progressPercent: number;
      topicId: string;
    }
  | {
      kind: "exam";
      examTitle: string;
      sectionTitle: string;
      itemTitle: string;
      moduleLabel: string;
      answered: number;
      total: number;
      examId: number;
    };

const route = useRoute();
const router = useRouter();
const { accessState, isProMember, setProAccess } = useProAccess();
const manifest = ref<SatManifest | null>(null);
const loadError = ref("");
const sidebarCollapsed = ref(false);
const activeTab = ref<CourseTab>("study");
const searchQuery = ref("");
const familyFilter = ref("all");
const sectionFilter = ref<"Math" | "Reading and Writing">("Math");
const priorityFilter = ref("all");
const collapsedSections = ref(new Set<string>());
const resultExam = ref<EpExam | null>(null);
const resultLoadError = ref("");
const resultView = ref<ResultView>("full");
const reviewFilter = ref<ReviewFilter>("ALL");
const reviewSectionFilter = ref<ReviewSectionFilter>("ALL");
const selectedReviewQuestionId = ref<number | null>(null);
const improveSection = ref<"math" | "reading-writing">("math");
const improvePriority = ref<"ALL" | SatTopic["priority"]>("ALL");
const improvePracticeProgress = ref<Record<string, number>>({});
const showImproveImportanceNote = ref(true);
const resultSource = ref<ResultSource>("practice");
const diagnosticTestState = ref<DiagnosticTestState>("not-started");
const practiceTestState = ref<PracticeTestState>("in-progress");
const resultsAccessState = ref<ResultsAccessState>("locked");
const paywallOpen = ref(false);
const paywallContext = ref("the complete SAT Prep 2026 package");
let pendingCommercialAction: (() => void) | null = null;
let practiceScoringTimer: number | null = null;
let diagnosticScoringTimer: number | null = null;
const retakeDialog = ref<HTMLDialogElement | null>(null);
const demoController = ref<HTMLElement | null>(null);
const demoControllerPosition = ref<{ x: number; y: number } | null>(null);
const demoControllerDragging = ref(false);
let demoControllerDrag:
  | { pointerId: number; offsetX: number; offsetY: number }
  | null = null;
const lastActivity = ref<LastActivity>({
  kind: "learning",
  examTitle: "SAT Prep 2026",
  sectionTitle: "Advanced Math",
  itemTitle: "Expansion, factoring, and completing the square",
  resourceLabel: "Study Guide",
  progressPercent: 62,
  topicId: "sat_math_advanced_equivalent_expressions_01",
});
const isCourseOpen = computed(() => route.hash === "#course-0");
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
  () => String(route.query.courseState || "") !== "not-started",
);
const courseProgressPercent = computed(() => (isCourseStarted.value ? 18 : 0));
const lastActivityDetail = computed(() =>
  lastActivity.value.kind === "learning"
    ? `${lastActivity.value.sectionTitle} · ${lastActivity.value.resourceLabel} · ${lastActivity.value.progressPercent}% complete`
    : `${lastActivity.value.sectionTitle} · ${lastActivity.value.moduleLabel} · ${lastActivity.value.answered} of ${lastActivity.value.total} answered`,
);
const lastActivityCta = computed(() =>
  lastActivity.value.kind === "learning" ? "Continue learning" : "Resume exam",
);

const practiceResultReport = computed(() =>
  resultExam.value ? buildSatReport(resultExam.value) : null,
);
const diagnosticExam = computed<EpExam | null>(() => {
  const exam = resultExam.value;
  if (!exam) return null;
  return buildSatDiagnosticExam(exam);
});
const diagnosticResultReport = computed(() => {
  if (!diagnosticExam.value) return null;
  const report = buildSatReport(diagnosticExam.value);
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
  return (
    (sectionIds.has("reading-writing") ? 64 : 0) +
    (sectionIds.has("math") ? 70 : 0)
  );
});
const practiceTestStates: { id: PracticeTestState; label: string }[] = [
  { id: "not-started", label: "未开始" },
  { id: "in-progress", label: "进行中" },
  { id: "scoring", label: "评分中" },
  { id: "results", label: "结果已生成" },
];
const diagnosticTestStates: { id: DiagnosticTestState; label: string }[] = [
  { id: "not-started", label: "未开始" },
  { id: "in-progress", label: "进行中" },
  { id: "scoring", label: "评分中" },
  { id: "results", label: "结果已生成" },
];
const resultSources: {
  id: ResultSource;
  label: string;
}[] = [
  {
    id: "diagnostic",
    label: "Diagnostic Test",
  },
  {
    id: "practice",
    label: "Full-Length Practice Test",
  },
];
const resultViews: { id: ResultView; label: string }[] = [
  { id: "full", label: "Full Report" },
  { id: "score", label: "Score Analysis" },
  { id: "review", label: "Question Review" },
  { id: "improve", label: "Targeted Practice" },
];
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
const resultsAccessStates: { id: ResultsAccessState; label: string }[] = [
  { id: "locked", label: "未解锁" },
  { id: "unlocked", label: "已解锁" },
];
const activeAssessmentComplete = computed(() =>
  resultSource.value === "diagnostic"
    ? diagnosticTestState.value === "results"
    : resultsAccessState.value === "unlocked",
);
const resultsRequirePro = computed(
  () => resultSource.value === "practice" || resultView.value === "improve",
);
const resultsCommercialLocked = computed(
  () => resultsRequirePro.value && !isProMember.value,
);
const showResultsUnlockAction = computed(
  () => resultsCommercialLocked.value && activeAssessmentComplete.value,
);
const resultsLocked = computed(
  () => !activeAssessmentComplete.value || resultsCommercialLocked.value,
);
const targetedPracticeLocked = computed(
  () => !activeAssessmentComplete.value || !isProMember.value,
);
const showTargetedPracticeUnlockAction = computed(
  () => activeAssessmentComplete.value && !isProMember.value,
);
const resultsLockTitle = computed(() => {
  if (!activeAssessmentComplete.value)
    return resultSource.value === "diagnostic"
      ? "Complete the Free Diagnostic Test to unlock"
      : "Complete the Practice Test to unlock";
  return resultSource.value === "diagnostic"
    ? "Unlock Targeted Practice with Solvely Pro"
    : "Unlock with Solvely Pro";
});
const resultsLockDescription = computed(() => {
  if (!activeAssessmentComplete.value)
    return resultSource.value === "diagnostic"
      ? "Complete all 20 diagnostic questions to see your free Score Report and Question Review."
      : "Finish the full-length SAT Practice Test to unlock this report.";
  return resultSource.value === "diagnostic"
    ? "Upgrade to turn your diagnostic results into prioritized topics and adaptive practice."
    : "Get your full score report, every explanation, and adaptive topics to improve.";
});
const diagnosticTestCard = computed(() => {
  const report = diagnosticResultReport.value;
  const questionCount = diagnosticExam.value?.questions.length ?? 20;
  const readingWritingScore =
    report?.sections.find((section) => section.sectionId === "reading-writing")
      ?.score ?? 650;
  const mathScore =
    report?.sections.find((section) => section.sectionId === "math")?.score ??
    630;
  if (diagnosticTestState.value === "results")
    return {
      stateLabel: "Results ready",
      description:
        "Your predicted SAT score and free answer review are ready. This estimate does not replace the full-length test.",
      metrics: [
        { value: String(report?.totalScore ?? 1280), label: "predicted total" },
        { value: String(readingWritingScore), label: "Reading & Writing" },
        { value: String(mathScore), label: "Math" },
      ],
      progressTitle: "Completed",
      progressLabel: "Report ready",
      progressPercent: 100,
      cta: "View Free Results",
      disabled: false,
    };
  if (diagnosticTestState.value === "scoring")
    return {
      stateLabel: "Scoring",
      description:
        "Your answers were submitted. We are calculating your total and section score predictions; results are usually ready in a few seconds.",
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: "Untimed", label: "" },
        { value: "2", label: "sections" },
      ],
      progressTitle: "Status",
      progressLabel: "Calculating score prediction",
      progressPercent: 36,
      cta: "Scoring…",
      disabled: true,
    };
  if (diagnosticTestState.value === "in-progress")
    return {
      stateLabel: "In progress",
      description:
        "Continue your quick SAT score and skill check. Your answers are saved automatically.",
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: "Untimed", label: "" },
        { value: "2", label: "sections" },
      ],
      progressTitle: "Progress",
      progressLabel: `4 of ${questionCount} answered`,
      progressPercent: (4 / questionCount) * 100,
      cta: "Continue Diagnostic",
      disabled: false,
    };
  return {
    stateLabel: "Free",
    description:
      "Get an instant score estimate and skill breakdown to see where you can gain points fast.",
    metrics: [
      { value: String(questionCount), label: "questions" },
      { value: "Untimed", label: "" },
      { value: "2", label: "sections" },
    ],
    progressTitle: "Access",
    progressLabel: "Free for everyone",
    progressPercent: 0,
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
      stateLabel: "Pro",
      description:
        "Take a realistic full-length Digital SAT with official timing and module structure.",
      metrics: [
        { value: String(questionCount), label: "questions" },
        { value: String(durationMinutes), label: "min" },
        { value: String(moduleCount), label: "modules" },
      ],
      progressTitle: "Progress",
      progressLabel: "Ready to start",
      progressPercent: 0,
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
        { value: String(moduleCount), label: "modules" },
      ],
      progressTitle: "Status",
      progressLabel: "Preparing score report",
      progressPercent: 36,
      cta: "Scoring…",
      disabled: true,
    };
  if (practiceTestState.value === "results")
    return {
      stateLabel: "Results ready",
      description: `Your score report and next-step recommendations are ready. Your result is in the ${report?.percentile ?? 70}th percentile.`,
      metrics: [
        { value: String(report?.totalScore ?? 1280), label: "total score" },
        { value: String(readingWritingScore), label: "Reading & Writing" },
        { value: String(mathScore), label: "Math" },
      ],
      progressTitle: "Completed",
      progressLabel: report
        ? formatReportDate(report.completedAt)
        : "Aug 21, 2026",
      progressPercent: 100,
      cta: "View Results",
      disabled: false,
    };
  return {
    stateLabel: "In progress",
    description:
      "Resume your saved attempt from Reading and Writing, Module 1. Your answers are saved automatically.",
    metrics: [
      { value: String(questionCount), label: "questions" },
      { value: String(durationMinutes), label: "min" },
      { value: String(moduleCount), label: "modules" },
    ],
    progressTitle: "Progress",
    progressLabel: `${savedAnsweredCount} of ${questionCount} answered`,
    progressPercent: questionCount
      ? (savedAnsweredCount / questionCount) * 100
      : 0,
    cta: "Continue Practice Test",
    disabled: false,
  };
});
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
    number,
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
    const group = groups.get(question.topicId) ?? {
      topicId: question.topicId,
      sectionId: question.sectionId,
      sectionTitle: question.sectionTitle,
      domain: question.contentDomain,
      label: topicTitles.get(question.topicId) ?? question.officialSkill,
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
    groups.set(question.topicId, group);
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
  return plottedTopics.map((topic) => {
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
    return { ...topic, left, top, edgeRight: left > 72, edgeBottom: top > 72 };
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
        sectionId:
          topic.section === "Math"
            ? ("math" as const)
            : ("reading-writing" as const),
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
      examSection:
        improveSection.value === "math" ? "Math" : "Reading & Writing",
      topics: topics.filter((topic) => topic.contentDomain === contentDomain),
    }),
  );
});

const courses: Course[] = [
  {
    family: "sat",
    label: "SAT",
    title: "SAT Prep 2026",
    topics: "100",
    videos: "100",
    questions: "3,879",
    search: "digital college admissions math reading writing",
  },
  {
    family: "act",
    label: "ACT",
    title: "ACT Prep 2026",
    topics: "230+",
    videos: "230+",
    questions: "6,600+",
    search: "college admissions english math reading science",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Calculus AB",
    topics: "42+",
    videos: "42+",
    questions: "1,200+",
    search: "advanced placement math calculus",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Biology",
    topics: "55+",
    videos: "55+",
    questions: "1,600+",
    search: "advanced placement biology science",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP United States History",
    topics: "45+",
    videos: "45+",
    questions: "1,400+",
    search: "advanced placement us history",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP World History: Modern",
    topics: "42+",
    videos: "42+",
    questions: "1,300+",
    search: "advanced placement world history modern",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Psychology",
    topics: "40+",
    videos: "40+",
    questions: "1,200+",
    search: "advanced placement psychology",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Chemistry",
    topics: "50+",
    videos: "50+",
    questions: "1,500+",
    search: "advanced placement chemistry science",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Statistics",
    topics: "38+",
    videos: "38+",
    questions: "1,100+",
    search: "advanced placement statistics math data",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Human Geography",
    topics: "35+",
    videos: "35+",
    questions: "1,000+",
    search: "advanced placement human geography",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP English Language and Composition",
    topics: "32+",
    videos: "32+",
    questions: "900+",
    search: "advanced placement english language composition",
  },
  {
    family: "ap",
    label: "AP",
    title: "AP Computer Science A",
    topics: "40+",
    videos: "40+",
    questions: "1,000+",
    search: "advanced placement computer science programming",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Deutsch",
    topics: "26",
    videos: "26",
    questions: "1,100+",
    search: "german deutsch germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Mathematik",
    topics: "32",
    videos: "32",
    questions: "1,200+",
    search: "german mathematik mathematics math germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Englisch",
    topics: "24",
    videos: "24",
    questions: "950+",
    search: "german englisch english germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Französisch",
    topics: "21",
    videos: "21",
    questions: "850+",
    search: "german french französisch germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Biologie",
    topics: "25",
    videos: "25",
    questions: "1,100+",
    search: "german biology biologie germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Chemie",
    topics: "22",
    videos: "22",
    questions: "950+",
    search: "german chemistry chemie germany",
  },
  {
    family: "abitur",
    label: "ABITUR",
    title: "Abitur Physik",
    topics: "20",
    videos: "20",
    questions: "850+",
    search: "german physics physik germany",
  },
];

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
    .filter((topic) => topic.section === "Math" && topic.priority === "CORE")
    .sort((left, right) => left.order - right.order)[0] ?? null,
);

const courseStartTopic = computed(() => {
  const activity = lastActivity.value;
  if (isCourseStarted.value && activity.kind === "learning") {
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
  const activity = lastActivity.value;
  const isContinuing =
    isCourseStarted.value &&
    activity.kind === "learning" &&
    activity.topicId === topic.id;
  return {
    label: isContinuing ? "Continue learning" : "Recommended start",
    title: topic.title,
    domain: topic.domain,
    detail: isContinuing && activity.kind === "learning"
      ? `${activity.progressPercent}% complete`
      : `${topic.importanceScore}% ${priorityLabel(topic.priority)} priority`,
    cta: isContinuing ? "Continue learning" : "Start learning",
  };
});

function topicProgress(topic: SatTopic) {
  if (!isCourseStarted.value) return 0;
  if (topic.order <= 46) return 100;
  if (topic.order <= 52)
    return topic.order === 50 ? 62 : topic.order % 2 ? 33 : 67;
  return 0;
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

function openCourse(course: Course) {
  if (course.family !== "sat") return;
  activeTab.value = "study";
  void router.push({ name: "package", hash: "#course-0" });
}

function closeCourse() {
  void router.push({ name: "package", hash: "#examCatalogTitle" });
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
  void router.push({
    name: tool,
    params: { topicId: topic.id },
    query: { access: accessState.value },
  });
}

function openCourseStartTopic() {
  const topic = courseStartTopic.value;
  if (topic) openTopic(topic, "study-guide");
}

function openCommercialPaywall(context: string, action?: () => void) {
  paywallContext.value = context;
  pendingCommercialAction = action ?? null;
  paywallOpen.value = true;
}

function closeCommercialPaywall() {
  paywallOpen.value = false;
  pendingCommercialAction = null;
}

function unlockPro() {
  const action = pendingCommercialAction;
  pendingCommercialAction = null;
  paywallOpen.value = false;
  setProAccess("member");
  if (action) void nextTick(action);
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
  if (!isProMember.value) {
    openCommercialPaywall("adaptive practice for your priority SAT topics", () =>
      openImprovePractice(topic),
    );
    return;
  }
  void router.push({
    name: "quiz",
    params: { topicId: topic.id },
    query: { source: "improve", access: accessState.value },
  });
}
function dismissImportanceNote(note: "improve") {
  showImproveImportanceNote.value = false;
  try {
    window.localStorage.setItem(
      `solvely:sat:${note}-importance-note-dismissed`,
      "1",
    );
  } catch {
    /* The notice still closes when browser storage is unavailable. */
  }
}
function resumeLastActivity() {
  if (lastActivity.value.kind === "learning")
    void router.push({
      name: "study-guide",
      params: { topicId: lastActivity.value.topicId },
    });
  else startMockExam(lastActivity.value.examId);
}
function startMockExam(examId: number) {
  if (!isProMember.value) {
    openCommercialPaywall("the SAT Full-Length Practice Test", () =>
      startMockExam(examId),
    );
    return;
  }
  void router.push({
    name: "mock-exam",
    params: { examId },
    query: { access: accessState.value },
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
      hash: "#course-0",
    });
    return;
  }
  if (!isProMember.value) {
    openCommercialPaywall("Practice Test retakes and your saved score history", requestRetake);
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
function setPracticeTestState(state: PracticeTestState) {
  clearPracticeScoringTimer();
  practiceTestState.value = state;
  resultsAccessState.value = state === "results" ? "unlocked" : "locked";
  if (state !== "scoring") return;
  practiceScoringTimer = window.setTimeout(() => {
    practiceScoringTimer = null;
    practiceTestState.value = "results";
    resultsAccessState.value = "unlocked";
    void router.replace({
      name: "package",
      query: { ...route.query, tab: "study", practiceState: "results" },
      hash: "#course-0",
    });
  }, 2000);
}
function setDiagnosticTestState(state: DiagnosticTestState) {
  clearDiagnosticScoringTimer();
  diagnosticTestState.value = state;
  if (state === "results") resultSource.value = "diagnostic";
  if (state !== "scoring") return;
  resultSource.value = "diagnostic";
  diagnosticScoringTimer = window.setTimeout(() => {
    diagnosticScoringTimer = null;
    diagnosticTestState.value = "results";
    resultSource.value = "diagnostic";
    void router.replace({
      name: "package",
      query: {
        ...route.query,
        tab: "study",
        reportSource: "diagnostic",
        diagnosticState: "results",
      },
      hash: "#course-0",
    });
  }, 2000);
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
            resultState: "locked",
          }
        : {}),
    },
    hash: "#course-0",
  });
}
function setResultsAccessState(state: ResultsAccessState) {
  resultsAccessState.value = state;
  void router.replace({
    name: "package",
    query: { ...route.query, tab: "results", resultState: state },
    hash: "#course-0",
  });
}
function confirmRetake() {
  closeRetakeConfirm();
  setPracticeTestState("not-started");
  startMockExam(1);
}
function handlePracticeTestAction() {
  if (practiceTestState.value === "scoring") return;
  if (!isProMember.value) {
    openCommercialPaywall(
      practiceTestState.value === "results"
        ? "your complete SAT score report"
        : "the SAT Full-Length Practice Test",
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
        tab: "results",
        resultState: "unlocked",
        reportSource: "practice",
      },
      hash: "#course-0",
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
      hash: "#course-0",
    });
    return;
  }
  setDiagnosticTestState("in-progress");
  void router.push({
    name: "mock-exam",
    params: { examId: 1 },
    query: {
      mode: "diagnostic",
      diagnosticState: "in-progress",
    },
  });
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
    hash: "#course-0",
  });
}
function setResultViewFromEvent(event: Event) {
  setResultView((event.target as HTMLSelectElement).value as ResultView);
}
function setResultSource(source: ResultSource) {
  resultSource.value = source;
  selectedReviewQuestionId.value = null;
  reviewFilter.value = "ALL";
  reviewSectionFilter.value = "ALL";
  void router.replace({
    name: "package",
    query: { ...route.query, tab: "results", reportSource: source },
    hash: "#course-0",
  });
}
function setResultSourceFromEvent(event: Event) {
  setResultSource(
    (event.target as HTMLSelectElement).value as ResultSource,
  );
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
  if (!isProMember.value) {
    openCommercialPaywall("question review and targeted SAT practice", () =>
      practiceReviewQuestion(question),
    );
    return;
  }
  const topic = reviewTopic(question);
  if (topic)
    void router.push({
      name: "quiz",
      params: { topicId: topic.id },
      query: { access: accessState.value },
    });
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
  const requestedDiagnosticState = String(
    route.query.diagnosticState || "",
  );
  if (
    requestedDiagnosticState === "not-started" ||
    requestedDiagnosticState === "in-progress" ||
    requestedDiagnosticState === "scoring" ||
    requestedDiagnosticState === "results"
  )
    setDiagnosticTestState(requestedDiagnosticState);
  const requestedPracticeState = String(route.query.practiceState || "");
  if (
    requestedPracticeState === "not-started" ||
    requestedPracticeState === "in-progress" ||
    requestedPracticeState === "scoring" ||
    requestedPracticeState === "results"
  ) {
    setPracticeTestState(requestedPracticeState);
  }
  resultSource.value =
    requestedResultSource === "diagnostic" ||
    requestedResultSource === "practice"
      ? requestedResultSource
      : requestedDiagnosticState === "results"
        ? "diagnostic"
        : "practice";
  if (activeTab.value === "results") {
    const requestedView = String(route.query.view || "");
    resultView.value =
      requestedView === "score" ||
      requestedView === "review" ||
      requestedView === "improve" ||
      requestedView === "full"
        ? requestedView
        : "full";
    const requestedResultState = String(route.query.resultState || "");
    resultsAccessState.value =
      requestedResultState === "locked" ||
      requestedResultState === "unlocked"
        ? requestedResultState
        : practiceTestState.value === "results"
          ? "unlocked"
          : "locked";
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
  ],
  () => {
    if (route.hash === "#course-0") syncTabFromRoute();
    else activeTab.value = "study";
  },
);

watch(sectionFilter, initializeSectionDisclosure);

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

onMounted(async () => {
  document.body.classList.add("package-route");
  window.addEventListener("resize", keepDemoControllerInViewport);
  syncTabFromRoute();
  try {
    showImproveImportanceNote.value =
      window.localStorage.getItem(
        "solvely:sat:improve-importance-note-dismissed",
      ) !== "1";
  } catch {
    /* Keep both notices visible when browser storage is unavailable. */
  }
  improvePracticeProgress.value = loadImprovePracticeProgress();
  try {
    manifest.value = await loadSatManifest();
    initializeSectionDisclosure();
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : "Unable to load SAT materials.";
  }
  try {
    resultExam.value = await loadEpExam(1);
  } catch (error) {
    resultLoadError.value =
      error instanceof Error
        ? error.message
        : "Unable to load the SAT score report.";
  }
});

onBeforeUnmount(() => {
  clearPracticeScoringTimer();
  clearDiagnosticScoringTimer();
  stopDemoControllerDrag();
  window.removeEventListener("resize", keepDemoControllerInViewport);
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
        <button class="nav-button active" type="button">
          <svg class="icon"><use href="#i-home" /></svg
          ><span class="nav-label">Home</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-book" /></svg
          ><span class="nav-label">AI Study</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-mic" /></svg
          ><span class="nav-label">AI Live Notes</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-wand" /></svg
          ><span class="nav-label">AI Writing Tools</span>
        </button>
        <button class="nav-button" type="button" aria-disabled="true">
          <svg class="icon"><use href="#i-exam" /></svg
          ><span class="nav-label">Exam Predictor</span>
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
        v-if="!isCourseOpen"
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
        v-if="!isCourseOpen"
        class="history-entry"
        type="button"
        aria-disabled="true"
      >
        <svg class="icon"><use href="#i-history" /></svg><span>History</span>
      </button>

      <div v-if="!isCourseOpen" class="workspace">
        <header class="hero">
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
        <section class="composer-shell" aria-label="Solvely learning composer">
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

        <section class="examples-section" aria-label="Exam prep examples">
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

        <section class="exam-catalog" aria-labelledby="examCatalogTitle">
          <div class="exam-catalog-heading">
            <div><h2 id="examCatalogTitle">Standardized test courses</h2></div>
            <p>Topic study, mock exams, results, and targeted improvement.</p>
          </div>
          <section
            class="diagnostic-entry jump-back-entry"
            aria-labelledby="jumpBackTitle"
          >
            <div class="diagnostic-entry-copy">
              <div class="diagnostic-entry-meta">
                <span>JUMP BACK IN</span
                ><span>{{ lastActivity.examTitle }}</span>
              </div>
              <h3 id="jumpBackTitle">{{ lastActivity.itemTitle }}</h3>
              <p>{{ lastActivityDetail }}</p>
            </div>
            <button
              class="diagnostic-entry-button"
              type="button"
              @click="resumeLastActivity"
            >
              {{ lastActivityCta }}
            </button>
          </section>
          <div class="exam-catalog-toolbar">
            <label class="exam-search-wrap"
              ><svg class="icon"><use href="#i-search" /></svg
              ><input
                v-model="searchQuery"
                aria-label="Search standardized exam courses"
                placeholder="Search SAT, ACT, AP, Abitur..." /></label
            ><label class="exam-filter-wrap"
              ><span class="sr-only">Filter exam packages</span
              ><select v-model="familyFilter" aria-label="Filter exam packages">
                <option value="all">All courses</option>
                <option value="sat">SAT</option>
                <option value="act">ACT</option>
                <option value="ap">AP</option>
                <option value="abitur">Abitur</option></select
              ><svg class="icon"><use href="#i-chevron" /></svg
            ></label>
          </div>
          <div class="course-grid" aria-label="Pre-made exam courses">
            <button
              v-for="course in filteredCourses"
              :key="course.title"
              :class="[
                'course-card',
                { 'sample-course': course.family !== 'sat' },
              ]"
              type="button"
              :disabled="course.family !== 'sat'"
              :aria-label="
                course.family === 'sat'
                  ? `Open ${course.title} course`
                  : `${course.title} sample unavailable`
              "
              @click="openCourse(course)"
            >
              <span class="course-family">{{ course.label }}</span>
              <h3>{{ course.title }}</h3>
              <p>
                {{ course.topics }} topics · {{ course.videos }} video
                lessons<br />{{ course.questions }} practice questions
              </p>
              <span class="course-stats"
                ><span>Full test</span><span>Score insights</span></span
              >
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
                <h1 id="courseWorkspaceTitle">SAT Prep 2026</h1>
                <p>
                  SAT Prep 2026 with focused study tools, a realistic mock exam,
                  a score report, and targeted practice.
                </p>
                <div class="course-package-stats" aria-label="Course contents">
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-book" /></svg
                    ><strong>100</strong> video lessons</span
                  >
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-grid" /></svg
                    ><strong>3,879</strong> practice questions</span
                  >
                  <span
                    ><svg class="icon" aria-hidden="true">
                      <use href="#i-exam" /></svg
                    ><strong>1</strong> full-length test</span
                  >
                </div>
              </div>
              <aside
                v-if="isCourseStarted"
                class="course-progress-summary"
                aria-label="Course progress"
              >
                <span class="course-progress-watermark" aria-hidden="true">{{
                  courseProgressPercent
                }}</span>
                <div class="course-progress-value">
                  <strong>{{ courseProgressPercent }}%</strong
                  ><span>Course Progress</span>
                </div>
                <div
                  class="course-progress-track"
                  role="progressbar"
                  aria-label="Course progress"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuenow="courseProgressPercent"
                >
                  <i :style="{ width: `${courseProgressPercent}%` }" />
                </div>
              </aside>
              <aside
                v-else
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
              aria-label="Course sections"
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
              aria-label="SAT lessons and practice test"
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
                    <label class="course-topic-select">
                      <select
                        v-model="sectionFilter"
                        aria-label="Filter lessons by section"
                      >
                        <option value="Math">Section: Math</option>
                        <option value="Reading and Writing">
                          Section: Reading &amp; Writing
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
                  Loading SAT topics…
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
                        {{ section.examSection }} · {{ section.title }}
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
                        class="study-topic-row"
                        role="row"
                        tabindex="0"
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
                        <aside class="study-topic-popover">
                          <div class="study-topic-popover-head">
                            <h4>{{ topic.title }}</h4>
                            <span :class="topic.priority.toLowerCase()"
                              >{{ topic.importanceScore }}% ·
                              {{ priorityLabel(topic.priority) }}</span
                            >
                          </div>
                          <small>Choose a study tool</small>
                          <div class="study-topic-actions">
                            <button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'study-guide')"
                            >
                              <svg class="icon"><use href="#i-book" /></svg
                              ><span>Study Guide</span></button
                            ><button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'flashcards')"
                            >
                              <svg class="icon"><use href="#i-grid" /></svg
                              ><span>Flashcards</span></button
                            ><button
                              class="study-topic-tool"
                              type="button"
                              @click="openTopic(topic, 'quiz')"
                            >
                              <svg class="icon"><use href="#i-exam" /></svg
                              ><span>Quiz</span>
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
                    <header class="mock-entry-head">
                      <span class="mock-entry-number">Diagnostic Test</span
                      ><span
                        :class="[
                          'mock-entry-state',
                          diagnosticTestState,
                          'free-diagnostic',
                        ]"
                        ><i />{{ diagnosticTestCard.stateLabel }}</span
                      >
                    </header>
                    <div class="mock-entry-copy">
                      <h3>Free SAT Diagnostic Test</h3>
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
                    <div
                      v-if="
                        diagnosticTestState !== 'results' &&
                        diagnosticTestState !== 'not-started'
                      "
                      class="mock-entry-progress"
                    >
                      <div>
                        <span>{{ diagnosticTestCard.progressTitle }}</span
                        ><strong>{{ diagnosticTestCard.progressLabel }}</strong>
                      </div>
                      <span class="mock-entry-progress-track"
                        ><i
                          :style="{
                            width: `${diagnosticTestCard.progressPercent}%`,
                          }"
                      /></span>
                    </div>
                    <div
                      v-else-if="diagnosticTestState === 'results'"
                      class="mock-entry-completed"
                    >
                      {{ diagnosticTestCard.progressLabel }}
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
                    <header class="mock-entry-head">
                      <span class="mock-entry-number">Practice Test</span
                      ><span :class="['mock-entry-state', practiceTestState]"
                        ><i />{{ practiceTestCard.stateLabel }}</span
                      >
                    </header>
                    <div class="mock-entry-copy">
                      <h3>SAT Full-Length Practice Test</h3>
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
                    <div
                      v-if="
                        practiceTestState !== 'results' &&
                        practiceTestState !== 'not-started'
                      "
                      class="mock-entry-progress"
                    >
                      <div>
                        <span>{{ practiceTestCard.progressTitle }}</span
                        ><strong>{{ practiceTestCard.progressLabel }}</strong>
                      </div>
                      <span class="mock-entry-progress-track"
                        ><i
                          :style="{
                            width: `${practiceTestCard.progressPercent}%`,
                          }"
                      /></span>
                    </div>
                    <div
                      v-else-if="practiceTestState === 'results'"
                      class="mock-entry-completed"
                    >
                      Completed {{ practiceTestCard.progressLabel }}
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
                <div
                  class="course-topic-filters"
                  aria-label="Filter test results"
                >
                  <label class="course-topic-select results-test-select">
                    <select
                      :value="resultSource"
                      aria-label="Select test results"
                      @change="setResultSourceFromEvent"
                    >
                      <option
                        v-for="source in resultSources"
                        :key="source.id"
                        :value="source.id"
                      >
                        Test: {{ source.label }}
                      </option>
                    </select>
                    <svg class="icon" aria-hidden="true">
                      <use href="#i-chevron" />
                    </svg>
                  </label>
                  <label class="course-topic-select results-view-select">
                    <select
                      :value="resultView"
                      aria-label="Select result view"
                      @change="setResultViewFromEvent"
                    >
                      <option
                        v-for="view in resultViews"
                        :key="view.id"
                        :value="view.id"
                      >
                        View: {{ view.label }}
                      </option>
                    </select>
                    <svg class="icon" aria-hidden="true">
                      <use href="#i-chevron" />
                    </svg>
                  </label>
                </div>
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
                  :inert="resultsLocked && !showResultsUnlockAction"
                  :aria-hidden="resultsLocked && !showResultsUnlockAction"
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
                <section class="score-report-card">
                  <header class="score-report-cover">
                    <span>SAT® Prep 2026</span
                    ><small>{{
                      resultSource === "diagnostic"
                        ? "Diagnostic result"
                        : "Score report"
                    }}</small>
                  </header>
                  <div class="score-report-main">
                    <div class="score-report-total">
                      <span>{{
                        resultSource === "diagnostic"
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
                        ><em>{{ resultReport.percentile }}th percentile</em>
                      </div>
                    </div>
                    <div class="score-report-sections">
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
                            : section.percentile + "th percentile"
                        }}</em>
                      </article>
                    </div>
                  </div>
                </section>

                <section class="report-ai-overview">
                  <span class="report-ai-icon"
                    ><svg class="icon"><use href="#i-spark" /></svg
                  ></span>
                  <div>
                    <span>{{
                      resultSource === "diagnostic"
                        ? "Diagnostic Overview"
                        : "SAT Overview"
                    }}</span>
                    <p>{{ resultReport.overview }}</p>
                  </div>
                </section>
                <p
                  v-if="resultSource === 'diagnostic'"
                  class="diagnostic-score-disclaimer"
                >
                  This predicted score is an estimate based on 20 untimed
                  questions. It does not replace a full-length SAT Practice
                  Test.
                </p>
                  <div v-if="resultsLocked" :class="['results-subsection-lock', { 'has-commercial-action': showResultsUnlockAction }]">
                    <span aria-hidden="true"
                      ><svg class="icon"><use href="#i-lock" /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <small>{{ resultsLockDescription }}</small>
                    <button v-if="showResultsUnlockAction" type="button" @click="openCommercialPaywall('your complete SAT score report')">Unlock report</button>
                  </div>
                </div>

                <section
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
                            : "SAT"
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
                  <div v-if="resultsLocked" :class="['results-subsection-lock', { 'has-commercial-action': showResultsUnlockAction }]">
                    <span aria-hidden="true"
                      ><svg class="icon"><use href="#i-lock" /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <small>{{ resultsLockDescription }}</small>
                    <button v-if="showResultsUnlockAction" type="button" @click="openCommercialPaywall('your SAT knowledge and skills breakdown')">Unlock report</button>
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
                        See which SAT skills are both accurate and efficient,
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
                            :key="topic.topicId"
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
                            :aria-describedby="`confidence-tooltip-${topic.topicId}`"
                          >
                            <span
                              :id="`confidence-tooltip-${topic.topicId}`"
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
                  <div v-if="resultsLocked" :class="['results-subsection-lock', { 'has-commercial-action': showResultsUnlockAction }]">
                    <span aria-hidden="true"
                      ><svg class="icon"><use href="#i-lock" /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <small>{{ resultsLockDescription }}</small>
                    <button v-if="showResultsUnlockAction" type="button" @click="openCommercialPaywall('detailed SAT performance insights')">Unlock report</button>
                  </div>
                </section>

                <footer v-if="resultView !== 'full'" class="report-footer">
                  <p>
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
                      <label class="course-topic-select">
                        <select
                          :value="reviewSectionFilter"
                          aria-label="Filter reviewed questions by section"
                          @change="setReviewSectionFilterFromEvent"
                        >
                          <option value="ALL">Section: All</option>
                          <option value="reading-writing">
                            Section: Reading &amp; Writing
                          </option>
                          <option value="math">Section: Math</option>
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
                        <span>Skill to review</span
                        ><strong>{{
                          selectedReviewQuestion.officialSkill
                        }}</strong>
                        <p>
                          {{ selectedReviewQuestion.contentDomain }} ·
                          {{ reviewTopicTitle(selectedReviewQuestion) }}
                        </p>
                      </div>
                      <button
                        type="button"
                        @click="practiceReviewQuestion(selectedReviewQuestion)"
                      >
                        Practice this topic
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
                  <div v-if="resultsLocked" :class="['results-subsection-lock', { 'has-commercial-action': showResultsUnlockAction }]">
                    <span aria-hidden="true"
                      ><svg class="icon"><use href="#i-lock" /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <small>{{ resultsLockDescription }}</small>
                    <button v-if="showResultsUnlockAction" type="button" @click="openCommercialPaywall('every answer, explanation, and skill review')">Unlock review</button>
                  </div>
                </div>
                <div v-else class="results-empty">
                  No questions match these filters.
                </div>
                <footer v-if="resultView !== 'full'" class="report-footer">
                  <p>
                    SAT® is a registered trademark of the College Board, which
                    is not affiliated with or endorsed by this product.
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
                      <label class="course-topic-select">
                        <select
                          v-model="improveSection"
                          aria-label="Filter improvement topics by section"
                        >
                          <option value="math">Section: Math</option>
                          <option value="reading-writing">
                            Section: Reading &amp; Writing
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
                    SAT priority. Practice progress is tracked
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
                  <section
                    v-for="section in improveTopicSections"
                    :key="section.id"
                    :class="[
                      'study-topic-section',
                      {
                        'results-locked-subsection':
                          targetedPracticeLocked &&
                          resultSource !== 'diagnostic',
                      },
                    ]"
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
                        {{ section.examSection }} · {{ section.title }}
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
                              >{{ topic.missed }} missed · {{ topic.accuracy }}%
                              accuracy</span
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
                    <div
                      v-if="
                        targetedPracticeLocked &&
                        resultSource !== 'diagnostic'
                      "
                      :class="[
                        'results-subsection-lock',
                        {
                          'has-commercial-action':
                            showTargetedPracticeUnlockAction,
                        },
                      ]"
                    >
                      <span aria-hidden="true"
                        ><svg class="icon"><use href="#i-lock" /></svg
                      ></span>
                      <strong>{{ resultsLockTitle }}</strong>
                      <small>{{ resultsLockDescription }}</small>
                      <button
                        v-if="showTargetedPracticeUnlockAction"
                        type="button"
                        @click="
                          openCommercialPaywall(
                            'prioritized topics and adaptive SAT practice',
                          )
                        "
                      >
                        Unlock practice
                      </button>
                    </div>
                  </section>
                  <div
                    v-if="
                      targetedPracticeLocked && resultSource === 'diagnostic'
                    "
                    :class="[
                      'results-subsection-lock',
                      {
                        'has-commercial-action':
                          showTargetedPracticeUnlockAction,
                      },
                    ]"
                  >
                    <span aria-hidden="true"
                      ><svg class="icon"><use href="#i-lock" /></svg
                    ></span>
                    <strong>{{ resultsLockTitle }}</strong>
                    <small>{{ resultsLockDescription }}</small>
                    <button
                      v-if="showTargetedPracticeUnlockAction"
                      type="button"
                      @click="
                        openCommercialPaywall(
                          'prioritized topics and adaptive SAT practice',
                        )
                      "
                    >
                      Unlock practice
                    </button>
                  </div>
                </div>
              </section>
              <footer
                v-if="resultView === 'full' || resultView === 'improve'"
                class="report-footer full-report-footer"
              >
                <p>
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
                <section
                  v-if="resultsLocked"
                  class="results-lock-overlay"
                  role="status"
                  aria-live="polite"
                >
                  <h2>{{ resultsLockTitle }}</h2>
                  <p>{{ resultsLockDescription }}</p>
                </section>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <CommercialDemoController
      v-if="!isCourseOpen"
      :model-value="accessState"
      @update:model-value="setProAccess"
    />
    <aside
      v-else
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
              v-for="state in resultsAccessStates"
              :key="state.id"
              :class="[
                'mock-state-button',
                { active: resultsAccessState === state.id },
              ]"
              type="button"
              :aria-pressed="resultsAccessState === state.id"
              @click="setResultsAccessState(state.id)"
            >
              {{ state.label }}
            </button>
          </nav>
        </section>
      </template>
    </aside>
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
