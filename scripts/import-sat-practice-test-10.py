#!/usr/bin/env python3
"""Import SAT Practice Test #10 from the user-supplied College Board PDFs.

This utility is intentionally kept out of the production build. It records the
layout-aware extraction used to generate the checked-in demo data and image
assets. Run it with the question PDF, answer-explanation PDF, and output JSON.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image


MODULES = {
    "rw-m1": {"pages": range(3, 17), "count": 33, "section": "Reading and Writing", "module": "Module 1"},
    "rw-m2": {"pages": range(17, 31), "count": 33, "section": "Reading and Writing", "module": "Module 2"},
    "math-m1": {"pages": range(33, 42), "count": 27, "section": "Math", "module": "Module 1"},
    "math-m2": {"pages": range(45, 52), "count": 27, "section": "Math", "module": "Module 2"},
}

ANSWER_PAGES = {
    "rw-m1": range(1, 16),
    "rw-m2": range(16, 31),
    "math-m1": range(31, 39),
    "math-m2": range(39, 47),
}

ANSWER_KEYS = {
    "rw-m1": ["A", "B", "B", "A", "C", "B", "D", "D", "C", "C", "C", "B", "A", "A", "A", "A", "C", "D", "C", "B", "A", "C", "C", "C", "C", "C", "A", "B", "B", "B", "B", "C", "C"],
    "rw-m2": ["A", "A", "D", "A", "A", "D", "B", "B", "D", "D", "D", "A", "B", "A", "D", "A", "A", "A", "D", "B", "D", "C", "A", "D", "A", "A", "B", "D", "A", "D", "D", "A", "C"],
    "math-m1": ["C", "A", "D", "A", "D", "77", "25", "C", "B", "B", "B", "B", "1", "76", "A", "D", "D", "A", "A", "35", "113", "A", "C", "C", "D", "A", "29/3; 9.666; 9.667"],
    "math-m2": ["D", "A", "D", "D", "A", "79", "2", "D", "D", "B", "A", "C", "41", "11875", "B", "B", "B", "A", "C", "5", "0.25; 1/4", "D", "C", "C", "D", "B", "104"],
}

RW_VISUAL_OVERRIDES = {
    ("rw-m1", 17): {
        "stem": "In a study of the evolution of DptA and DptB—Diptericin genes encoding antimicrobial peptides that combat pathogens and foster beneficial microbes in fruit flies (Drosophila)—researchers assessed Drosophila melanogaster resistance to pathogenic infections by Providencia rettgeri and Acetobacter sicerae, bacteria common in the flies’ environments. Subjects included flies identified by mutations silencing DptA, DptB, or both DptA and DptB (termed types A, B, and AB, respectively). In conjunction with the observation that resistance to P. rettgeri correlates with DptA activity but is not significantly affected by DptB activity, data in the graph of survival rates post–A. sicerae infection suggest that _______ Which completion of the text is best supported by data in the graph?",
        "options": {
            "A": "DptA confers defense against A. sicerae regardless of the presence of DptB.",
            "B": "DptB protects against only one bacteria species, whereas DptA protects against multiple species.",
            "C": "DptB may have developed as a specific defense against A. sicerae.",
            "D": "defense against A. sicerae is strongest when both DptA and DptB are present.",
        },
    },
    ("rw-m2", 11): {
        "stem": "Global biomass is the total mass of living material, such as animals and plants, on Earth. A team of scientists estimated the global biomass, by species, of various wild land mammals. The team found that the species with the highest global biomass is the _______ Which choice most effectively uses data from the graph to complete the sentence?",
        "options": {"A": "wild boar.", "B": "eastern gray kangaroo.", "C": "African bush elephant.", "D": "white-tailed deer."},
    },
    ("rw-m2", 12): {
        "stem": "Studying tools unearthed at a cave site on the western coast of Italy, archaeologist Paola Villa and colleagues have determined that prehistoric Neanderthal groups fashioned them from shells of clams that they harvested from the seafloor while wading or diving or that washed up on the beach. Clamshells become thin and eroded as they wash up on the beach, while those on the seafloor are smooth and sturdy, so the research team suspects that Neanderthals prized the tools made with seafloor shells. However, the team also concluded that those tools were likely more challenging to obtain, noting that _______ Which choice most effectively uses data from the table to support the research team’s conclusion?",
        "options": {
            "A": "at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that shells were easier to collect from the beach than to harvest from the seafloor.",
            "B": "the highest number of tools were at a depth of 3–4 meters below the surface, which suggests that the Neanderthal population at the site was highest during the related period of time.",
            "C": "at each depth below the surface in the cave, the difference in the numbers of tools of each type suggests that Neanderthals preferred to use clamshells from the beach because of their durability.",
            "D": "the higher number of tools at depths of 5–6 meters below the surface in the cave than at depths of 4–5 meters below the surface suggests that the size of clam populations changed over time.",
        },
    },
    ("rw-m2", 13): {
        "stem": "Perovskite solar cells convert light into electricity more efficiently than earlier kinds of solar cells, and manufacturing advances have recently made them commercially attractive. One limitation of the cells, however, has to do with their electron transport layer (ETL), through which absorbed electrons must pass. Often the ETL is applied through a process called spin coating, but such ETLs are fairly inefficient at converting input power to output power. André Taylor and colleagues tested a novel spray coating method for applying the ETL. The team produced ETLs of various thicknesses and concluded that spray coating holds promise for improving the power conversion efficiency of ETLs in perovskite solar cells. Which choice best describes data from the graph that support Taylor and colleagues’ conclusion?",
        "options": {
            "A": "Both the ETL applied through spin coating and the ETL applied through spray coating showed a power conversion efficiency greater than 10% at their lowest performing thickness.",
            "B": "The lowest performing ETL applied through spray coating had a higher power conversion efficiency than the highest performing ETL applied through spin coating.",
            "C": "The highest performing ETL applied through spray coating showed a power conversion efficiency of approximately 13%, while the highest performing ETL applied through spin coating showed a power conversion efficiency of approximately 11%.",
            "D": "There was a substantial difference in power conversion efficiency between the lowest and highest performing ETLs applied through spray coating.",
        },
    },
    ("rw-m2", 14): {
        "stem": "Over the past two hundred years, the percentage of the population employed in the agricultural sector has declined in both France and the United States, while employment in the service sector (which includes jobs in retail, consulting, real estate, etc.) has risen. However, this transition happened at very different rates in the two countries. This can be seen most clearly by comparing the employment by sector in both countries in _______ Which choice most effectively uses data from the table to complete the statement?",
        "options": {
            "A": "1900 with the employment by sector in 1950.",
            "B": "1800 with the employment by sector in 2012.",
            "C": "1900 with the employment by sector in 2012.",
            "D": "1800 with the employment by sector in 1900.",
        },
    },
}

MATH_OVERRIDES = {
    ("math-m1", 1): ("The line graph shows the percent of cars for sale at a used car lot on a given day by model year. For what model year is the percent of cars for sale the smallest?", ["2012", "2013", "2014", "2015"]),
    ("math-m1", 2): ("The graph of a system of linear equations is shown. What is the solution $(x, y)$ to the system?", ["$(4, -5)$", "$(0, 3)$", "$(0, -2)$", "$(-2, 3)$"]),
    ("math-m1", 3): ("The total cost, in dollars, to rent a surfboard consists of a \\$25 service fee and a \\$10 per hour rental fee. A person rents a surfboard for $t$ hours and intends to spend a maximum of \\$75 to rent the surfboard. Which inequality represents this situation?", ["$10t \\le 75$", "$10 + 25t \\le 75$", "$25t \\le 75$", "$25 + 10t \\le 75$"]),
    ("math-m1", 4): ("The graph shown will be translated up 4 units. Which of the following will be the resulting graph?", ["Graph A", "Graph B", "Graph C", "Graph D"]),
    ("math-m1", 5): ("$s = 40 + 3t$\nThe equation gives the speed $s$, in miles per hour, of a certain car $t$ seconds after it began to accelerate. What is the speed, in miles per hour, of the car 5 seconds after it began to accelerate?", ["40", "43", "45", "55"]),
    ("math-m1", 6): ("The function $f$ is defined by $f(x)=x^2+x+71$. What is the value of $f(2)$?", []),
    ("math-m1", 7): ("An event planner is planning a party. It costs the event planner a onetime fee of \\$35 to rent the venue and \\$10.25 per attendee. The event planner has a budget of \\$300. What is the greatest number of attendees possible without exceeding the budget?", []),
    ("math-m1", 8): ("The table gives the distribution of votes for a new school mascot and grade level for 80 students. If one of these students is selected at random, what is the probability of selecting a student whose vote for new mascot was for a lion?", ["$\\frac{1}{9}$", "$\\frac{1}{5}$", "$\\frac{1}{4}$", "$\\frac{2}{3}$"]),
    ("math-m1", 9): ("Triangles $ABC$ and $DEF$ are congruent, where $A$ corresponds to $D$, and $B$ and $E$ are right angles. The measure of angle $A$ is $18^{\\circ}$. What is the measure of angle $F$?", ["$18^{\\circ}$", "$72^{\\circ}$", "$90^{\\circ}$", "$162^{\\circ}$"]),
    ("math-m1", 10): ("If $4x+2=12$, what is the value of $16x+8$?", ["40", "48", "56", "60"]),
    ("math-m1", 11): ("Which expression is equivalent to $(m^4q^4z^{-1})(mq^5z^3)$, where $m$, $q$, and $z$ are positive?", ["$m^4q^{20}z^{-3}$", "$m^5q^9z^2$", "$m^6q^8z^{-1}$", "$m^{20}q^{12}z^{-2}$"]),
    ("math-m1", 12): ("An airplane descends from an altitude of 9,500 feet to 5,000 feet at a constant rate of 400 feet per minute. What type of function best models the relationship between the descending airplane’s altitude and time?", ["Decreasing exponential", "Decreasing linear", "Increasing exponential", "Increasing linear"]),
    ("math-m1", 13): ("$3x+6=4y$\n$3x+4=2y$\nThe solution to the given system of equations is $(x,y)$. What is the value of $y$?", []),
    ("math-m1", 14): ("The function $f$ is defined by $f(x)=(x-6)(x-2)(x+6)$. In the $xy$-plane, the graph of $y=g(x)$ is the result of translating the graph of $y=f(x)$ up 4 units. What is the value of $g(0)$?", []),
    ("math-m1", 15): ("The function $f(w)=6w^2$ gives the area of a rectangle, in square feet ($\\text{ft}^2$), if its width is $w$ ft and its length is 6 times its width. Which of the following is the best interpretation of $f(14)=1{,}176$?", ["If the width of the rectangle is 14 ft, then the area of the rectangle is $1{,}176\\text{ ft}^2$.", "If the width of the rectangle is 14 ft, then the length of the rectangle is 1,176 ft.", "If the width of the rectangle is 1,176 ft, then the length of the rectangle is 14 ft.", "If the width of the rectangle is 1,176 ft, then the area of the rectangle is $14\\text{ ft}^2$."]),
    ("math-m1", 16): ("The number of bacteria in a liquid medium doubles every day. There are 44,000 bacteria in the liquid medium at the start of an observation. Which of the following represents the number of bacteria, $y$, in the liquid medium $t$ days after the start of the observation?", ["$y=\\frac{1}{2}(44{,}000)^t$", "$y=2(44{,}000)^t$", "$y=44{,}000\\left(\\frac{1}{2}\\right)^t$", "$y=44{,}000(2)^t$"]),
    ("math-m1", 17): ("The table shows the exponential relationship between the number of years, $x$, since Hana started training in pole vault, and the estimated height $h(x)$, in meters, of her best pole vault for that year. Which of the following functions best represents this relationship, where $x\\le4$?", ["$h(x)=1.12(0.23)^x$", "$h(x)=1.12(1.23)^x$", "$h(x)=1.23(0.12)^x$", "$h(x)=1.23(1.12)^x$"]),
    ("math-m1", 18): ("The function $h$ is defined by $h(x)=4x+28$. The graph of $y=h(x)$ in the $xy$-plane has an $x$-intercept at $(a,0)$ and a $y$-intercept at $(0,b)$, where $a$ and $b$ are constants. What is the value of $a+b$?", ["21", "28", "32", "35"]),
    ("math-m1", 19): ("$y<5x+6$\nFor which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given inequality?", ["$\\begin{array}{c|c}x&y\\\\3&17\\\\5&27\\\\7&37\\end{array}$", "$\\begin{array}{c|c}x&y\\\\3&17\\\\5&35\\\\7&37\\end{array}$", "$\\begin{array}{c|c}x&y\\\\3&25\\\\5&35\\\\7&45\\end{array}$", "$\\begin{array}{c|c}x&y\\\\3&21\\\\5&31\\\\7&41\\end{array}$"]),
    ("math-m1", 20): ("$y=4x+1$\n$4y=15x-8$\nThe solution to the given system of equations is $(x,y)$. What is the value of $x-y$?", []),
    ("math-m1", 21): ("A right triangle has legs with lengths of 24 centimeters and 21 centimeters. If the length of this triangle’s hypotenuse, in centimeters, can be written in the form $3\\sqrt{d}$, where $d$ is an integer, what is the value of $d$?", []),
    ("math-m1", 22): ("The floor of a ballroom has an area of 600 square meters. An architect creates a scale model of the floor of the ballroom, where the length of each side of the model is $\\frac{1}{10}$ times the length of the corresponding side of the actual floor of the ballroom. What is the area, in square meters, of the scale model?", ["6", "10", "60", "150"]),
    ("math-m1", 23): ("Which of the following equations represents a circle in the $xy$-plane that intersects the $y$-axis at exactly one point?", ["$(x-8)^2+(y-8)^2=16$", "$(x-8)^2+(y-4)^2=16$", "$(x-4)^2+(y-9)^2=16$", "$x^2+(y-9)^2=16$"]),
    ("math-m1", 24): ("In triangles $ABC$ and $DEF$, angles $B$ and $E$ each have measure $27^{\\circ}$ and angles $C$ and $F$ each have measure $41^{\\circ}$. Which additional piece of information is sufficient to determine whether triangle $ABC$ is congruent to triangle $DEF$?", ["The measure of angle $A$", "The length of side $AB$", "The lengths of sides $BC$ and $EF$", "No additional information is necessary."]),
    ("math-m1", 25): ("The result of increasing the quantity $x$ by 1,800% is 684. What is the value of $x$?", ["12,996", "12,312", "38", "36"]),
    ("math-m1", 26): ("A window repair specialist charges \\$220 for the first two hours of repair plus an hourly fee for each additional hour. The total cost for 5 hours of repair is \\$400. Which function $f$ gives the total cost, in dollars, for $x$ hours of repair, where $x\\ge2$?", ["$f(x)=60x+100$", "$f(x)=60x+220$", "$f(x)=80x$", "$f(x)=80x+220$"]),
    ("math-m1", 27): ("$x(x+1)-56=4x(x-7)$\nWhat is the sum of the solutions to the given equation?", []),
    ("math-m2", 1): ("An object’s speed is 64 yards per second. What is the object’s speed, in feet per second? (1 yard = 3 feet)", ["61", "67", "94", "192"]),
    ("math-m2", 2): ("The scatterplot shows the relationship between two variables, $x$ and $y$. A line of best fit is also shown. Which of the following equations best represents the line of best fit shown?", ["$y=x+3.4$", "$y=x-3.4$", "$y=-x+3.4$", "$y=-x-3.4$"]),
    ("math-m2", 3): ("The graph shows the linear relationship between $x$ and $y$. Which table gives three values of $x$ and their corresponding values of $y$ for this relationship?", ["$\\begin{array}{c|c}x&y\\\\0&0\\\\1&-7\\\\2&-9\\end{array}$", "$\\begin{array}{c|c}x&y\\\\0&0\\\\1&-3\\\\2&-1\\end{array}$", "$\\begin{array}{c|c}x&y\\\\0&-5\\\\1&-7\\\\2&-9\\end{array}$", "$\\begin{array}{c|c}x&y\\\\0&-5\\\\1&-3\\\\2&-1\\end{array}$"]),
    ("math-m2", 4): ("What is the perimeter, in inches, of a rectangle with a length of 4 inches and a width of 9 inches?", ["13", "17", "22", "26"]),
    ("math-m2", 5): ("$7m=2(n+p)$\nThe given equation relates the positive numbers $m$, $n$, and $p$. Which equation correctly gives $m$ in terms of $n$ and $p$?", ["$m=\\frac{2(n+p)}{7}$", "$m=2(n+p)$", "$m=2(n+p)-7$", "$m=2-n-p-7$"]),
    ("math-m2", 6): ("$73, 74, 75, 77, 79, 82, 84, 85, 91$\nWhat is the median of the data shown?", []),
    ("math-m2", 7): ("The function $f$ is defined by $f(x)=4x$. For what value of $x$ does $f(x)=8$?", []),
    ("math-m2", 8): ("Of 300,000 paper clips, 234,000 are size large. What percentage of the paper clips are size large?", ["22%", "33%", "66%", "78%"]),
    ("math-m2", 9): ("$f(x)=8x+4$\nThe function $f$ gives the estimated height, in feet, of a willow tree $x$ years after its height was first measured. Which statement is the best interpretation of 4 in this context?", ["The tree will be measured each year for 4 years.", "The tree is estimated to grow to a maximum height of 4 feet.", "The estimated height of the tree increased by 4 feet each year.", "The estimated height of the tree was 4 feet when it was first measured."]),
    ("math-m2", 10): ("$y=76$\n$y=x^2-5$\nThe graphs of the given equations in the $xy$-plane intersect at the point $(x,y)$. What is a possible value of $x$?", ["$-\\frac{76}{5}$", "$-9$", "$5$", "$76$"]),
    ("math-m2", 11): ("Each side of equilateral triangle $S$ is multiplied by a scale factor of $k$ to create equilateral triangle $T$. The length of each side of triangle $T$ is greater than the length of each side of triangle $S$. Which of the following could be the value of $k$?", ["$\\frac{29}{28}$", "$1$", "$\\frac{28}{29}$", "$0$"]),
    ("math-m2", 12): ("$66x=66x$\nHow many solutions does the given equation have?", ["Exactly one", "Exactly two", "Infinitely many", "Zero"]),
    ("math-m2", 13): ("Vivian bought party hats and cupcakes for \\$71. Each package of party hats cost \\$3, and each cupcake cost \\$1. If Vivian bought 10 packages of party hats, how many cupcakes did she buy?", []),
    ("math-m2", 14): ("The exponential function $g$ is defined by $g(x)=19\\cdot a^x$, where $a$ is a positive constant. If $g(3)=2{,}375$, what is the value of $g(4)$?", []),
    ("math-m2", 15): ("In right triangle $RST$, the sum of the measures of angle $R$ and angle $S$ is 90 degrees. The value of $\\sin(R)$ is $\\frac{\\sqrt{15}}{4}$. What is the value of $\\cos(S)$?", ["$\\frac{\\sqrt{15}}{15}$", "$\\frac{\\sqrt{15}}{4}$", "$\\frac{4\\sqrt{15}}{15}$", "$\\sqrt{15}$"]),
    ("math-m2", 16): ("The graph shows the relationship between the number of shares of stock from Company A, $x$, and the number of shares of stock from Company B, $y$, that Simone can purchase. Which equation could represent this relationship?", ["$y=8x+12$", "$8x+12y=480$", "$y=12x+8$", "$12x+8y=480$"]),
    ("math-m2", 17): ("Which expression is equivalent to $\\frac{8x(x-7)-3(x-7)}{2x-14}$, where $x>7$?", ["$\\frac{x-7}{5}$", "$\\frac{8x-3}{2}$", "$\\frac{8x^2-3x-14}{2x-14}$", "$\\frac{8x^2-3x-77}{2x-14}$"]),
    ("math-m2", 18): ("The function $f$ is defined by $f(x)=(-8)(2)^x+22$. What is the $y$-intercept of the graph of $y=f(x)$ in the $xy$-plane?", ["$(0,14)$", "$(0,2)$", "$(0,22)$", "$(0,-8)$"]),
    ("math-m2", 19): ("Keenan made 32 cups of vegetable broth. Keenan then filled $x$ small jars and $y$ large jars with all the vegetable broth he made. The equation $3x+5y=32$ represents this situation. Which is the best interpretation of $5y$ in this context?", ["The number of large jars Keenan filled", "The number of small jars Keenan filled", "The total number of cups of vegetable broth in the large jars", "The total number of cups of vegetable broth in the small jars"]),
    ("math-m2", 20): ("A circle in the $xy$-plane has a diameter with endpoints $(2,4)$ and $(2,14)$. An equation of this circle is $(x-2)^2+(y-9)^2=r^2$, where $r$ is a positive constant. What is the value of $r$?", []),
    ("math-m2", 21): ("Line $\\ell$ is defined by $3y+12x=5$. Line $n$ is perpendicular to line $\\ell$ in the $xy$-plane. What is the slope of line $n$?", []),
    ("math-m2", 22): ("$|-5x+13|=73$\nWhat is the sum of the solutions to the given equation?", ["$-\\frac{146}{5}$", "$-12$", "$0$", "$\\frac{26}{5}$"]),
    ("math-m2", 23): ("For the exponential function $f$, the value of $f(1)$ is $k$, where $k$ is a constant. Which of the following equivalent forms of the function $f$ shows the value of $k$ as the coefficient or the base?", ["$f(x)=50(1.6)^{x+1}$", "$f(x)=80(1.6)^x$", "$f(x)=128(1.6)^{x-1}$", "$f(x)=204.8(1.6)^{x-2}$"]),
    ("math-m2", 24): ("$-9x^2+30x+c=0$\nIn the given equation, $c$ is a constant. The equation has exactly one solution. What is the value of $c$?", ["3", "0", "$-25$", "$-53$"]),
    ("math-m2", 25): ("Which of the following expressions has a factor of $x+2b$, where $b$ is a positive integer constant?", ["$3x^2+7x+14b$", "$3x^2+28x+14b$", "$3x^2+42x+14b$", "$3x^2+49x+14b$"]),
    ("math-m2", 26): ("Two data sets of 23 integers each are summarized in the histograms shown. For each of the histograms, the first interval represents the frequency of integers greater than or equal to 10, but less than 20. The second interval represents the frequency of integers greater than or equal to 20, but less than 30, and so on. What is the smallest possible difference between the mean of data set A and the mean of data set B?", ["0", "1", "10", "23"]),
    ("math-m2", 27): ("The perimeter of an equilateral triangle is 624 centimeters. The height of this triangle is $k\\sqrt{3}$ centimeters, where $k$ is a constant. What is the value of $k$?", []),
}

FIGURE_CROPS = {
    ("rw-m1", 17): (10, (80, 130, 280, 395)),
    ("rw-m2", 11): (21, (345, 125, 550, 405)),
    ("rw-m2", 12): (22, (55, 130, 430, 255)),
    ("rw-m2", 13): (23, (88, 125, 278, 405)),
    ("rw-m2", 14): (24, (55, 130, 415, 255)),
    ("math-m1", 1): (33, (50, 165, 280, 315)),
    ("math-m1", 2): (33, (340, 140, 550, 315)),
    ("math-m1", 4): (35, (115, 140, 295, 315)),
    ("math-m1", 8): (37, (340, 180, 550, 270)),
    ("math-m1", 17): (39, (125, 465, 205, 530)),
    ("math-m2", 2): (45, (55, 365, 285, 550)),
    ("math-m2", 3): (45, (350, 140, 555, 315)),
    ("math-m2", 16): (48, (350, 140, 565, 325)),
    ("math-m2", 26): (51, (50, 140, 285, 270)),
}

OPTION_FIGURE_CROPS = {
    ("math-m1", 4): {
        "A": (36, (70, 120, 295, 305)),
        "B": (36, (320, 120, 555, 305)),
        "C": (36, (70, 315, 295, 515)),
        "D": (36, (320, 315, 555, 515)),
    },
}


@dataclass
class Block:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


def clean_text(value: str) -> str:
    value = value.replace("Start referenced Content:", "").replace("End referenced Content", "")
    value = value.replace("Start superscript,", "").replace("End superscript", "")
    value = value.replace("Start subscript,", "").replace("End subscript", "")
    value = value.replace("blank", "_______")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def page_blocks(page: fitz.Page) -> list[Block]:
    result = []
    for raw in page.get_text("blocks"):
        x0, y0, x1, y1, text = raw[:5]
        text = clean_text(text)
        if text:
            result.append(Block(x0, y0, x1, y1, text))
    return result


def marker_blocks(blocks: list[Block], count: int) -> list[tuple[int, Block, str]]:
    result = []
    for block in blocks:
        if not re.fullmatch(r"\d{1,2}", block.text):
            continue
        number = int(block.text)
        if not 1 <= number <= count or not 90 < block.y0 < 720:
            continue
        if block.x0 < 70:
            result.append((number, block, "left"))
        elif 310 < block.x0 < 350:
            result.append((number, block, "right"))
    return result


def content_blocks(blocks: list[Block], marker: Block, column: str, next_y: float) -> list[Block]:
    if column == "left":
        horizontal = lambda b: b.x0 < 305 and b.x1 < 310
    else:
        horizontal = lambda b: b.x0 > 325
    output = []
    for block in blocks:
        if not horizontal(block) or block.y0 < marker.y0 + 10 or block.y0 >= next_y:
            continue
        if block.text.startswith("Unauthorized copying") or block.text.startswith("Module"):
            continue
        if set(block.text) <= set("-.~_ "):
            continue
        output.append(block)
    return sorted(output, key=lambda b: (b.y0, b.x0))


def split_question(text: str) -> tuple[str, dict[str, str]]:
    matches = list(re.finditer(r"(?:^|\s)([A-D])\)\s+", text))
    if not matches:
        return clean_text(text), {}
    stem = clean_text(text[: matches[0].start()])
    options = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        options[match.group(1)] = clean_text(text[match.end() : end])
    return stem, options


def extract_questions(document: fitz.Document, module_id: str) -> list[dict]:
    config = MODULES[module_id]
    found: dict[int, dict] = {}
    for page_index in config["pages"]:
        blocks = page_blocks(document[page_index])
        markers = marker_blocks(blocks, config["count"])
        for number, marker, column in markers:
            same_column = [other for other in markers if other[2] == column and other[1].y0 > marker.y0]
            next_y = min((other[1].y0 for other in same_column), default=720)
            body = content_blocks(blocks, marker, column, next_y)
            stem, options = split_question(" ".join(block.text for block in body))
            found[number] = {
                "number": number,
                "page": page_index + 1,
                "column": column,
                "stem": stem,
                "options": options,
            }
    missing = [number for number in range(1, config["count"] + 1) if number not in found]
    if missing:
        raise RuntimeError(f"{module_id}: missing questions {missing}")
    return [found[number] for number in range(1, config["count"] + 1)]


def extract_explanations(document: fitz.Document, module_id: str) -> dict[int, str]:
    text = " ".join(clean_text(document[index].get_text("text")) for index in ANSWER_PAGES[module_id])
    text = re.sub(r"\d+ SAT PRACTICE TEST #10 ANSWER EXPLANATIONS", " ", text)
    text = re.sub(r"SAT ANSWER EXPLANATIONS n (?:READING AND WRITING|MATH): MODULE [12]", " ", text)
    pieces = re.split(r"QUESTION\s+(\d+)", text)
    result = {}
    for index in range(1, len(pieces), 2):
        number = int(pieces[index])
        body = clean_text(pieces[index + 1])
        result[number] = body
    return result


def classify_reading(stem: str) -> tuple[str, str]:
    lowered = stem.lower()
    if "while researching a topic" in lowered:
        return "Expression of Ideas", "Rhetorical Synthesis"
    if "logical transition" in lowered:
        return "Expression of Ideas", "Transitions"
    if "conventions of standard english" in lowered:
        return "Standard English Conventions", "Form, Structure, and Sense"
    if "logical and precise word or phrase" in lowered:
        return "Craft and Structure", "Words in Context"
    if "overall structure" in lowered or "main purpose" in lowered or "function of the" in lowered:
        return "Craft and Structure", "Text Structure and Purpose"
    if "text 1" in lowered and "text 2" in lowered:
        return "Craft and Structure", "Cross-Text Connections"
    if "graph" in lowered or "table" in lowered or "finding" in lowered or "support" in lowered:
        return "Information and Ideas", "Command of Evidence"
    if "main idea" in lowered or "according to the text" in lowered or "based on the text" in lowered:
        return "Information and Ideas", "Central Ideas and Details"
    return "Information and Ideas", "Inferences"


MATH_DOMAINS = {
    "math-m1": {
        "Algebra": {3, 5, 7, 10, 12, 13, 18, 19, 20, 26},
        "Advanced Math": {4, 6, 11, 14, 16, 17, 27},
        "Problem-Solving and Data Analysis": {1, 8, 15, 25},
        "Geometry and Trigonometry": {2, 9, 21, 22, 23, 24},
    },
    "math-m2": {
        "Algebra": {3, 5, 7, 9, 12, 13, 16, 19, 21},
        "Advanced Math": {10, 14, 17, 18, 22, 23, 24, 25},
        "Problem-Solving and Data Analysis": {1, 2, 6, 8, 11, 26},
        "Geometry and Trigonometry": {4, 15, 20, 27},
    },
}

TOPIC_GROUPS = {
    "Craft and Structure": (110001, 120004),
    "Information and Ideas": (110002, 120019),
    "Standard English Conventions": (110003, 120022),
    "Expression of Ideas": (110004, 120031),
    "Algebra": (110005, 120039),
    "Advanced Math": (110006, 120054),
    "Problem-Solving and Data Analysis": (110007, 120067),
    "Geometry and Trigonometry": (110008, 120087),
}

READING_TOPIC_OVERRIDES = {
    "Words in Context": 120001,
    "Text Structure and Purpose": 120004,
    "Cross-Text Connections": 120007,
    "Central Ideas and Details": 120010,
    "Command of Evidence": 120013,
    "Inferences": 120019,
    "Form, Structure, and Sense": 120022,
    "Rhetorical Synthesis": 120031,
    "Transitions": 120035,
}


def math_domain(module_id: str, number: int) -> str:
    for domain, numbers in MATH_DOMAINS[module_id].items():
        if number in numbers:
            return domain
    return "Math"


def save_crop(document: fitz.Document, page_index: int, rect: tuple[int, int, int, int], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    pixmap = document[page_index].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(*rect), alpha=False)
    pixmap.save(output)
    with Image.open(output) as image:
        image.save(output, optimize=True)


def build_exam(modules: dict[str, list[dict]], question_pdf: fitz.Document, assets_dir: Path) -> dict:
    questions = []
    sequence = 0
    for module_id, config in MODULES.items():
        for raw in modules[module_id]:
            sequence += 1
            number = raw["number"]
            override = RW_VISUAL_OVERRIDES.get((module_id, number))
            if override:
                raw.update(override)
            if (module_id, number) in MATH_OVERRIDES:
                stem, options = MATH_OVERRIDES[(module_id, number)]
                raw["stem"] = stem
                raw["options"] = dict(zip("ABCD", options))

            picture_url = ""
            if (module_id, number) in FIGURE_CROPS:
                page_index, rect = FIGURE_CROPS[(module_id, number)]
                filename = f"{module_id}-q{number:02d}.png"
                save_crop(question_pdf, page_index, rect, assets_dir / filename)
                picture_url = f"/assets/sat-practice-test-10/{filename}"

            option_picture_urls = {}
            for label, (page_index, rect) in OPTION_FIGURE_CROPS.get((module_id, number), {}).items():
                filename = f"{module_id}-q{number:02d}-option-{label.lower()}.png"
                save_crop(question_pdf, page_index, rect, assets_dir / filename)
                option_picture_urls[label] = f"/assets/sat-practice-test-10/{filename}"

            is_reading = module_id.startswith("rw")
            if is_reading:
                domain, skill = classify_reading(raw["stem"])
            else:
                domain = math_domain(module_id, number)
                skill = domain
            difficulty = "Easy" if number <= config["count"] // 3 else "Medium" if number <= 2 * config["count"] // 3 else "Hard"
            response_type = "MULTIPLE_CHOICE" if raw["options"] else "STUDENT_PRODUCED_RESPONSE"
            questions.append({
                "id": 100000 + sequence,
                "sourceQuestionId": f"SAT-PT10-{module_id.upper()}-Q{number:02d}",
                "index": sequence,
                "topicGroupId": TOPIC_GROUPS[domain][0],
                "topicId": READING_TOPIC_OVERRIDES.get(skill, TOPIC_GROUPS[domain][1]),
                "sectionId": "reading-writing" if is_reading else "math",
                "sectionTitle": config["section"],
                "module": config["module"],
                "route": "Common" if config["module"] == "Module 1" else "Second Module",
                "contentDomain": domain,
                "officialSkill": skill,
                "teachingTopic": skill,
                "difficulty": difficulty,
                "secondaryClassification": "SAT Practice Test 10",
                "isScored": True,
                "maximumRawPoints": 1,
                "responseType": response_type,
                "type": response_type,
                "stem": raw["stem"],
                "options": raw["options"],
                "optionPictureUrls": option_picture_urls,
                "correctAnswer": raw["answer"],
                "explanation": raw["explanation"],
                "stimulusMaterial": {
                    "id": f"sat-pt10-{module_id}-q{number:02d}-figure",
                    "title": "Question figure",
                    "type": "IMAGE",
                    "body": "",
                    "pictureUrl": picture_url,
                } if picture_url else None,
                "attachments": [],
                "scoreDetail": None,
                "userAnswer": None,
                "isCorrect": -1,
            })
    return {
        "_id": 140001,
        "epId": 100001,
        "outlineId": 100002,
        "packageId": 2001,
        "exam": "SAT Practice Test 10",
        "examCode": "SAT-PT10",
        "subject": "Digital SAT",
        "examStatus": "READY",
        "overviewStatus": "READY",
        "totalCount": len(questions),
        "questions": questions,
        "result": None,
        "submittedAt": None,
        "completedAt": None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("questions", type=Path)
    parser.add_argument("answers", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--assets-dir", type=Path)
    args = parser.parse_args()

    question_pdf = fitz.open(args.questions)
    answer_pdf = fitz.open(args.answers)
    modules = {}
    for module_id in MODULES:
        questions = extract_questions(question_pdf, module_id)
        explanations = extract_explanations(answer_pdf, module_id)
        key = ANSWER_KEYS[module_id]
        if len(key) != MODULES[module_id]["count"]:
            raise RuntimeError(f"{module_id}: answer key contains {len(key)} answers")
        for question in questions:
            question["answer"] = key[question["number"] - 1]
            question["explanation"] = explanations.get(question["number"], "")
        modules[module_id] = questions

    assets_dir = args.assets_dir or args.output.parent / "sat-practice-test-10-assets"
    exam = build_exam(modules, question_pdf, assets_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(exam, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {exam['totalCount']} questions to {args.output}")
    print(f"Wrote {len(list(assets_dir.glob('*.png')))} image assets to {assets_dir}")


if __name__ == "__main__":
    main()
