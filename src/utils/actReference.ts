export type TextReference = {
  id: string
  start: number
  end: number
}

export type ParsedActPassage = {
  passage: string
  referenceHighlights: TextReference[]
}

export function parseActPassage(body: string, prompt: string, referenceNumberOverride?: number): ParsedActPassage {
  const rawPassage = body.replace(/^(ENGLISH|READING|SCIENCE) PASSAGE[^\n]*\n/i, '')
  const passage = rawPassage.replace(/\[(?:\d+)\]|\[\[|\]\]/g, '')
  const referenceNumber = referenceNumberOverride ? String(referenceNumberOverride) : prompt.match(/\[(\d+)\]/)?.[1]
  if (!referenceNumber) {
    const quotedTerm = prompt.match(/^As (?:it is )?used in the passage,\s*[“"]([^”"]+)[”"]/i)?.[1]
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
  const cleanOffset = (rawOffset: number) => rawPassage.slice(0, rawOffset).replace(/\[(?:\d+)\]|\[\[|\]\]/g, '').length
  const referenceHighlights: TextReference[] = []

  markers.forEach((marker, markerIndex) => {
    if (marker[1] !== referenceNumber || marker.index === undefined) return
    const segmentStart = marker.index + marker[0].length
    const segmentEnd = markers[markerIndex + 1]?.index ?? rawPassage.length
    const segment = rawPassage.slice(segmentStart, segmentEnd)
    let rawStart = -1
    let rawEnd = -1

    const authoredHighlight = segment.match(/\[\[([\s\S]*?)\]\]/)
    if (authoredHighlight?.index !== undefined) {
      rawStart = segmentStart + authoredHighlight.index + 2
      rawEnd = rawStart + authoredHighlight[1].length
    } else if (!referenceHighlights.length) {
      const quotedReference = segment.match(/[“"]([^”"\n]+)[”"]/)
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
    if (rawStart < 0 || rawEnd <= rawStart) return
    referenceHighlights.push({
      id: `reference-${referenceNumber}-${referenceHighlights.length + 1}`,
      start: cleanOffset(rawStart),
      end: cleanOffset(rawEnd),
    })
  })

  return { passage, referenceHighlights }
}
