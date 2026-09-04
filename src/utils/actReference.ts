export type TextReference = {
  id: string
  start: number
  end: number
}

export type ParsedActPassage = {
  passage: string
  referenceHighlights: TextReference[]
}

export function parseActPassage(body: string, prompt: string): ParsedActPassage {
  const rawPassage = body.replace(/^(ENGLISH|READING|SCIENCE) PASSAGE[^\n]*\n/i, '')
  const passage = rawPassage.replace(/\[\[|\]\]/g, '')
  const referenceNumber = prompt.match(/\[(\d+)\]/)?.[1]
  if (!referenceNumber) {
    const quotedTerm = prompt.match(/^As (?:it is )?used in the passage,\s*[\u201c"]([^\u201d"]+)[\u201d"]/i)?.[1]
    if (!quotedTerm) return { passage, referenceHighlights: [] }
    const start = passage.indexOf(quotedTerm)
    const hasUniqueMatch = start >= 0 && passage.indexOf(quotedTerm, start + quotedTerm.length) < 0
    return {
      passage,
      referenceHighlights: hasUniqueMatch
        ? [{ id: 'reference-vocabulary', start, end: start + quotedTerm.length }]
        : [],
    }
  }

  const markers = [...rawPassage.matchAll(/\[(\d+)\]/g)]
  const markerIndex = markers.findIndex((marker) => marker[1] === referenceNumber)
  const marker = markers[markerIndex]
  if (!marker || marker.index === undefined) return { passage, referenceHighlights: [] }

  const segmentStart = marker.index + marker[0].length
  const segmentEnd = markers[markerIndex + 1]?.index ?? rawPassage.length
  const segment = rawPassage.slice(segmentStart, segmentEnd)
  let rawStart = -1
  let rawEnd = -1

  const authoredHighlight = segment.match(/\[\[([\s\S]*?)\]\]/)
  if (authoredHighlight?.index !== undefined) {
    rawStart = segmentStart + authoredHighlight.index + 2
    rawEnd = rawStart + authoredHighlight[1].length
  } else {
    const quotedReference = segment.match(/[\u201c"]([^\u201d"\n]+)[\u201d"]/)
    if (quotedReference?.index !== undefined) {
      rawStart = segmentStart + quotedReference.index + 1
      rawEnd = rawStart + quotedReference[1].length
    } else {
      const sentenceReference = segment.match(/\S[\s\S]*?[.!?](?=\s|$)/)
      if (sentenceReference?.index !== undefined) {
        rawStart = segmentStart + sentenceReference.index
        rawEnd = rawStart + sentenceReference[0].length
      }
    }
  }

  if (rawStart < 0 || rawEnd <= rawStart) return { passage, referenceHighlights: [] }
  const cleanOffset = (rawOffset: number) => rawPassage.slice(0, rawOffset).replace(/\[\[|\]\]/g, '').length
  const start = cleanOffset(rawStart)
  const end = cleanOffset(rawEnd)
  return {
    passage,
    referenceHighlights: [{ id: `reference-${referenceNumber}`, start, end }],
  }
}
