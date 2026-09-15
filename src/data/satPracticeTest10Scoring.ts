export type SatScoreRange = {
  lower: number
  upper: number
}

const readingAndWritingRanges: SatScoreRange[] = [
  { lower: 200, upper: 200 }, { lower: 210, upper: 220 }, { lower: 210, upper: 220 },
  { lower: 210, upper: 220 }, { lower: 210, upper: 220 }, { lower: 210, upper: 230 },
  { lower: 220, upper: 240 }, { lower: 220, upper: 250 }, { lower: 230, upper: 260 },
  { lower: 230, upper: 270 }, { lower: 240, upper: 280 }, { lower: 240, upper: 290 },
  { lower: 250, upper: 300 }, { lower: 250, upper: 310 }, { lower: 260, upper: 320 },
  { lower: 270, upper: 330 }, { lower: 280, upper: 340 }, { lower: 300, upper: 340 },
  { lower: 310, upper: 350 }, { lower: 320, upper: 360 }, { lower: 330, upper: 370 },
  { lower: 330, upper: 370 }, { lower: 340, upper: 380 }, { lower: 350, upper: 390 },
  { lower: 350, upper: 390 }, { lower: 360, upper: 400 }, { lower: 370, upper: 410 },
  { lower: 370, upper: 410 }, { lower: 380, upper: 420 }, { lower: 390, upper: 430 },
  { lower: 400, upper: 440 }, { lower: 400, upper: 440 }, { lower: 410, upper: 450 },
  { lower: 420, upper: 460 }, { lower: 430, upper: 470 }, { lower: 440, upper: 480 },
  { lower: 450, upper: 490 }, { lower: 460, upper: 500 }, { lower: 460, upper: 500 },
  { lower: 470, upper: 510 }, { lower: 470, upper: 530 }, { lower: 480, upper: 540 },
  { lower: 490, upper: 550 }, { lower: 500, upper: 560 }, { lower: 510, upper: 570 },
  { lower: 520, upper: 580 }, { lower: 530, upper: 590 }, { lower: 540, upper: 600 },
  { lower: 550, upper: 610 }, { lower: 570, upper: 630 }, { lower: 580, upper: 640 },
  { lower: 590, upper: 650 }, { lower: 600, upper: 660 }, { lower: 610, upper: 670 },
  { lower: 620, upper: 680 }, { lower: 630, upper: 690 }, { lower: 640, upper: 700 },
  { lower: 670, upper: 710 }, { lower: 680, upper: 720 }, { lower: 690, upper: 730 },
  { lower: 700, upper: 740 }, { lower: 720, upper: 760 }, { lower: 730, upper: 770 },
  { lower: 740, upper: 780 }, { lower: 760, upper: 780 }, { lower: 770, upper: 800 },
  { lower: 800, upper: 800 },
]

const mathRanges: SatScoreRange[] = [
  { lower: 200, upper: 200 }, { lower: 210, upper: 220 }, { lower: 210, upper: 220 },
  { lower: 210, upper: 220 }, { lower: 210, upper: 230 }, { lower: 210, upper: 240 },
  { lower: 220, upper: 250 }, { lower: 230, upper: 260 }, { lower: 240, upper: 300 },
  { lower: 250, upper: 310 }, { lower: 260, upper: 320 }, { lower: 280, upper: 340 },
  { lower: 310, upper: 350 }, { lower: 320, upper: 360 }, { lower: 330, upper: 370 },
  { lower: 340, upper: 380 }, { lower: 350, upper: 390 }, { lower: 360, upper: 400 },
  { lower: 370, upper: 410 }, { lower: 380, upper: 420 }, { lower: 380, upper: 420 },
  { lower: 390, upper: 430 }, { lower: 390, upper: 430 }, { lower: 400, upper: 440 },
  { lower: 410, upper: 450 }, { lower: 420, upper: 460 }, { lower: 430, upper: 470 },
  { lower: 440, upper: 480 }, { lower: 450, upper: 490 }, { lower: 460, upper: 500 },
  { lower: 470, upper: 510 }, { lower: 480, upper: 520 }, { lower: 490, upper: 530 },
  { lower: 490, upper: 550 }, { lower: 510, upper: 570 }, { lower: 520, upper: 580 },
  { lower: 530, upper: 590 }, { lower: 540, upper: 600 }, { lower: 550, upper: 610 },
  { lower: 560, upper: 620 }, { lower: 580, upper: 640 }, { lower: 590, upper: 650 },
  { lower: 600, upper: 660 }, { lower: 610, upper: 670 }, { lower: 620, upper: 680 },
  { lower: 640, upper: 700 }, { lower: 650, upper: 710 }, { lower: 670, upper: 730 },
  { lower: 680, upper: 740 }, { lower: 700, upper: 760 }, { lower: 730, upper: 770 },
  { lower: 750, upper: 780 }, { lower: 770, upper: 790 }, { lower: 780, upper: 800 },
  { lower: 800, upper: 800 },
]

export function getSatPracticeTest10ScoreRange(section: 'reading' | 'math', rawScore: number): SatScoreRange {
  const ranges = section === 'reading' ? readingAndWritingRanges : mathRanges
  const boundedScore = Math.max(0, Math.min(ranges.length - 1, Math.round(rawScore)))
  return ranges[boundedScore]
}
