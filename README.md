# Solvely Exam Prep Package

A focused Vue demo for the Solvely exam-prep package. It keeps the application shell from `solvely-home-experiment`, removes the old sample-resource experiences, and connects the package's **Mock Exam** entry to the full mock-exam implementation from commit `d2445da`.

## Local development

```bash
npm install
npm run dev
```

Run `npm run build:data` after replacing source CSVs and `npm run verify` before deployment.

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
