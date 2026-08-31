# Solvely Exam Prep Package

A focused Vue demo for the Solvely exam-prep package. It keeps the application shell from `solvely-home-experiment`, removes the old sample-resource experiences, and connects the package's **Mock Exam** entry to the full mock-exam implementation from commit `d2445da`.

## Local development

```bash
npm install
npm run dev
```

Run `npm run build:data` after replacing source CSVs and `npm run verify` before deployment.

## EP V2 data contract

The demo runtime now follows the same layered storage contract as the iOS exam-prep package. The generated fixture data lives under `public/data/ep-v2`:

- `epPreparations/2001.json` — package metadata and outline only (Section → Topic Group → Topic)
- `epTopicContents/` — one `studyGuide`, `flashCard`, and `quiz` document per topic; the unique key is `epId + outlineId + topicId + contentType`
- `epExams/` — complete mock-exam documents, stored separately from the topic outline and learning content

The shared join keys are `packageId`, `epId`, `outlineId`, `topicGroupId`, and `topicId`. Topic pages load only the active content type, matching the iOS request pattern instead of downloading every study guide, flashcard, quiz, and mock exam with the package shell.

`src/data/satData.ts` is the Web adapter over this contract. A production integration can replace its static `fetch` calls with `/ep/detail`, `/ep/outline`, `/ep/outline/topic/learn`, and `/ep/exam` without changing the views. `public/data/sat` remains a generated legacy fixture for compatibility, but is no longer the active page data source.

## Experience scope

- `/` — SAT exam-prep overview, current exam blueprint, 100-topic breakdown, and two mock-exam entries
- `/topic/:topicId/study-guide` — embedded topic video followed by the complete study guide
- `/topic/:topicId/flashcards` — 20-card recall experience with flip, progress, review/mastered, star, shuffle, and list views
- `/topic/:topicId/quiz` — topic-mapped question bank with multiple-choice and student-produced responses
- `/mock-exam/1` and `/mock-exam/2` — two 98-question Digital SAT simulations based on the interaction model from commit `d2445da`

## SAT material coverage

- 100 topic videos and study guides
- 2,000 flashcards
- 3,879 mapped topic questions
- 2 full-length mock exams, 98 questions each
