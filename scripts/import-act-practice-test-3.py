#!/usr/bin/env python3
"""Import ACT Practice Test 3 into the demo's EP V2 exam schema.

The source PDF is treated as the visual/content source of truth. The official
scoring key is treated as the answer/scoring source of truth. Question copy is
stored as live text (with explicit LaTeX delimiters for mathematics). Only
figures, graphs, diagrams, and tables are rasterized from the source PDF.
"""

from __future__ import annotations

import json
import os
import re
from collections import OrderedDict
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Iterable

import fitz
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
PRIVATE_SOURCE_ROOT = ROOT / "source-pdfs/act-practice-test-3"
FORM_PDF = Path(os.environ.get("ACT_FORM_PDF", PRIVATE_SOURCE_ROOT / "ACT-Test-Prep-ACT-Practice-Test-3-Form.pdf"))
KEY_PDF = Path(os.environ.get("ACT_KEY_PDF", PRIVATE_SOURCE_ROOT / "ACT-Online-Practice-Test-3-Scoring-Key.pdf"))
OUTPUT_JSON = ROOT / "public/data/act/ep-v2/epExams/1.json"
ASSET_ROOT = ROOT / "public/assets/act-practice-test-3"

SECTION_PAGES = {
    "English": range(3, 15),
    "Mathematics": range(15, 27),
    "Reading": range(27, 35),
    "Science": range(35, 49),
}
SECTION_TOTALS = {"English": 50, "Mathematics": 45, "Reading": 36, "Science": 40}
SECTION_IDS = {"English": "english", "Mathematics": "mathematics", "Reading": "reading", "Science": "science"}

ANSWER_KEYS = {
    "English": "A F B J B J D H B G B J A H D H D F A H C H A G C J C G B F C J A G C F B F C J A G D G D H C J A G".split(),
    "Mathematics": "B J B H B H C J D G A J B J B F C G A J A F B H A H B G B H B F D F C J C G C J A J A H D".split(),
    "Reading": "B H A G D F C G C G D F D J A H A H A F A G A H B G A J C F C J D H A F".split(),
    "Science": "D H C F B G B J A J D G A H B J A G B H C H B G C J A F D F B F B J D H C J B F".split(),
}

UNSCORED = {
    "English": set(range(11, 21)),
    "Mathematics": {6, 18, 29, 40},
    "Reading": set(range(10, 19)),
    "Science": set(range(11, 17)),
}

REPORTING_CATEGORY_NAMES = {
    "POW": "Production of Writing",
    "KLA": "Knowledge of Language",
    "CSE": "Conventions of Standard English",
    "A": "Algebra",
    "F": "Functions",
    "G": "Geometry",
    "N": "Number & Quantity",
    "S": "Statistics & Probability",
    "IES": "Integrating Essential Skills",
    "KID": "Key Ideas and Details",
    "CS": "Craft and Structure",
    "IKI": "Integration of Knowledge and Ideas",
    "IOD": "Interpretation of Data",
    "SIN": "Scientific Investigation",
    "EMI": "Evaluation of Models, Inferences, and Experimental Results",
}

READING_PASSAGES = [
    {
        "range": range(1, 10),
        "title": "Innovating Women and Life in Code",
        "type": "Literary Narrative · Paired Passages",
        "segments": [(27, 0, 300, 735), (27, 1, 270, 735), (28, 0, 70, 282)],
    },
    {
        "range": range(10, 19),
        "title": "Why People Overlook Subtractive Solutions",
        "type": "Informational Passage",
        "segments": [(29, 0, 155, 735), (29, 1, 70, 735)],
        "picture": "reading-passage-02-table.webp",
    },
    {
        "range": range(19, 28),
        "title": "Naturalist",
        "type": "Informational Passage",
        "segments": [(31, 0, 145, 735), (31, 1, 70, 735)],
    },
    {
        "range": range(28, 37),
        "title": "On the Rise: Victor Quijada",
        "type": "Informational Passage",
        "segments": [(33, 0, 130, 735), (33, 1, 70, 735)],
    },
]

ENGLISH_PASSAGE_RANGES = [range(1, 6), range(6, 11), range(11, 21), range(21, 31), range(31, 41), range(41, 51)]

SCIENCE_PASSAGES = [
    {"range": range(1, 6), "title": "β-Agarase Activity", "type": "Data Representation", "segments": [(35, 0), (35, 1), (36, 0)]},
    {"range": range(6, 11), "title": "Vermicompost and Tomato Growth", "type": "Data Representation", "segments": [(37, 0), (37, 1)]},
    {"range": range(11, 17), "title": "Pollination in Heliconia metallica", "type": "Research Summary", "segments": [(39, 0), (39, 1)]},
    {"range": range(17, 23), "title": "Arsenic and Antimony in Aquifers", "type": "Research Summary", "segments": [(41, 0), (41, 1), (42, 0)]},
    {"range": range(23, 29), "title": "Pressure, Volume, and Temperature of Nitrogen", "type": "Research Summary", "segments": [(43, 0), (43, 1), (44, 0)]},
    {"range": range(29, 35), "title": "Voltmeter Circuit Studies", "type": "Research Summary", "segments": [(45, 0), (45, 1)]},
    {"range": range(35, 41), "title": "Distilling an Ethanol–Water Mixture", "type": "Conflicting Viewpoints", "segments": [(47, 0), (47, 1)]},
]

WRITING_PROMPT = {
    "title": "Texting",
    "issue": (
        "Texting is quick and simple, and many people are coming to depend on it as one of their primary sources of communication. "
        "People use texting to carry out personal and professional relationships, sending texts about everything from feelings to shopping lists to business deals. "
        "But while we gain speed and efficiency in texting, we lose a lot, too. Texts tend to lack the meaning available in body language, tone of voice, and other elements of context. "
        "In light of these limitations, are we wise to depend on texting as a primary form of communication?"
    ),
    "perspectives": [
        {
            "label": "Perspective One",
            "body": "Texting relies on partial thoughts, emoji, and single words instead of sentences. This tends to result in confusion and too often leads to hurt feelings and serious misunderstandings.",
        },
        {
            "label": "Perspective Two",
            "body": "Texting enables you to quickly focus on what is important. Body language and tone of voice can be distracting, but texts allow you to say just what needs to be said.",
        },
        {
            "label": "Perspective Three",
            "body": "When people text all the time, they develop an expectation for short communication. As a result, people don’t have the patience for conversations that require time and effort.",
        },
    ],
    "task": (
        "Write a unified, coherent essay in which you address the question of whether we are wise to depend on texting as a primary form of communication. "
        "Clearly state your own perspective and analyze its relationship to at least one other perspective. Develop and support your ideas with reasoning and examples, organize them clearly and logically, and communicate in standard written English."
    ),
}


# PyMuPDF's plain-text order is not reliable for stacked fractions, radicals,
# matrices, superscripts, or diagram labels. These faithful transcriptions keep
# every Mathematics stem and option as selectable web text while giving KaTeX
# unambiguous source. Original PDF crops are used only for the 12 questions
# whose figures, graphs, or tables carry essential visual information.
MATH_TEXT = {
    1: ("In the section of Middleton shown on the given map, the avenues and boulevards form a uniform square grid. At the annual Middleton Scavenger Hunt, the winners receive wonderful prizes. Clue 1 states that Clue 2 will be found exactly halfway between the corner of Main and Oak and the corner of 4th and Elm along the straight line between the two corners. On which avenue is Clue 2 located?", ["1st", "2nd", "3rd", "4th"]),
    2: ("The mean of 4 numbers is 45. The first 3 numbers are 26, 39, and 58. What is the value of the last number?", ["12", "32", "42", "57"]),
    3: (r"When $a=7$, $b=-4$, and $c=5$, what is the value of $abc-ac^2-ab$?", [r"$-343$", r"$-287$", r"$-63$", r"$7$"]),
    4: (r"In the standard $(x,y)$ coordinate plane, the vertices of a rectangle are $A(1,1)$, $B(5,1)$, $C(5,3)$, and $D(1,3)$. The rectangle is translated to the right 2 units and then down 5 units. What are the new coordinates of point $B$ after these translations are performed on the rectangle?", [r"$(0,3)$", r"$(3,-1)$", r"$(7,-4)$", r"$(10,-1)$"]),
    5: ("A certain garden has 8 rows of pumpkins with 7 pumpkins in each row. One afternoon the gardener harvested 4 of the rows of pumpkins. That night a tree branch fell and damaged half of the remaining pumpkins. How many pumpkins were damaged by the branch?", ["2", "14", "26", "28"]),
    6: (r"A certain triangle has interior angle measures of $(6x)^\circ$, $(2x)^\circ$, and $x^\circ$. What is the value of $x$?", ["9", "12", "20", "57"]),
    7: (r"An absolute value function is shown in the standard $(x,y)$ coordinate plane. Which of the following lists all the $x$-intercepts of the graph?", [r"$(0,-3)$ only", r"$(2,-5)$ only", r"$(-3,0)$ and $(7,0)$", r"$(-3,0)$, $(0,-3)$, and $(7,0)$"]),
    8: (r"Given $i=\sqrt{-1}$, what is $\sqrt{9}+\sqrt{-144}$?", [r"$3\sqrt{15}$", r"$3\sqrt{15}i$", r"$3-12i$", r"$3+12i$"]),
    9: (r"The table gives observed data values for variables $x$ and $y$. Among all equations of the form $y=kx$ such that $k$ is an integer, there is 1 equation that best fits the data in the table. Based on that equation, which of the following values is closest to the predicted $y$-value for an $x$-value of 66.00?", ["231", "385", "550", "792"]),
    10: (r"If $\lvert 4x-3\rvert=7$, which of the following is a possible value for $x$?", [r"$-3$", r"$-1$", r"$1$", r"$3$"]),
    11: ("The fairness of a particular coin is being investigated by flipping the coin. Which of the following experiment results provides the most evidence that the coin is not fair?", ["1 out of 170,000 flips is a tail.", "17 out of 17,000 flips are tails.", "170 out of 1,700 flips are heads.", "1,700 out of 17,000 flips are heads."]),
    12: (r"Which of the following is equivalent to the expression $3xy^2-4x^2y+12x^2y-7xy^2$?", [r"$-8x^2y+4xy^2$", r"$-x^2y+5xy^2$", r"$x^2y-5xy^2$", r"$8x^2y-4xy^2$"]),
    13: ("A restaurant conducted a survey to determine whether or not its customers like white cake and chocolate cake. The table shows the results of the survey. To the nearest whole number, what percent of the customers surveyed like white cake?", ["28%", "44%", "63%", "77%"]),
    14: (r"The 1st through 5th terms, in order, of an infinite arithmetic sequence are $-3$, $-7$, $-11$, $-15$, and $-19$. What is the 21st term of the sequence?", [r"$-63$", r"$-77$", r"$-79$", r"$-83$"]),
    15: (r"All students in a middle school responded either “Yes,” “No,” or “I don't know” to the question “Do you plan to attend a 4-year college?” The table gives the number of students in each grade who responded. Two numbers are represented by $x$ and $y$. The probability that a randomly selected student from this middle school responded “Yes” given that the student is in 7th grade is $\frac{49}{139}$. One of the following is the value of $y$. Which one?", ["16", "19", "22", "58"]),
    16: (r"If $(x+k)^2=x^2+94x+k^2$, then $k=$?", ["47", "94", "188", "376"]),
    17: (r"Given that $f(x)=-10+x$ and $g(x)=2$, it must be true that $\frac{f}{g}(x)=$?", [r"$-10+\frac{x}{2}$", r"$-10+2x$", r"$-5+\frac{x}{2}$", r"$-5+2x$"]),
    18: (r"Deon often flies his kite. He can only fly his kite on days with wind. He does not fly his kite on every day with wind. For any given day, let Event $A$ be that there is wind and let Event $B$ be that Deon flies his kite. Which of the following values can $P(A\text{ and }B)$ be?", ["0", "0.5", "1", "1.5"]),
    19: ("To determine the number of frogs in a swamp, a biologist catches a random sample of 400 frogs, tags them, and releases them back into the swamp. Four weeks later, the biologist catches a random sample of 140 frogs from this swamp, and 70 of them have tags. Based on these samples, which of the following is the best estimate of the number of frogs in the swamp?", ["800", "1,080", "3,086", "3,920"]),
    20: (r"The inequality $7(x+4)>8(x-2)$ is equivalent to which of the following inequalities?", [r"$x<2$", r"$x<6$", r"$x<12$", r"$x<44$"]),
    21: (r"In the figure shown, $\overrightarrow{PR}$ bisects $\angle QPS$, $m\angle QPS=64^\circ$, and $m\angle RPS=(2x+10)^\circ$. What is the value of $x$?", ["11", "21", "27", "53"]),
    22: (r"Given that $\sin\theta=\frac{1}{3}$ and $\cos\theta=\frac{2\sqrt{2}}{3}$, what is $\tan\theta$?", [r"$\frac{1}{2\sqrt{2}}$", r"$\frac{3}{2\sqrt{2}}$", r"$\frac{2\sqrt{2}}{3}$", r"$2\sqrt{2}$"]),
    23: (r"The graph of $4(x+1)^2-5(y+9)^2=100$ is a hyperbola in the standard $(x,y)$ coordinate plane. What is the point of intersection of the hyperbola's asymptotes?", [r"$(-4,5)$", r"$(-1,-9)$", r"$(1,9)$", r"$(4,-5)$"]),
    24: (r"$(\sqrt{3}+\sqrt{7})^2=$?", ["$10$", r"$10+\sqrt{42}$", r"$10+2\sqrt{21}$", r"$2\sqrt{3}+2\sqrt{7}$"]),
    25: (r"Lines $j$ and $k$ are graphed in the given standard $(x,y)$ coordinate plane. The coordinates at each of the intercepts are integers. Line $k$ is horizontal. One of the following ordered pairs is the point of intersection of lines $j$ and $k$. Which one?", [r"$\left(-\frac{35}{2},-6\right)$", r"$\left(-\frac{56}{5},-6\right)$", r"$\left(-\frac{74}{5},-6\right)$", r"$\left(-6,-\frac{74}{5}\right)$"]),
    26: ("Each of a doctor's 70 patients is insured by 1 of 4 companies. For each company, the table lists the number of her patients that have and do not have a flexible savings account (FSA). One of her patients will be randomly selected. What is the probability that the selected patient does not have an FSA, given that the patient is insured by Company A?", [r"$\frac{1}{20}$", r"$\frac{5}{7}$", r"$\frac{5}{12}$", r"$\frac{20}{33}$"]),
    27: (r"Rectangle $R$ has vertices $(-4,3)$, $(2,3)$, $(2,-2)$, and $(-4,-2)$ in the standard $(x,y)$ coordinate plane. Reflecting $R$ across the $x$-axis will result in rectangle $R'$. Reflecting $R'$ across the $y$-axis will result in rectangle $R''$. Which of the following clockwise rotations about the origin on $R''$ will result in $R$?", [r"$90^\circ$", r"$180^\circ$", r"$270^\circ$", r"$360^\circ$"]),
    28: (r"Let $f(x)=-x+5$ and $g(x)=4x^2+8x-4$. One of the following points is a point of intersection of the graphs of $y=f(x)$ and $y=g(x)$ in the standard $(x,y)$ coordinate plane. Which one?", [r"$\left(-3,\frac{3}{4}\right)$", r"$(-3,8)$", r"$\left(\frac{3}{4},-3\right)$", r"$\left(\frac{3}{4},\frac{23}{4}\right)$"]),
    29: ("In a particular cleaning solution, the ratio of concentrated solution to water is 3:40. How many cups of concentrated solution should be added to 5 gallons of water to make the cleaning solution in the given ratio? (Note: 4 cups = 1 quart; 4 quarts = 1 gallon)", ["12", "6", r"$1\frac{1}{2}$", r"$\frac{3}{8}$"]),
    30: (r"Points $K$ and $W$ are on the given circle with center $C$ such that $\overline{WK}=5\sqrt{2}$ inches and the measure of $\angle WCK$ is $90^\circ$. What is the area, to the nearest 0.1 square inch, of the circle?", ["31.4", "39.3", "78.5", "157.1"]),
    31: (r"A formula was evaluated with the nonzero real numbers $a$, $b$, $m$, and $d$. The resulting equation $a=bmd$ is not true, but it becomes a true equation when $m$ is increased by $n$. Which of the following equations gives $n$ in terms of $a$, $b$, $m$, and $d$?", [r"$n=\frac{a}{d}-bm$", r"$n=\frac{a}{bd}-m$", r"$n=\frac{a-d}{b}-m$", r"$n=\frac{a-bm}{d}$"]),
    32: (r"As given, a right pyramid has a square base, $PQRS$, and a vertex, $T$. Points $M$ and $N$ are the midpoints of $\overline{PQ}$ and $\overline{RS}$. The height of the pyramid is 12 cm, and each side length of the base is 5 cm. Among the following cross sections, which one has the greatest area? (Note: The figure is not drawn to scale.)", [r"$\triangle PRT$", r"$\triangle QRT$", r"$\triangle MNT$", "square $PQRS$"]),
    33: (r"In the given figure, $\overline{AB}$ and $\overline{CD}$ are perpendicular diameters of the circle centered at $O$. The unshaded areas are made up of a circle, with $\overline{OA}$ as a diameter, and a triangle with vertices at $O$, $B$, and $C$. Given that $\overline{OA}$ is 12 centimeters long, which of the following values is closest to the area, in square centimeters, of the shaded region inside the circle centered at $O$?", ["154", "195", "226", "267"]),
    34: (r"The function $p$ is defined by $p(x)=-4x^2$. The function $r$ is defined by $r(x)=p(x+6)$. The graph of $y=r(x)$ in the standard $(x,y)$ coordinate plane is the graph of $y=p(x)$:", ["shifted in the negative $x$-direction 6 coordinate units.", "shifted in the negative $y$-direction 6 coordinate units.", "shifted in the positive $y$-direction 6 coordinate units.", "stretched in the $x$-direction by a factor of 6."]),
    35: (r"The equation $a\begin{bmatrix}5 & b \\ 1 & bc\end{bmatrix}=\begin{bmatrix}10 & 2 \\ c & d\end{bmatrix}$ is true for the fixed real numbers $a$, $b$, $c$, and $d$. What is the value of $d$?", ["1", "2", "4", "8"]),
    36: (r"Let $a$ and $b$ represent positive real numbers with the property $\lvert a-b-1\rvert>0$. Which of the following statements about $a$ and $b$ cannot be true?", [r"$a=b$", r"$a>b$", r"$a-b<1$", r"$a-b=1$"]),
    37: ("Haruka is a long-distance runner who competes both in 10,000-meter races and in marathons, which are run over a distance of 26.2 miles. Given that 1.0 mile is approximately 1.6 kilometers, which of the following distances, in kilometers, is closest to the difference between the distances Haruka runs in a marathon and in a 10,000-meter race?", ["16.2", "16.4", "31.9", "41.9"]),
    38: (r"What is the value of $\cos\left(\arcsin\left(\frac{8}{17}\right)\right)$?", [r"$\frac{8}{17}$", r"$\frac{15}{17}$", r"$\frac{8}{15}$", r"$\frac{17}{8}$"]),
    39: (r"An object is launched vertically at 44.1 meters per second from a 931-meter-tall platform. The function $s=-4.9t^2+44.1t+931$ gives the object's height, $s$ meters, at the time $t$ seconds after launch. What is the greatest height, to the nearest 0.1 meters, the object can reach?", ["198.5", "935.5", "1,030.2", "1,129.5"]),
    40: (r"The table gives values of $f(x)$, $g(x)$, and $h(x)$ for all positive integers $x\le 5$. Given $h(f(g(a)))=1$ where $a$ is a positive integer less than or equal to 5, what is the value of $a$?", ["2", "3", "4", "5"]),
    41: (r"For all $x$ and $y$ such that $y=\log_{10}(2x)$, which of the following expressions is equal to $x$?", [r"$\left(\frac{1}{2}\right)10^y$", r"$10^{y-2}$", r"$10^{\sqrt{y}}$", r"$10^{2y}$"]),
    42: (r"What is the binomial expansion of $(x-5)^4$?", [r"$x^4+625$", r"$x^4-20x^2+625$", r"$x^4-5x^3+25x^2-125x+625$", r"$x^4-20x^3+150x^2-500x+625$"]),
    43: (r"Triangle A has an area of $16\sqrt{3}$ square feet. Triangle B is the result of a dilation on Triangle A and has sides that are $\frac{1}{2}$ as long as the corresponding sides of Triangle A. What is the area, in square feet, of Triangle B?", [r"$4\sqrt{3}$", r"$4\sqrt{6}$", r"$8\sqrt{3}$", r"$8\sqrt{6}$"]),
    44: (r"The probability distribution for the random variable $X$ is given in the table. What is the expected value of $X$?", ["0.3", "9.5", "9.7", "10.0"]),
    45: ("A skater's speed increased over a 6-second interval. His initial speed was 4 meters per second, and his speed 6 seconds later was 6 meters per second. Which of the following was the average rate of change of the skater's speed over this 6-second interval?", ["2 meters per second", "12 meters per second per second", r"$\frac{1}{3}$ meter per second", r"$\frac{1}{3}$ meter per second per second"]),
}


@dataclass
class PdfLine:
    page: int
    col: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    font: str
    size: float
    spans: list[dict]


@dataclass
class ParsedQuestion:
    number: int
    page: int
    col: int
    y0: float
    stem_lines: list[PdfLine]
    options: OrderedDict[str, list[PdfLine]]


def normalize_space(value: str) -> str:
    value = value.replace("\u00ad", "").replace("\ufb01", "fi").replace("\ufb02", "fl")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s+([,.;:?!])", r"\1", value)
    value = re.sub(r"([(−])\s+", r"\1", value)
    value = re.sub(r"\s+([)])", r"\1", value)
    return value.strip()


def clean_extracted(value: str) -> str:
    value = re.split(r"(?:QU00002|GO ON TO THE NEXT PAGE|DO YOUR FIGURING HERE|STOP!|DO NOT RETURN|END OF TEST|© 2026 by ACT)", value)[0]
    value = value.replace(" _ ", "/").replace(" − ", " − ")
    return normalize_space(value)


def normalize_science_notation(value: str) -> str:
    replacements = {
        "Ca2+": "Ca²⁺",
        "Mg2+": "Mg²⁺",
        "Na+": "Na⁺",
        "K+": "K⁺",
        "H2O": "H₂O",
        "N2": "N₂",
        "CO2": "CO₂",
        "R1": "R₁",
        "R2": "R₂",
        "RV": "Rᵥ",
        "V1": "V₁",
    }
    for source, replacement in replacements.items():
        value = re.sub(
            rf"(?<![A-Za-z0-9]){re.escape(source)}(?![A-Za-z0-9])",
            replacement,
            value,
        )
    return value


def lines_for_page(page: fitz.Page) -> list[PdfLine]:
    result: list[PdfLine] = []
    data = page.get_text("dict", sort=True)
    for block in data["blocks"]:
        if "lines" not in block:
            continue
        for raw_line in block["lines"]:
            spans = raw_line.get("spans", [])
            text = "".join(span.get("text", "") for span in spans).strip()
            if not text or not spans:
                continue
            x0, y0, x1, y1 = raw_line["bbox"]
            result.append(PdfLine(page.number, 0 if x0 < 306 else 1, x0, y0, x1, y1, text, spans[0].get("font", ""), spans[0].get("size", 0), spans))
    return result


def question_lines(document: fitz.Document, section: str) -> list[PdfLine]:
    result: list[PdfLine] = []
    for page_number in SECTION_PAGES[section]:
        for line in lines_for_page(document[page_number]):
            if line.y0 < 60 or line.y0 > 745:
                continue
            if section == "English" and line.col == 0:
                continue
            if section == "Mathematics" and line.col == 1:
                continue
            result.append(line)
    return result


def parse_questions(document: fitz.Document, section: str) -> list[ParsedQuestion]:
    start_re = re.compile(r"^\s*(\d+)\.\s*(.*)$")
    option_re = re.compile(r"^\s*([ABCD]|[FGHJ])\.\s*(.*)$")
    parsed: list[ParsedQuestion] = []
    grouped: dict[tuple[int, int], list[PdfLine]] = {}
    for line in question_lines(document, section):
        grouped.setdefault((line.page, line.col), []).append(line)
    for (page_number, col), source_lines in sorted(grouped.items()):
        current: ParsedQuestion | None = None
        active_option: str | None = None
        for line in sorted(source_lines, key=lambda item: (item.y0, item.x0)):
            start = start_re.match(line.text)
            is_bold = "Bold" in line.font or "Semibold" in line.font
            if start and is_bold and 8 <= line.size <= 12:
                if current:
                    parsed.append(current)
                first_text = start.group(2).strip()
                first_line = PdfLine(line.page, line.col, line.x0, line.y0, line.x1, line.y1, first_text, line.font, line.size, line.spans)
                current = ParsedQuestion(int(start.group(1)), page_number, col, line.y0, [first_line] if first_text else [], OrderedDict())
                active_option = None
                continue
            if not current:
                continue
            option = option_re.match(line.text)
            if option:
                active_option = option.group(1)
                option_text = option.group(2).strip()
                option_line = PdfLine(line.page, line.col, line.x0, line.y0, line.x1, line.y1, option_text, line.font, line.size, line.spans)
                current.options[active_option] = [option_line]
                continue
            if active_option:
                current.options[active_option].append(line)
            else:
                current.stem_lines.append(line)
        if current:
            parsed.append(current)
    total = SECTION_TOTALS[section]
    parsed = [question for question in parsed if 1 <= question.number <= total]
    by_number = {question.number: question for question in parsed}
    missing = sorted(set(range(1, total + 1)) - set(by_number))
    if missing or len(by_number) != total:
        raise RuntimeError(f"{section}: expected {total} unique questions, found {len(by_number)}; missing {missing}")
    for question in by_number.values():
        if len(question.options) != 4:
            raise RuntimeError(f"{section} question {question.number}: expected 4 options, found {list(question.options)}")
    return [by_number[index] for index in range(1, total + 1)]


def crop_to_content(image: Image.Image, padding: int = 12) -> Image.Image:
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, "white")
    difference = ImageChops.difference(rgb, background).convert("L")
    difference = difference.point(lambda value: 0 if value < 16 else value)
    bbox = difference.getbbox()
    if not bbox:
        return rgb
    left, top, right, bottom = bbox
    return rgb.crop((max(0, left - padding), max(0, top - padding), min(rgb.width, right + padding), min(rgb.height, bottom + padding)))


def render_clip(page: fitz.Page, rect: fitz.Rect, scale: float = 3.0) -> Image.Image:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
    return Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB")


def save_webp(image: Image.Image, filename: str, *, trim: bool = True) -> str:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    output = crop_to_content(image) if trim else image.convert("RGB")
    output.save(ASSET_ROOT / filename, "WEBP", lossless=True, method=6)
    return f"/assets/act-practice-test-3/{filename}"


def visual_regions(page: fitz.Page, clip: fitz.Rect, *, gap: float = 22, min_parts: int = 3) -> list[fitz.Rect]:
    """Find connected vector/image regions without capturing surrounding prose."""
    candidates: list[fitz.Rect] = []
    for drawing in page.get_drawings():
        rect = fitz.Rect(drawing["rect"])
        overlaps_clip = not (
            rect.x1 < clip.x0 or rect.x0 > clip.x1 or
            rect.y1 < clip.y0 or rect.y0 > clip.y1
        )
        if not overlaps_clip or rect.width > 400:
            continue
        rect.x0, rect.x1 = max(clip.x0, rect.x0), min(clip.x1, rect.x1)
        rect.y0, rect.y1 = max(clip.y0, rect.y0), min(clip.y1, rect.y1)
        if rect.width <= 0:
            rect.x1 = rect.x0 + 1
        if rect.height <= 0:
            rect.y1 = rect.y0 + 1
        candidates.append(rect)
    for image in page.get_image_info():
        rect = fitz.Rect(image["bbox"])
        if rect.intersects(clip):
            candidates.append(rect & clip)
    candidates.sort(key=lambda rect: (rect.y0, rect.x0))
    groups: list[tuple[fitz.Rect, int]] = []
    for rect in candidates:
        if groups and rect.y0 <= groups[-1][0].y1 + gap:
            combined = fitz.Rect(groups[-1][0])
            combined |= rect
            groups[-1] = (combined, groups[-1][1] + 1)
        else:
            groups.append((fitz.Rect(rect), 1))
    return [
        rect for rect, count in groups
        if rect.width >= 45 and rect.height >= 24 and (count >= min_parts or (rect.width >= 80 and rect.height >= 50))
    ]


def expanded_visual_rect(
    rect: fitz.Rect,
    clip: fitz.Rect,
    padding: tuple[float, float, float, float] = (30, 0, 30, 2),
) -> fitz.Rect:
    # A restrained expansion retains labels and axes without pulling nearby
    # question or passage prose into the visual asset.
    left, top, right, bottom = padding
    return fitz.Rect(
        max(clip.x0, rect.x0 - left),
        max(clip.y0, rect.y0 - top),
        min(clip.x1, rect.x1 + right),
        min(clip.y1, rect.y1 + bottom),
    )


def math_visuals(document: fitz.Document, questions: list[ParsedQuestion]) -> dict[int, list[str]]:
    result: dict[int, list[str]] = {}
    top_padding_by_question = {1: 10, 7: 8, 25: 8, 30: 8, 32: 8, 33: 8}
    for question in questions:
        first_option_y = min(lines[0].y0 for lines in question.options.values())
        clip = fitz.Rect(34, max(60, question.y0 - 3), 306, max(question.y0 + 18, first_option_y - 3))
        bottom_padding = 0 if question.number in {13, 25} else 14
        regions = [
            expanded_visual_rect(rect, clip, (30, top_padding_by_question.get(question.number, 0), 30, bottom_padding))
            for rect in visual_regions(document[question.page], clip)
        ]
        result[question.number] = [
            save_webp(render_clip(document[question.page], rect), f"math-q{question.number:02d}-figure-{index:02d}.webp")
            for index, rect in enumerate(regions, start=1)
        ]
    return result


def first_question_y(document: fitz.Document, page_number: int, col: int) -> float:
    pattern = re.compile(r"^\s*(\d+)\.\s+")
    values = []
    for line in lines_for_page(document[page_number]):
        if line.col != col or line.y0 < 60:
            continue
        if pattern.match(line.text) and ("Bold" in line.font or "Semibold" in line.font):
            values.append(line.y0)
    return min(values) if values else 738


def science_materials(document: fitz.Document) -> dict[int, dict]:
    result: dict[int, dict] = {}
    for passage_index, passage in enumerate(SCIENCE_PASSAGES, start=1):
        selected_lines: list[PdfLine] = []
        visual_paths: list[str] = []
        visual_index = 0
        for page_number, col in passage["segments"]:
            left, right = (34, 306) if col == 0 else (306, 578)
            start_y = 235 if page_number == 35 else 70
            end_y = min(738, first_question_y(document, page_number, col) - 7)
            if end_y <= start_y + 30:
                continue
            clip = fitz.Rect(left, start_y, right, end_y)
            regions = [expanded_visual_rect(rect, clip) for rect in visual_regions(document[page_number], clip, gap=30)]
            for rect in regions:
                visual_index += 1
                visual_paths.append(save_webp(
                    render_clip(document[page_number], rect, 3.0),
                    f"science-passage-{passage_index:02d}-figure-{visual_index:02d}.webp",
                ))
            for line in lines_for_page(document[page_number]):
                if line.col != col or not (start_y <= line.y0 <= end_y):
                    continue
                line_rect = fitz.Rect(line.x0, line.y0, line.x1, line.y1)
                if any(line_rect.intersects(region) for region in regions):
                    continue
                selected_lines.append(line)
        material = {"body": normalize_science_notation(clean_passage_lines(selected_lines)), "pictureUrls": visual_paths}
        for number in passage["range"]:
            result[number] = material
    return result


def reading_table_visual(document: fitz.Document) -> str:
    # The only non-prose Reading visual in this test is the observational-studies table in Passage II.
    image = render_clip(document[29], fitz.Rect(316, 410, 575, 730), 3.0)
    return save_webp(image, "reading-passage-02-table.webp")


def clean_passage_lines(lines: Iterable[PdfLine]) -> str:
    paragraphs: list[str] = []
    current: list[str] = []
    lines = list(lines)
    base_x = {
        col: min((line.x0 for line in lines if line.col == col and not (re.fullmatch(r"\d+", line.text) and line.size <= 8)), default=0)
        for col in {line.col for line in lines}
    }
    previous_page_col: tuple[int, int] | None = None
    for line in lines:
        text = line.text.strip()
        if not text:
            continue
        if re.fullmatch(r"\d+", text) and line.size <= 8:
            continue
        if re.match(r"^(?:\d+\s+)?(?:Passage (?:[A-Z]|[IVX]+)|LITERARY NARRATIVE|INFORMATIONAL)(?::|$)", text):
            continue
        if re.fullmatch(r"(?:Table|Figure)\s+\d+", text):
            continue
        if text.startswith("© 2026") or "QU00002" in text or "GO ON TO" in text:
            continue
        page_col = (line.page, line.col)
        is_new_paragraph = current and (line.x0 >= base_x.get(line.col, line.x0) + 15 or (previous_page_col is not None and page_col != previous_page_col))
        if is_new_paragraph:
            paragraphs.append(normalize_space(" ".join(current)))
            current = []
        current.append(text)
        previous_page_col = page_col
    if current:
        paragraphs.append(normalize_space(" ".join(current)))
    return "\n\n".join(value for value in paragraphs if value)


def extract_reading_passages(document: fitz.Document) -> list[dict]:
    result: list[dict] = []
    for passage in READING_PASSAGES:
        selected: list[PdfLine] = []
        for page_number, col, y0, y1 in passage["segments"]:
            selected.extend(
                line for line in lines_for_page(document[page_number])
                if line.col == col and y0 <= line.y0 <= y1
            )
        body = clean_passage_lines(selected)
        # The table is rendered separately; removing its extraction avoids a noisy pseudo-table.
        if passage.get("picture"):
            body = body.split("Adams and Klotz’s observational studies")[0].strip()
        result.append({**passage, "body": body})
    return result


def underlined_fragments(page: fitz.Page, line: PdfLine) -> list[tuple[float, float, str, int | None]]:
    raw = page.get_text("rawdict", sort=True)
    chars = []
    for block in raw["blocks"]:
        if "lines" not in block:
            continue
        for raw_line in block["lines"]:
            bbox = raw_line["bbox"]
            if abs(bbox[1] - line.y0) > 1.5 or bbox[0] >= 306:
                continue
            chars.extend(char for span in raw_line["spans"] for char in span.get("chars", []))
    markers = [
        candidate for candidate in lines_for_page(page)
        if candidate.col == 0 and re.fullmatch(r"\d+", candidate.text) and candidate.size <= 8 and abs(candidate.y0 - line.y1) < 5
    ]
    result = []
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if drawing.get("width") != 0.25 or rect.x0 >= 306 or abs(rect.y0 - line.y1) >= 3:
            continue
        fragment = "".join(char["c"] for char in chars if char["bbox"][2] >= rect.x0 - 1 and char["bbox"][0] <= rect.x1 + 1)
        if fragment.strip():
            marker = min(markers, key=lambda item: abs(item.x0 - rect.x1), default=None)
            result.append((rect.x0, rect.x1, fragment, int(marker.text) if marker else None))
    return result


def decorate_english_line(page: fitz.Page, line: PdfLine) -> str:
    text = line.text
    fragments = underlined_fragments(page, line)
    for _, _, fragment, marker in sorted(fragments, reverse=True):
        stripped = fragment.strip()
        if not stripped or stripped not in text:
            continue
        prefix = f"[{marker}]" if marker is not None else ""
        text = text.replace(stripped, f"{prefix}[[{stripped}]]", 1)
    return text


def extract_english_passages(document: fitz.Document) -> list[dict]:
    passages: list[dict] = []
    current: dict | None = None
    paragraph: list[str] = []

    def flush_paragraph():
        nonlocal paragraph
        if current is not None and paragraph:
            current["paragraphs"].append(normalize_space(" ".join(paragraph)))
        paragraph = []

    for page_number in SECTION_PAGES["English"]:
        page = document[page_number]
        for line in sorted((item for item in lines_for_page(page) if item.col == 0 and 70 <= item.y0 <= 730), key=lambda item: (item.y0, item.x0)):
            text = line.text.strip()
            passage_match = re.fullmatch(r"PASSAGE\s+([IVX]+)", text)
            if passage_match:
                flush_paragraph()
                if current:
                    passages.append(current)
                current = {"roman": passage_match.group(1), "title": "", "paragraphs": []}
                continue
            if current is None:
                continue
            if not current["title"]:
                current["title"] = text
                continue
            if re.fullmatch(r"\d+", text) and line.size <= 8:
                continue
            if text.startswith("© 2026") or "QU00002" in text or "GO ON TO" in text or text.startswith("STOP!"):
                continue
            if line.x0 >= 56 and paragraph:
                flush_paragraph()
            decorated = decorate_english_line(page, line).replace("$", "")
            paragraph.append(decorated)
    flush_paragraph()
    if current:
        passages.append(current)
    if len(passages) != 6:
        raise RuntimeError(f"Expected 6 English passages, found {len(passages)}")
    return [
        {"title": passage["title"], "type": f"Passage {passage['roman']}", "body": "\n\n".join(passage["paragraphs"])}
        for passage in passages
    ]


def score_categories(document: fitz.Document) -> dict[str, dict[int, str]]:
    result: dict[str, dict[int, str]] = {}
    page_by_section = {"English": 62, "Mathematics": 63, "Reading": 64, "Science": 65}
    for section, page_number in page_by_section.items():
        page_lines = lines_for_page(document[page_number])
        categories: dict[int, str] = {}
        number_lines = [line for line in page_lines if 55 <= line.x0 <= 80 and line.text.isdigit() and 1 <= int(line.text) <= SECTION_TOTALS[section] and 85 <= line.y0 <= 740]
        for number_line in number_lines:
            number = int(number_line.text)
            same_row = [line for line in page_lines if abs(line.y0 - number_line.y0) <= 3 and 135 <= line.x0 <= 260]
            category_line = next((line for line in same_row if line.text in REPORTING_CATEGORY_NAMES), None)
            categories[number] = category_line.text if category_line else "UNSCORED"
        # The ordered keys above are authoritative even if a PDF text column is irregular.
        for number in range(1, SECTION_TOTALS[section] + 1):
            if number in UNSCORED[section]:
                categories[number] = "UNSCORED"
            elif number not in categories:
                raise RuntimeError(f"Could not read the official reporting category for {section} question {number}")
        result[section] = categories
    return result


def question_passage(number: int, passages: list[dict]) -> dict:
    return next(passage for passage in passages if number in passage["range"])


def question_record(
    section: str,
    question: ParsedQuestion,
    category: str,
    english_passages: list[dict],
    reading_passages: list[dict],
    math_assets: dict[int, list[str]],
    science_materials_by_question: dict[int, dict],
) -> dict:
    number = question.number
    section_id = SECTION_IDS[section]
    stem = clean_extracted(" ".join(line.text for line in question.stem_lines))
    options = OrderedDict((label, clean_extracted(" ".join(line.text for line in lines))) for label, lines in question.options.items())
    if section == "Science":
        stem = normalize_science_notation(stem)
        options = OrderedDict((label, normalize_science_notation(value)) for label, value in options.items())
    correct = ANSWER_KEYS[section][number - 1]
    content_domain = REPORTING_CATEGORY_NAMES.get(category, "Field test question")
    stimulus = None
    attachments = []
    option_picture_urls = None
    if section == "English":
        passage_index = next(index for index, number_range in enumerate(ENGLISH_PASSAGE_RANGES) if number in number_range)
        passage = english_passages[passage_index]
        stimulus = {
            "id": f"act3-english-passage-{passage_index + 1}",
            "title": passage["title"],
            "type": passage["type"],
            "body": passage["body"],
            "pictureUrl": "",
        }
    elif section == "Mathematics":
        stem, option_values = MATH_TEXT[number]
        options = OrderedDict((label, option_values[index]) for index, label in enumerate(question.options))
        pictures = math_assets[number]
        stimulus = {
            "id": f"act3-math-question-{number}",
            "title": "",
            "type": "",
            "body": "",
            "pictureUrl": pictures[0] if pictures else "",
            "pictureUrls": pictures,
        }
        attachments = [{"type": "image", "url": path} for path in pictures]
    elif section == "Reading":
        passage = question_passage(number, reading_passages)
        passage_index = next(index for index, item in enumerate(reading_passages) if number in item["range"])
        picture = f"/assets/act-practice-test-3/{passage['picture']}" if passage.get("picture") else ""
        stimulus = {
            "id": f"act3-reading-passage-{passage_index + 1}",
            "title": passage["title"],
            "type": passage["type"],
            "body": passage["body"],
            "pictureUrl": picture,
        }
        if picture:
            attachments = [{"type": "image", "url": picture}]
    elif section == "Science":
        passage = question_passage(number, SCIENCE_PASSAGES)
        material = science_materials_by_question[number]
        pictures = material["pictureUrls"]
        stimulus = {
            "id": f"act3-science-passage-{SCIENCE_PASSAGES.index(passage) + 1}",
            "title": passage["title"],
            "type": passage["type"],
            "body": material["body"],
            "pictureUrl": pictures[0] if pictures else "",
            "pictureUrls": pictures,
        }
        attachments = [{"type": "image", "url": path} for path in pictures]
    return {
        "id": 37100000 + sum(SECTION_TOTALS[name] for name in SECTION_TOTALS if list(SECTION_TOTALS).index(name) < list(SECTION_TOTALS).index(section)) + number - 1,
        "index": sum(SECTION_TOTALS[name] for name in SECTION_TOTALS if list(SECTION_TOTALS).index(name) < list(SECTION_TOTALS).index(section)) + number - 1,
        "topicGroupId": 310001 + list(SECTION_TOTALS).index(section),
        "topicId": 329000 + list(SECTION_TOTALS).index(section),
        "sectionId": section_id,
        "sectionTitle": section,
        "module": "Module 1",
        "route": "standard",
        "contentDomain": content_domain,
        "officialSkill": content_domain,
        "teachingTopic": content_domain,
        "difficulty": "MEDIUM",
        "secondaryClassification": category,
        "isScored": number not in UNSCORED[section],
        "maximumRawPoints": 1 if number not in UNSCORED[section] else 0,
        "responseType": "MULTIPLE_CHOICE",
        "type": "MULTIPLE_CHOICE",
        "stem": stem,
        "options": options,
        "correctAnswer": correct,
        "explanation": f"The official ACT Practice Test 3 scoring key identifies {correct} as the correct answer. The source test does not include a written explanation for this item.",
        "stimulusMaterial": stimulus,
        "optionPictureUrls": option_picture_urls,
        "attachments": attachments,
        "scoreDetail": {"sourceQuestionNumber": number, "reportingCategory": category, "isFieldTestItem": number in UNSCORED[section]},
        "userAnswer": None,
        "isCorrect": -1,
    }


def writing_record() -> dict:
    return {
        "id": 37100171,
        "index": 171,
        "topicGroupId": 310005,
        "topicId": 329004,
        "sectionId": "writing",
        "sectionTitle": "Writing",
        "module": "Module 1",
        "route": "standard",
        "contentDomain": "Writing",
        "officialSkill": "Ideas and Analysis; Development and Support; Organization; Language Use and Conventions",
        "teachingTopic": "Argumentative essay",
        "difficulty": "MEDIUM",
        "secondaryClassification": "Optional Writing Test",
        "isScored": True,
        "maximumRawPoints": 12,
        "responseType": "STUDENT_PRODUCED_RESPONSE",
        "type": "STUDENT_PRODUCED_RESPONSE",
        "stem": WRITING_PROMPT["task"],
        "options": {},
        "correctAnswer": "",
        "explanation": "Writing is evaluated across Ideas and Analysis, Development and Support, Organization, and Language Use and Conventions. Each domain receives a rubric score; the demo reports an estimated 2–12 Writing score.",
        "stimulusMaterial": {
            "id": "act3-writing-texting",
            "title": WRITING_PROMPT["title"],
            "type": "Writing Test",
            "body": WRITING_PROMPT["issue"],
            "pictureUrl": "",
            "perspectives": WRITING_PROMPT["perspectives"],
            "task": WRITING_PROMPT["task"],
        },
        "attachments": [],
        "scoreDetail": {
            "scoreRange": [2, 12],
            "domains": ["Ideas and Analysis", "Development and Support", "Organization", "Language Use and Conventions"],
            "practiceScoring": "Estimated from the ACT Writing rubric; not an official ACT score.",
        },
        "userAnswer": None,
        "isCorrect": -1,
    }


def main() -> None:
    if not FORM_PDF.exists() or not KEY_PDF.exists():
        raise FileNotFoundError(
            "ACT source PDFs were not found. Set ACT_FORM_PDF and ACT_KEY_PDF "
            "to the private source files before running this importer."
        )
    form = fitz.open(FORM_PDF)
    key = fitz.open(KEY_PDF)
    try:
        ASSET_ROOT.mkdir(parents=True, exist_ok=True)
        for old_asset in ASSET_ROOT.glob("*.webp"):
            old_asset.unlink()
        parsed = {section: parse_questions(form, section) for section in SECTION_TOTALS}
        english_passages = extract_english_passages(form)
        reading_passages = extract_reading_passages(form)
        reading_table_visual(form)
        math_assets = math_visuals(form, parsed["Mathematics"])
        science_materials_by_question = science_materials(form)
        categories = score_categories(form)
        records = []
        for section in SECTION_TOTALS:
            records.extend(
                question_record(section, question, categories[section][question.number], english_passages, reading_passages, math_assets, science_materials_by_question)
                for question in parsed[section]
            )
        records.append(writing_record())
        exam = {
            "_id": 340001,
            "epId": 300001,
            "outlineId": 300002,
            "packageId": 3001,
            "deviceId": "__EP_PACKAGE_TEMPLATE__",
            "platform": "system",
            "exam": "ACT Practice Test 3",
            "examCode": "ACT",
            "subject": "ACT",
            "jurisdiction": "US",
            "level": "Enhanced ACT",
            "examStatus": "READY",
            "overviewStatus": "READY",
            "totalCount": len(records),
            "questions": records,
            "result": None,
            "submittedAt": None,
            "completedAt": None,
            "createdAt": "2026-09-15T00:00:00.000Z",
            "updatedAt": "2026-09-15T00:00:00.000Z",
            "source": {
                "test": FORM_PDF.name,
                "scoringKey": KEY_PDF.name,
                "edition": "2026–2027",
                "multipleChoiceQuestions": 171,
                "writingTasks": 1,
            },
        }
        OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_JSON.write_text(json.dumps(exam, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Imported {len(records)} ACT items into {OUTPUT_JSON}")
        print(f"Generated source-faithful assets in {ASSET_ROOT}")
    finally:
        form.close()
        key.close()


if __name__ == "__main__":
    main()
