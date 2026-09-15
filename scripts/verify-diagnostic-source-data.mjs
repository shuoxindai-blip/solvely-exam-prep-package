import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const satPath = resolve(projectRoot, "src/data/satDiagnostic.ts");
const actPath = resolve(projectRoot, "src/data/actDiagnostic.ts");
const rendererPath = resolve(projectRoot, "src/views/MockExamView.vue");
const [satSource, actSource, rendererSource] = await Promise.all([
  readFile(satPath, "utf8"),
  readFile(actPath, "utf8"),
  readFile(rendererPath, "utf8"),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function count(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}

const satQuestions = count(satSource, /sourceQuestionId:\s*"[a-f0-9]{8}"/g);
const actSectionCounts = {
  English: count(actSource, /sourceQuestionId:\s*"ACT76C-ENG-/g),
  Mathematics: count(actSource, /sourceQuestionId:\s*"ACT76C-MATH-/g),
  Reading: count(actSource, /sourceQuestionId:\s*"ACT76C-READ-/g),
  Science: count(actSource, /sourceQuestionId:\s*"ACT76C-SCI-/g),
};

assert(satQuestions === 20, `Expected 20 SAT diagnostic questions, found ${satQuestions}.`);
assert(
  JSON.stringify(actSectionCounts) === JSON.stringify({ English: 10, Mathematics: 9, Reading: 7, Science: 7 }),
  `Unexpected ACT diagnostic section counts: ${JSON.stringify(actSectionCounts)}.`,
);
assert(
  /"STUDENT_PRODUCED_RESPONSE"/.test(satSource),
  "SAT diagnostic must retain Student-Produced Response questions.",
);
assert(
  /options:\s*\{\s*F:/.test(actSource) && /options:\s*\{\s*A:/.test(actSource),
  "ACT diagnostic must retain both F/G/H/J and A/B/C/D source labels.",
);

const requiredVisualBindings = [
  [satSource, "3f5a3602", "/assets/diagnostic/sat/system-graph.png"],
  [satSource, "85939da5", "/assets/diagnostic/sat/texting-table.png"],
  [actSource, "ACT76C-MATH-9", "/assets/diagnostic/act/parallel-lines.svg"],
  ...[8, 9, 10, 11, 12, 13, 14].map((number) => [
    actSource,
    `ACT76C-SCI-${number}`,
    "/assets/diagnostic/act/diet-cola-experiment.svg",
  ]),
];

for (const [source, questionId, assetUrl] of requiredVisualBindings) {
  const questionStart = source.indexOf(`sourceQuestionId: "${questionId}"`);
  const nextQuestionStart = source.indexOf("sourceQuestionId:", questionStart + 1);
  const questionBlock = source.slice(questionStart, nextQuestionStart < 0 ? undefined : nextQuestionStart);
  assert(questionStart >= 0, `Missing source question ${questionId}.`);
  assert(
    questionBlock.includes(`pictureUrl: "${assetUrl}"`),
    `${questionId} must retain its source visual ${assetUrl}.`,
  );
}

assert(
  rendererSource.includes('class="act-stimulus-gallery"') &&
    rendererSource.includes('class="math-stimulus-gallery"') &&
    count(rendererSource, /v-for="\(picture, pictureIndex\) in currentQuestion\.pictureUrls"/g) >= 2,
  "Mock exam must render source visuals in both passage and math layouts.",
);

const assetUrls = [...new Set(
  `${satSource}\n${actSource}`
    .match(/\/assets\/diagnostic\/[a-z0-9_./-]+\.(?:png|svg|webp|jpe?g)/gi) ?? [],
)];
assert(assetUrls.length === 4, `Expected 4 diagnostic visual assets, found ${assetUrls.length}.`);
await Promise.all(assetUrls.map((url) => access(resolve(projectRoot, "public", url.slice(1)))));

const assetStats = await Promise.all(assetUrls.map(async (url) => ({
  url,
  bytes: (await stat(resolve(projectRoot, "public", url.slice(1)))).size,
})));
for (const asset of assetStats) {
  assert(asset.bytes >= 1_000, `${asset.url} is unexpectedly small and may be incomplete.`);
}

const scienceVisual = await readFile(
  resolve(projectRoot, "public/assets/diagnostic/act/diet-cola-experiment.svg"),
  "utf8",
);
for (const label of ["Figure 1", "Table 1", "Table 2"]) {
  assert(scienceVisual.includes(label), `ACT science visual must retain ${label}.`);
}

console.log(JSON.stringify({
  status: "ok",
  satQuestions,
  actQuestions: Object.values(actSectionCounts).reduce((sum, value) => sum + value, 0),
  actSectionCounts,
  visualAssets: assetStats,
}, null, 2));
