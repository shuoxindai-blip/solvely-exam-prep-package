<script setup lang="ts">
import { computed } from 'vue'
import katex from 'katex'

const props = withDefaults(defineProps<{
  text?: string
}>(), {
  text: '',
})

const explicitMathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|(?<!\\)\$[^$\n]+?(?<!\\)\$|\\\([\s\S]+?\\\))/g

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapePlainText(value: string) {
  return escapeHtml(value).replace(/\\\$/g, '$')
}

function normalizeLegacyMath(value: string) {
  return value
    .replace(/−/g, '-')
    .replace(/×/g, String.raw`\times`)
    .replace(/÷/g, String.raw`\div`)
    .replace(/≤/g, String.raw`\le`)
    .replace(/≥/g, String.raw`\ge`)
    .replace(/≠/g, String.raw`\ne`)
    .replace(/∞/g, String.raw`\infty`)
    .replace(/π/g, String.raw`\pi`)
    .replace(/²/g, '^{2}')
    .replace(/³/g, '^{3}')
    .replace(/⁴/g, '^{4}')
    .replace(/ˣ/g, '^{x}')
    .replace(/°/g, String.raw`^{\circ}`)
}

function isStandaloneMath(line: string) {
  const value = line.trim()
  explicitMathPattern.lastIndex = 0
  const hasExplicitMath = explicitMathPattern.test(value)
  explicitMathPattern.lastIndex = 0
  if (!value || value.length > 220 || hasExplicitMath) return false

  const hasMathRelationship = /[=<>≤≥≠]|\b(?:sin|cos|tan|log|ln)\s*\(/i.test(value)
  if (!hasMathRelationship) return false

  const proseWords = value.match(/[A-Za-z]{3,}/g) ?? []
  const mathWords = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'lim', 'max', 'min'])
  return proseWords.filter((word) => !mathWords.has(word.toLowerCase())).length === 0
}

function renderFormula(source: string, displayMode: boolean) {
  try {
    return katex.renderToString(normalizeLegacyMath(source.trim()), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
    })
  } catch {
    return escapeHtml(source)
  }
}

function renderDelimitedText(value: string) {
  let cursor = 0
  let output = ''

  for (const match of value.matchAll(explicitMathPattern)) {
    const index = match.index ?? 0
    output += escapePlainText(value.slice(cursor, index)).replace(/\n/g, '<br>')

    const token = match[0]
    const displayMode = token.startsWith('$$') || token.startsWith(String.raw`\[`)
    const formula = token.startsWith('$$')
      ? token.slice(2, -2)
      : token.startsWith('$')
        ? token.slice(1, -1)
        : token.slice(2, -2)

    output += renderFormula(formula, displayMode)
    cursor = index + token.length
  }

  output += escapePlainText(value.slice(cursor)).replace(/\n/g, '<br>')
  return output
}

const rendered = computed(() => props.text
  .split('\n')
  .map((line) => isStandaloneMath(line)
    ? renderFormula(line, true)
    : renderDelimitedText(line))
  .join('<br>'))
</script>

<template>
  <span class="math-content" v-html="rendered" />
</template>
