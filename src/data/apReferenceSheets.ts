import referenceSheets from './apReferenceSheets.json'

export type ApReferenceSheet = {
  slug: string
  title: string
  src: string
  pages: number
  sha256: string
}

const aliases: Record<string, string> = {
  'ap-physics-1': 'ap-physics-1-algebra-based',
  'ap-physics-2': 'ap-physics-2-algebra-based',
  'ap-physics-c-e-m': 'ap-physics-c-electricity-and-magnetism',
}

const referenceSheetBySlug = new Map(
  (referenceSheets as ApReferenceSheet[]).map((sheet) => [sheet.slug, sheet]),
)

export function isApExamSlug(slug: string) {
  return slug.trim().toLowerCase().startsWith('ap-')
}

export function getApReferenceSheet(slug: string): ApReferenceSheet | null {
  const normalizedSlug = slug.trim().toLowerCase()
  return referenceSheetBySlug.get(aliases[normalizedSlug] ?? normalizedSlug) ?? null
}

export const apReferenceSheets = referenceSheets as ApReferenceSheet[]
