import type { EpExam, EpExamQuestion } from "../types/epV2";

export const SAT_DIAGNOSTIC_QUESTIONS_PER_SECTION = 10;

type DiagnosticQuestion = {
  sourceQuestionId: string;
  sectionId: "reading-writing" | "math";
  sectionTitle: "Reading and Writing" | "Math";
  contentDomain: string;
  officialSkill: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  stem: string;
  options?: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  stimulusMaterial?: { id: string; title: string; type: string; body?: string; pictureUrl: string } | null;
};

const readingWritingQuestions: DiagnosticQuestion[] = [
  {
    sourceQuestionId: "f1bfbed3", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Information and Ideas", officialSkill: "Inferences", difficulty: "HARD",
    stem: "Marta Coll and colleagues’ 2010 Mediterranean Sea biodiversity census reported approximately 17,000 species, nearly double the number reported in Carlo Bianchi and Carla Morri’s 2000 census—a difference only partly attributable to the description of new invertebrate species in the interim. Another factor is that the morphological variability of microorganisms is poorly understood compared to that of vertebrates, invertebrates, plants, and algae, creating uncertainty about how to evaluate microorganisms as species. Researchers’ decisions on such matters therefore can be highly consequential. Indeed, the two censuses reported similar counts of vertebrate, plant, and algal species, suggesting that ______\nWhich choice most logically completes the text?",
    options: {
      A: "Coll and colleagues reported a much higher number of species than Bianchi and Morri did largely due to the inclusion of invertebrate species that had not been described at the time of Bianchi and Morri’s census.",
      B: "some differences observed in microorganisms may have been treated as variations within species by Bianchi and Morri but treated as indicative of distinct species by Coll and colleagues.",
      C: "Bianchi and Morri may have been less sensitive to the degree of morphological variation displayed within a typical species of microorganism than Coll and colleagues were.",
      D: "the absence of clarity regarding how to differentiate among species of microorganisms may have resulted in Coll and colleagues underestimating the number of microorganism species.",
    },
    correctAnswer: "B",
    explanation: "The two censuses reported similar vertebrate, plant, and algal counts, so the remaining difference most logically comes from classifying microorganism variation differently. Coll’s team may have counted as separate species organisms that Bianchi and Morri treated as variations within one species.",
  },
  {
    sourceQuestionId: "87aa7bab", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Information and Ideas", officialSkill: "Central Ideas and Details", difficulty: "MEDIUM",
    stem: "A common assumption among art historians is that the invention of photography in the mid-nineteenth century displaced the painted portrait in the public consciousness. The diminishing popularity of the portrait miniature, which coincided with the rise of photography, seems to support this claim. However, photography’s impact on the portrait miniature may be overstated. Although records from art exhibitions in the Netherlands from 1820 to 1892 show a decrease in the number of both full-sized and miniature portraits submitted, this trend was established before the invention of photography.\nBased on the text, what can be concluded about the diminishing popularity of the portrait miniature in the nineteenth century?",
    options: {
      A: "Factors other than the rise of photography may be more directly responsible for the portrait miniature’s decline.",
      B: "Although portrait miniatures became less common than photographs, they were widely regarded as having more artistic merit.",
      C: "The popularity of the portrait miniature likely persisted for longer than art historians have assumed.",
      D: "As demand for portrait miniatures decreased, portrait artists likely shifted their creative focus to photography.",
    },
    correctAnswer: "A",
    explanation: "The decline in submitted portraits began before photography was invented, so factors other than photography may be more directly responsible.",
  },
  {
    sourceQuestionId: "d73a908a", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Information and Ideas", officialSkill: "Central Ideas and Details", difficulty: "MEDIUM",
    stem: "Believing that living in an impractical space can heighten awareness and even improve health, conceptual artists Madeline Gins and Shusaku Arakawa designed an apartment building in Japan to be more fanciful than functional. A kitchen counter is chest-high on one side and knee-high on the other; a ceiling has a door to nowhere. The effect is disorienting but invigorating: after four years there, filmmaker Nobu Yamaoka reported significant health benefits.\nWhich choice best states the main idea of the text?",
    options: {
      A: "Although inhabiting a home surrounded by fanciful features such as those designed by Gins and Arakawa can be rejuvenating, it is unsustainable.",
      B: "Designing disorienting spaces like those in the Gins and Arakawa building is the most effective way to create a physically stimulating environment.",
      C: "As a filmmaker, Yamaoka has long supported the designs of conceptual artists such as Gins and Arakawa.",
      D: "Although impractical, the design of the apartment building by Gins and Arakawa may improve the well-being of the building’s residents.",
    },
    correctAnswer: "D",
    explanation: "The text presents the building’s impractical, disorienting features and then uses Yamaoka’s reported health benefits to suggest that the design may improve residents’ well-being.",
  },
  {
    sourceQuestionId: "d748c3fd", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Information and Ideas", officialSkill: "Inferences", difficulty: "MEDIUM",
    stem: "In her 2021 article “Throwaway History: Towards a Historiography of Ephemera,” scholar Anne Garner discusses John Johnson (1882–1956), a devoted collector of items intended to be discarded, including bus tickets and campaign pamphlets. Johnson recognized that scholarly institutions considered his expansive collection of ephemera to be worthless—indeed, it wasn’t until 1968, after Johnson’s death, that Oxford University’s Bodleian Library acquired the collection, having grasped the items’ potential value to historians and other researchers. Hence, the example of Johnson serves to ______\nWhich choice most logically completes the text?",
    options: {
      A: "demonstrate the difficulties faced by contemporary historians in conducting research at the Bodleian Library without access to ephemera.",
      B: "represent the challenge of incorporating examples of ephemera into the collections of libraries and other scholarly institutions.",
      C: "lend support to arguments by historians and other researchers who continue to assert that ephemera holds no value for scholars.",
      D: "illustrate both the relatively low scholarly regard in which ephemera was once held and the later recognition of ephemera’s possible utility.",
    },
    correctAnswer: "D",
    explanation: "Johnson’s collection was initially dismissed as worthless but was later acquired after its research value was recognized, illustrating both the earlier low regard and later appreciation of ephemera.",
  },
  {
    sourceQuestionId: "6b8a7c74", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Information and Ideas", officialSkill: "Inferences", difficulty: "HARD",
    stem: "One recognized social norm of gift giving is that the time spent obtaining a gift will be viewed as a reflection of the gift’s thoughtfulness. Marketing experts Farnoush Reshadi, Julian Givi, and Gopal Das addressed this view in their studies of norms specifically surrounding the giving of gift cards, noting that while recipients tend to view digital gift cards (which can be purchased online from anywhere and often can be redeemed online as well) as superior to physical gift cards (which sometimes must be purchased in person and may only be redeemable in person) in terms of usage, 94.8 percent of participants surveyed indicated that it is more socially acceptable to give a physical gift card to a recipient. This finding suggests that ______\nWhich choice most logically completes the text?",
    options: {
      A: "gift givers likely overestimate the amount of effort required to use digital gift cards and thus mistakenly assume gift recipients will view them as less desirable than physical gift cards.",
      B: "physical gift cards are likely preferred by gift recipients because the tangible nature of those cards offers a greater psychological sense of ownership than digital gift cards do.",
      C: "physical gift cards are likely less desirable to gift recipients than digital gift cards are because of the perception that physical gift cards require unnecessary effort to obtain.",
      D: "gift givers likely perceive digital gift cards as requiring relatively low effort to obtain and thus wrongly assume gift recipients will appreciate them less than they do physical gift cards.",
    },
    correctAnswer: "D",
    explanation: "Because gift-giving norms equate effort with thoughtfulness, givers may see easy-to-obtain digital cards as less thoughtful even though recipients prefer their usability.",
  },
  {
    sourceQuestionId: "de55ec71", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Standard English Conventions", officialSkill: "Boundaries", difficulty: "EASY",
    stem: "Generations of mystery and horror ______ have been influenced by the dark, gothic stories of celebrated American author Edgar Allan Poe (1809–1849).\nWhich choice completes the text so that it conforms to the conventions of Standard English?",
    options: { A: "writers", B: "writers,", C: "writers—", D: "writers;" }, correctAnswer: "A",
    explanation: "No punctuation is needed between the complete subject “Generations of mystery and horror writers” and the verb “have been influenced.”",
  },
  {
    sourceQuestionId: "c3397d25", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Standard English Conventions", officialSkill: "Boundaries", difficulty: "MEDIUM",
    stem: "Since the nineteenth century, Egyptologists have commonly divided ancient Egyptian history into three primary ______ Old Kingdom (2700–2200 BCE), the Middle Kingdom (2050–1800 BCE), and the New Kingdom (1550–1100 BCE). Some historians, however, criticize the names of these periods for revealing more about the culture of the mainly European Egyptologists than that of ancient Egypt itself.\nWhich choice completes the text so that it conforms to the conventions of Standard English?",
    options: { A: "periods. The", B: "periods: the", C: "periods; the", D: "periods, the" }, correctAnswer: "B",
    explanation: "A colon correctly follows the independent clause and introduces the list of the three periods.",
  },
  {
    sourceQuestionId: "e38b3e4f", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Standard English Conventions", officialSkill: "Form, Structure, and Sense", difficulty: "EASY",
    stem: "The radiation that ______ during the decay of radioactive atomic nuclei is known as gamma radiation.\nWhich choice completes the text so that it conforms to the conventions of Standard English?",
    options: { A: "occurs", B: "have occurred", C: "occur", D: "are occurring" }, correctAnswer: "A",
    explanation: "The singular verb “occurs” agrees with the singular subject “radiation.”",
  },
  {
    sourceQuestionId: "89fbc3eb", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Standard English Conventions", officialSkill: "Boundaries", difficulty: "MEDIUM",
    stem: "The Mission 66 initiative, which was approved by Congress in 1956, represented a major investment in the infrastructure of overburdened national ______ it prioritized physical improvements to the parks’ roads, utilities, employee housing, and visitor facilities while also establishing educational programming for the public.\nWhich choice completes the text so that it conforms to the conventions of Standard English?",
    options: { A: "parks and", B: "parks", C: "parks;", D: "parks," }, correctAnswer: "C",
    explanation: "A semicolon correctly joins the two independent clauses ending with “parks” and beginning with “it prioritized.”",
  },
  {
    sourceQuestionId: "960dec02", sectionId: "reading-writing", sectionTitle: "Reading and Writing",
    contentDomain: "Standard English Conventions", officialSkill: "Boundaries", difficulty: "HARD",
    stem: "A recent study tracked the number of bee species present in twenty-seven New York apple orchards over a ten-year period. ______ found that when wild growth near an orchard was cleared, the number of different bee species visiting the orchard decreased.\nWhich choice completes the text so that it conforms to the conventions of Standard English?",
    options: { A: "Entomologist Heather Grab:", B: "Entomologist, Heather Grab,", C: "Entomologist Heather Grab", D: "Entomologist Heather Grab," }, correctAnswer: "C",
    explanation: "No punctuation is needed between the title and name or between the subject “Entomologist Heather Grab” and the verb “found.”",
  },
];

const mathQuestions: DiagnosticQuestion[] = [
  {
    sourceQuestionId: "ac472881", sectionId: "math", sectionTitle: "Math", contentDomain: "Algebra",
    officialSkill: "Linear equations in one variable", difficulty: "HARD",
    stem: "(12x + 28) / 4 − s / 13 = r(x − 8)\n\nIn the given equation, s and r are constants, and s > 0. If the equation has infinitely many solutions, what is the value of s?\nEnter your answer.",
    correctAnswer: "403",
    explanation: "Rewrite the equation as 3x + 7 − s/13 = rx − 8r. Infinitely many solutions require r = 3 and 7 − s/13 = −24, so s/13 = 31 and s = 403.",
  },
  {
    sourceQuestionId: "3f5a3602", sectionId: "math", sectionTitle: "Math", contentDomain: "Algebra",
    officialSkill: "Systems of two linear equations in two variables", difficulty: "HARD",
    stem: "What system of linear equations is represented by the lines shown?",
    options: {
      A: "8x + 4y = 32\n−10x − 4y = −64", B: "8x − 4y = 32\n−10x + 4y = −64",
      C: "4x − 10y = 32\n−8x + 10y = −64", D: "4x + 10y = 32\n−8x − 10y = −64",
    },
    correctAnswer: "D",
    explanation: "The lines pass through (−2, 4) and (8, 0), and through (−2, 8) and (8, 0). Their equations are equivalent to 4x + 10y = 32 and −8x − 10y = −64.",
    stimulusMaterial: { id: "sat-math-system-graph", title: "Two lines in the xy-plane", type: "Graph", pictureUrl: "/assets/diagnostic/sat/system-graph.png" },
  },
  {
    sourceQuestionId: "3d1070c9", sectionId: "math", sectionTitle: "Math", contentDomain: "Algebra",
    officialSkill: "Linear functions", difficulty: "EASY",
    stem: "The function f is defined by f(x) = 25x + 30. What is the value of f(x) when x = 2?",
    options: { A: "50", B: "57", C: "80", D: "110" }, correctAnswer: "C",
    explanation: "Substitute x = 2: f(2) = 25(2) + 30 = 80.",
  },
  {
    sourceQuestionId: "002dba45", sectionId: "math", sectionTitle: "Math", contentDomain: "Algebra",
    officialSkill: "Linear equations in two variables", difficulty: "MEDIUM",
    stem: "Line k is defined by y = −(17/3)x + 5. Line j is perpendicular to line k in the xy-plane. What is the slope of line j?\nEnter your answer.",
    correctAnswer: "3/17",
    explanation: "A perpendicular line has the negative reciprocal slope. The negative reciprocal of −17/3 is 3/17 (about 0.176).",
  },
  {
    sourceQuestionId: "edc1b7b7", sectionId: "math", sectionTitle: "Math", contentDomain: "Algebra",
    officialSkill: "Systems of two linear equations in two variables", difficulty: "HARD",
    stem: "2(8x) + 4(7y) = 12\n−2(8x) + 4(7y) = 12\n\nThe solution to the given system of equations is (x, y). What is the value of 8x + 7y?\nEnter your answer.",
    correctAnswer: "3",
    explanation: "Adding the equations gives 8(7y) = 24, so 7y = 3. Substitution gives 8x = 0; therefore 8x + 7y = 3.",
  },
  {
    sourceQuestionId: "85939da5", sectionId: "math", sectionTitle: "Math", contentDomain: "Problem-Solving and Data Analysis",
    officialSkill: "Inference from sample statistics and margin of error", difficulty: "HARD",
    stem: "In a study of cell phone use, 799 randomly selected US teens were asked how often they talked on a cell phone and about their texting behavior. The data are summarized in the table above. Based on the data from the study, an estimate of the percent of US teens who are heavy texters is 30% and the associated margin of error is 3%. Which of the following is a correct statement based on the given margin of error?",
    options: {
      A: "Approximately 3% of the teens in the study who are classified as heavy texters are not really heavy texters.",
      B: "It is not possible that the percent of all US teens who are heavy texters is less than 27%.",
      C: "The percent of all US teens who are heavy texters is 33%.",
      D: "It is doubtful that the percent of all US teens who are heavy texters is 35%.",
    },
    correctAnswer: "D",
    explanation: "A 3% margin of error around 30% gives a likely interval from 27% to 33%. A value of 35% is outside that interval and is therefore doubtful.",
    stimulusMaterial: { id: "sat-texting-table", title: "Texting behavior and cell phone use", type: "Table", pictureUrl: "/assets/diagnostic/sat/texting-table.png" },
  },
  {
    sourceQuestionId: "3c8fdc40", sectionId: "math", sectionTitle: "Math", contentDomain: "Problem-Solving and Data Analysis",
    officialSkill: "Ratios, rates, proportional relationships, and units", difficulty: "EASY",
    stem: "A printer produces posters at a constant rate of 42 posters per minute. At what rate, in posters per hour, does the printer produce the posters?\nEnter your answer.",
    correctAnswer: "2520",
    explanation: "There are 60 minutes in one hour, so 42 × 60 = 2,520 posters per hour.",
  },
  {
    sourceQuestionId: "eccbf957", sectionId: "math", sectionTitle: "Math", contentDomain: "Problem-Solving and Data Analysis",
    officialSkill: "Probability and conditional probability", difficulty: "EASY",
    stem: "Each face of a fair 14-sided die is labeled with a number from 1 through 14, with a different number appearing on each face. If the die is rolled one time, what is the probability of rolling a 2?",
    options: { A: "1/14", B: "2/14", C: "12/14", D: "13/14" }, correctAnswer: "A",
    explanation: "Exactly one of the 14 equally likely faces is labeled 2, so the probability is 1/14.",
  },
  {
    sourceQuestionId: "affb2315", sectionId: "math", sectionTitle: "Math", contentDomain: "Problem-Solving and Data Analysis",
    officialSkill: "Inference from sample statistics and margin of error", difficulty: "EASY",
    stem: "There are 55 students in Spanish club. A sample of the Spanish club students was selected at random and asked whether they intend to enroll in a new study program. Of those surveyed, 20% responded that they intend to enroll in the study program. Based on this survey, which of the following is the best estimate of the total number of Spanish club students who intend to enroll in the study program?",
    options: { A: "11", B: "20", C: "44", D: "55" }, correctAnswer: "A",
    explanation: "Use the sample proportion to estimate the club total: 55 × 0.20 = 11 students.",
  },
  {
    sourceQuestionId: "954943a4", sectionId: "math", sectionTitle: "Math", contentDomain: "Problem-Solving and Data Analysis",
    officialSkill: "Percentages", difficulty: "HARD",
    stem: "Jennifer bought a box of Crunchy Grain cereal. The nutrition facts state that a serving size is 3/4 cup and provides 210 calories, 50 of which are calories from fat. Each serving also provides 180 milligrams of potassium, which is 5% of the daily allowance for adults. If p percent of an adult’s daily allowance of potassium is provided by x servings per day, which expression gives p in terms of x?",
    options: { A: "p = 0.5x", B: "p = 5x", C: "p = (0.05)ˣ", D: "p = (1.05)ˣ" }, correctAnswer: "B",
    explanation: "Each serving provides 5 percentage points of the daily allowance, so x servings provide p = 5x percent.",
  },
];

function toExamQuestion(question: DiagnosticQuestion, index: number): EpExamQuestion {
  const responseType = question.options ? "MULTIPLE_CHOICE" : "STUDENT_PRODUCED_RESPONSE";
  return {
    id: 19000001 + index, sourceQuestionId: question.sourceQuestionId, index: index + 1,
    topicGroupId: question.sectionId === "math" ? 110005 : 110001,
    topicId: question.sectionId === "math" ? 120040 : 120001,
    sectionId: question.sectionId, sectionTitle: question.sectionTitle, module: "Module 1", route: "diagnostic",
    contentDomain: question.contentDomain, officialSkill: question.officialSkill, teachingTopic: question.officialSkill,
    difficulty: question.difficulty, secondaryClassification: "College Board sample question", isScored: true,
    maximumRawPoints: 1, responseType, type: responseType, stem: question.stem, options: question.options ?? {},
    correctAnswer: question.correctAnswer, explanation: question.explanation, stimulusMaterial: question.stimulusMaterial ?? null,
    attachments: [], scoreDetail: null, userAnswer: null, isCorrect: -1,
  };
}

export function buildSatDiagnosticExam(exam: EpExam): EpExam {
  const questions = [...readingWritingQuestions, ...mathQuestions].map(toExamQuestion);
  return {
    ...exam, _id: 10, exam: "Free SAT Diagnostic Test", examCode: "SAT-DIAGNOSTIC-COLLEGE-BOARD-20Q",
    totalCount: questions.length, questions, result: null,
  };
}
