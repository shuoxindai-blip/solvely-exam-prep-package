<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type HighlightColor = 'yellow' | 'pink' | 'blue'
type HighlightUnderline = 'solid' | 'dashed' | 'dotted' | 'none'

type TextHighlight = {
  id: string
  start: number
  end: number
  color: HighlightColor
  underline?: HighlightUnderline
  note?: string
}

type TextSegment = {
  text: string
  highlight?: TextHighlight
}

const props = withDefaults(
  defineProps<{
    text: string
    enabled: boolean
    modelValue: TextHighlight[]
    extraClass?: string
  }>(),
  {
    extraClass: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: TextHighlight[]]
}>()

const passageRoot = ref<HTMLElement | null>(null)
const toolbarVisible = ref(false)
const activeHighlightId = ref<string | null>(null)
const toolbarLeft = ref(0)
const toolbarTop = ref(0)
const toolbarPlacement = ref<'above' | 'below'>('above')
const underlineMenuOpen = ref(false)
const noteEditorOpen = ref(false)
const noteDraft = ref('')
const noteInput = ref<HTMLTextAreaElement | null>(null)
let scrollOwner: HTMLElement | null = null
let toolbarAnchorRect: DOMRect | null = null

const palette: Array<{ color: HighlightColor; label: string }> = [
  { color: 'yellow', label: 'Yellow highlight' },
  { color: 'blue', label: 'Blue highlight' },
  { color: 'pink', label: 'Pink highlight' },
]

const underlineOptions: Array<{ value: HighlightUnderline; label: string }> = [
  { value: 'solid', label: 'Solid underline' },
  { value: 'dashed', label: 'Dashed underline' },
  { value: 'dotted', label: 'Dotted underline' },
  { value: 'none', label: 'No underline' },
]

const activeHighlight = computed(() => props.modelValue.find((highlight) => highlight.id === activeHighlightId.value) ?? null)
const activeUnderline = computed<HighlightUnderline>(() => activeHighlight.value?.underline ?? 'none')
const hasActiveNote = computed(() => Boolean(activeHighlight.value?.note?.trim()))

const segments = computed<TextSegment[]>(() => {
  const ordered = [...props.modelValue]
    .filter((highlight) => highlight.start >= 0 && highlight.end > highlight.start && highlight.end <= props.text.length)
    .sort((a, b) => a.start - b.start)
  const output: TextSegment[] = []
  let cursor = 0

  ordered.forEach((highlight) => {
    if (highlight.start > cursor) output.push({ text: props.text.slice(cursor, highlight.start) })
    if (highlight.end > cursor) {
      const start = Math.max(cursor, highlight.start)
      output.push({ text: props.text.slice(start, highlight.end), highlight: { ...highlight, start } })
      cursor = highlight.end
    }
  })

  if (cursor < props.text.length) output.push({ text: props.text.slice(cursor) })
  return output
})

const toolbarStyle = computed(() => ({
  left: `${toolbarLeft.value}px`,
  top: `${toolbarTop.value}px`,
}))

function positionToolbar(rect: DOMRect, expanded = false) {
  toolbarAnchorRect = rect
  const toolbarHalfWidth = Math.min(188, Math.max(80, (window.innerWidth - 24) / 2))
  toolbarLeft.value = Math.min(window.innerWidth - toolbarHalfWidth - 12, Math.max(toolbarHalfWidth + 12, rect.left + rect.width / 2))
  if (rect.top >= (expanded ? 190 : 72)) {
    toolbarPlacement.value = 'above'
    toolbarTop.value = rect.top - 8
  } else {
    toolbarPlacement.value = 'below'
    toolbarTop.value = rect.bottom + 8
  }
}

function clearNativeSelection() {
  window.getSelection()?.removeAllRanges()
}

function closeToolbar(clearSelection = true) {
  toolbarVisible.value = false
  activeHighlightId.value = null
  underlineMenuOpen.value = false
  noteEditorOpen.value = false
  noteDraft.value = ''
  toolbarAnchorRect = null
  if (clearSelection) clearNativeSelection()
}

function textOffset(root: HTMLElement, container: Node, offset: number) {
  const prefix = document.createRange()
  prefix.selectNodeContents(root)
  prefix.setEnd(container, offset)
  return prefix.toString().length
}

function createHighlight(start: number, end: number, rect: DOMRect) {
  const overlaps = props.modelValue.filter((highlight) => highlight.start < end && highlight.end > start)
  const mergedStart = overlaps.reduce((value, highlight) => Math.min(value, highlight.start), start)
  const mergedEnd = overlaps.reduce((value, highlight) => Math.max(value, highlight.end), end)
  const id = `highlight-${Date.now()}-${currentId++}`
  const next = props.modelValue.filter((highlight) => !overlaps.includes(highlight))
  next.push({ id, start: mergedStart, end: mergedEnd, color: 'yellow', underline: 'none', note: '' })
  next.sort((a, b) => a.start - b.start)
  emit('update:modelValue', next)
  activeHighlightId.value = id
  noteDraft.value = ''
  underlineMenuOpen.value = false
  noteEditorOpen.value = false
  positionToolbar(rect)
  toolbarVisible.value = true
  void nextTick(clearNativeSelection)
}

let currentId = 1

function captureSelection() {
  if (!props.enabled || !passageRoot.value) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!passageRoot.value.contains(range.commonAncestorContainer)) return

  const selectedText = range.toString()
  const trimmedText = selectedText.trim()
  if (!trimmedText) return

  const leadingWhitespace = selectedText.length - selectedText.trimStart().length
  const trailingWhitespace = selectedText.length - selectedText.trimEnd().length
  const rawStart = textOffset(passageRoot.value, range.startContainer, range.startOffset)
  const rawEnd = textOffset(passageRoot.value, range.endContainer, range.endOffset)
  const start = rawStart + leadingWhitespace
  const end = rawEnd - trailingWhitespace
  if (end <= start) return

  createHighlight(start, end, range.getBoundingClientRect())
}

function onPassageMouseup() {
  window.requestAnimationFrame(captureSelection)
}

function openExistingHighlight(event: MouseEvent | KeyboardEvent, id: string) {
  const target = event.currentTarget as HTMLElement
  activeHighlightId.value = id
  noteDraft.value = props.modelValue.find((highlight) => highlight.id === id)?.note ?? ''
  underlineMenuOpen.value = false
  noteEditorOpen.value = false
  positionToolbar(target.getBoundingClientRect())
  toolbarVisible.value = true
  clearNativeSelection()
}

function setColor(color: HighlightColor) {
  updateActiveHighlight({ color })
}

function updateActiveHighlight(patch: Partial<Pick<TextHighlight, 'color' | 'underline' | 'note'>>) {
  if (!activeHighlightId.value) return
  emit('update:modelValue', props.modelValue.map((highlight) => (highlight.id === activeHighlightId.value ? { ...highlight, ...patch } : highlight)))
}

function toggleUnderlineMenu() {
  underlineMenuOpen.value = !underlineMenuOpen.value
  noteEditorOpen.value = false
}

function setUnderline(underline: HighlightUnderline) {
  updateActiveHighlight({ underline })
  underlineMenuOpen.value = false
}

function toggleNoteEditor() {
  underlineMenuOpen.value = false
  noteEditorOpen.value = !noteEditorOpen.value
  if (!noteEditorOpen.value) return
  noteDraft.value = activeHighlight.value?.note ?? ''
  if (toolbarAnchorRect) positionToolbar(toolbarAnchorRect, true)
  void nextTick(() => noteInput.value?.focus())
}

function updateNote() {
  updateActiveHighlight({ note: noteDraft.value })
}

function commitNote(closeEditor = false) {
  noteDraft.value = noteDraft.value.trimEnd()
  updateNote()
  if (closeEditor) {
    noteEditorOpen.value = false
    if (toolbarAnchorRect) positionToolbar(toolbarAnchorRect)
  }
}

function removeHighlight() {
  if (!activeHighlightId.value) return
  emit('update:modelValue', props.modelValue.filter((highlight) => highlight.id !== activeHighlightId.value))
  closeToolbar()
}

function onDocumentPointerdown(event: PointerEvent) {
  if (!toolbarVisible.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.highlight-toolbar') || target?.closest('.user-highlight')) return
  closeToolbar(false)
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !toolbarVisible.value) return
  if (underlineMenuOpen.value) {
    underlineMenuOpen.value = false
    return
  }
  if (noteEditorOpen.value) {
    commitNote(true)
    return
  }
  closeToolbar()
}

function onViewportChange() {
  if (toolbarVisible.value) closeToolbar(false)
}

watch(
  () => props.enabled,
  (enabled) => {
    if (!enabled) closeToolbar()
  },
)

watch(
  () => props.text,
  () => closeToolbar(),
)

onMounted(() => {
  scrollOwner = passageRoot.value?.closest('.passage-panel') as HTMLElement | null
  scrollOwner?.addEventListener('scroll', onViewportChange, { passive: true })
  window.addEventListener('resize', onViewportChange, { passive: true })
  document.addEventListener('pointerdown', onDocumentPointerdown)
  document.addEventListener('keydown', onEscape)
})

onBeforeUnmount(() => {
  scrollOwner?.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
  document.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <p
    ref="passageRoot"
    class="passage-copy highlightable-passage"
    :class="[extraClass, { 'highlight-mode-active': enabled }]"
    @mouseup="onPassageMouseup"
  ><template v-for="(segment, index) in segments" :key="segment.highlight?.id ?? `text-${index}`"><mark
      v-if="segment.highlight"
      class="user-highlight"
      :class="[
        `highlight-${segment.highlight.color}`,
        (segment.highlight.underline ?? 'none') !== 'none' ? `underline-${segment.highlight.underline}` : '',
      ]"
      :data-highlight-id="segment.highlight.id"
      tabindex="0"
      aria-label="Highlighted text. Press Enter to edit."
      @click="openExistingHighlight($event, segment.highlight.id)"
      @keydown.enter.stop.prevent="openExistingHighlight($event, segment.highlight.id)"
      @keydown.space.stop.prevent="openExistingHighlight($event, segment.highlight.id)"
    >{{ segment.text }}</mark><span v-else>{{ segment.text }}</span></template></p>

  <Teleport to="body">
    <div
      v-if="toolbarVisible && activeHighlight"
      class="highlight-toolbar"
      :class="[`placement-${toolbarPlacement}`, { 'is-note-editor': noteEditorOpen }]"
      :style="toolbarStyle"
      role="toolbar"
      aria-label="Highlight tools"
    >
      <div class="highlight-toolbar-main">
        <button
          v-for="item in palette"
          :key="item.color"
          class="highlight-swatch"
          :class="[`swatch-${item.color}`, { selected: activeHighlight.color === item.color }]"
          type="button"
          :aria-label="item.label"
          :aria-pressed="activeHighlight.color === item.color"
          :title="item.label"
          @pointerdown.prevent
          @click="setColor(item.color)"
        />

        <div class="highlight-tool-wrap">
          <button
            class="highlight-tool-button underline-tool"
            :class="{ active: activeUnderline !== 'none' || underlineMenuOpen }"
            type="button"
            aria-label="Underline options"
            :aria-pressed="activeUnderline !== 'none'"
            :aria-expanded="underlineMenuOpen"
            aria-haspopup="menu"
            title="Underline options"
            @pointerdown.prevent
            @click="toggleUnderlineMenu"
          ><span class="underline-glyph" aria-hidden="true">U</span></button>
          <div v-if="underlineMenuOpen" class="underline-menu" role="menu" aria-label="Underline styles">
            <button
              v-for="option in underlineOptions"
              :key="option.value"
              class="underline-option"
              :class="{ selected: activeUnderline === option.value }"
              type="button"
              role="menuitemradio"
              :aria-checked="activeUnderline === option.value"
              :aria-label="option.label"
              @pointerdown.prevent
              @click="setUnderline(option.value)"
            ><span v-if="option.value !== 'none'" class="underline-option-glyph" :class="`style-${option.value}`">U</span><span v-else class="none-label">None</span></button>
          </div>
        </div>

        <button
          class="highlight-tool-button note-tool"
          :class="{ active: noteEditorOpen }"
          type="button"
          aria-label="Add or edit note"
          :aria-pressed="noteEditorOpen"
          title="Add or edit note"
          @pointerdown.prevent
          @click="toggleNoteEditor"
        >
          <span v-if="hasActiveNote" class="note-status-dot" aria-hidden="true" />
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 4.5h13a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-4l-3.8 2.5V18h-5.2a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" /></svg>
        </button>

        <button class="highlight-tool-button remove-highlight" type="button" aria-label="Remove highlight" title="Remove highlight" @pointerdown.prevent @click="removeHighlight">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M10 7V5h4v2m-5 3 .6 8h4.8l.6-8M6 7l1 13h10l1-13" /></svg>
        </button>
      </div>

      <textarea
        v-if="noteEditorOpen"
        ref="noteInput"
        v-model="noteDraft"
        class="highlight-note-input"
        aria-label="Highlight note"
        placeholder="Add a note..."
        rows="3"
        @input="updateNote"
        @blur="commitNote(false)"
        @keydown.enter.exact.prevent="commitNote(true)"
      />
      <div v-else-if="hasActiveNote" class="highlight-note-preview" role="note">{{ activeHighlight.note }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.highlightable-passage {
  -webkit-user-select: text;
  user-select: text;
}

.highlightable-passage.highlight-mode-active {
  cursor: text;
}

.highlightable-passage.highlight-mode-active::selection,
.highlightable-passage.highlight-mode-active :deep(*)::selection {
  background: rgba(255, 235, 52, 0.72);
  color: inherit;
}

.user-highlight {
  margin: 0;
  padding: 0;
  border-radius: 2px;
  color: inherit;
  cursor: pointer;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition: filter 120ms ease, box-shadow 120ms ease;
}

.user-highlight:hover,
.user-highlight:focus-visible {
  filter: saturate(1.08);
  box-shadow: 0 0 0 2px rgba(40, 40, 40, 0.12);
  outline: none;
}

.highlight-yellow { background: #fff34c; }
.highlight-pink { background: #f2b6df; }
.highlight-blue { background: #b9dcf6; }

.underline-solid {
  text-decoration: underline solid currentColor 2px;
  text-underline-offset: 3px;
}

.underline-dashed {
  text-decoration: underline dashed currentColor 2px;
  text-underline-offset: 3px;
}

.underline-dotted {
  text-decoration: underline dotted currentColor 2px;
  text-underline-offset: 3px;
}

.highlight-toolbar {
  position: fixed;
  z-index: 120;
  box-sizing: border-box;
  width: min(376px, calc(100vw - 24px));
  padding: 10px 12px 11px;
  border: 2px solid #e5e5e5;
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.16);
  animation: toolbar-in 120ms ease-out;
}

.highlight-toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.highlight-toolbar.placement-above {
  transform: translate(-50%, -100%);
}

.highlight-toolbar.placement-below {
  transform: translateX(-50%);
}

.highlight-toolbar::after {
  position: absolute;
  left: 50%;
  z-index: -1;
  width: 10px;
  height: 10px;
  border-right: 2px solid #e5e5e5;
  border-bottom: 2px solid #e5e5e5;
  background: #fff;
  content: '';
}

.highlight-toolbar.placement-above::after {
  bottom: -7px;
  transform: translateX(-50%) rotate(45deg);
}

.highlight-toolbar.placement-below::after {
  top: -7px;
  transform: translateX(-50%) rotate(225deg);
}

.highlight-swatch,
.highlight-tool-button {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  padding: 0;
  place-items: center;
  border: 2px solid rgba(0, 0, 0, 0.08);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 110ms ease, box-shadow 110ms ease, border-color 110ms ease, background 110ms ease;
}

.highlight-swatch:hover,
.highlight-tool-button:hover {
  transform: translateY(-1px);
}

.highlight-swatch.selected {
  border-color: #111;
  box-shadow: inset 0 0 0 1px #111;
}

.swatch-yellow { background: #ffe88d; }
.swatch-blue { background: #bdddf4; }
.swatch-pink { background: #f3bce4; }

.highlight-tool-button {
  background: #fff;
  color: #6e6e6e;
}

.highlight-tool-button.active {
  border-color: #6d6d6d;
  box-shadow: inset 0 0 0 1px #6d6d6d;
  color: #202020;
}

.highlight-tool-button svg {
  width: 25px;
  height: 25px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.underline-glyph {
  padding-bottom: 1px;
  border-bottom: 2px solid currentColor;
  font: 500 22px/0.9 Arial, sans-serif;
}

.highlight-tool-wrap {
  position: relative;
  flex: 0 0 auto;
}

.underline-menu {
  position: absolute;
  top: 53px;
  left: 50%;
  z-index: 4;
  display: grid;
  width: 98px;
  padding: 7px 0 9px;
  overflow: hidden;
  border: 2px solid #dedede;
  border-radius: 25px;
  background: #fff;
  box-shadow: 0 5px 9px rgba(0, 0, 0, 0.16);
  transform: translateX(-50%);
}

.underline-option {
  display: grid;
  min-height: 47px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #161616;
  cursor: pointer;
}

.underline-option:hover,
.underline-option.selected {
  background: #f3f3f3;
}

.underline-option-glyph {
  padding: 0 2px 2px;
  border-bottom-width: 2px;
  border-bottom-color: currentColor;
  font: 500 20px/1 Arial, sans-serif;
}

.underline-option-glyph.style-solid { border-bottom-style: solid; }
.underline-option-glyph.style-dashed { border-bottom-style: dashed; }
.underline-option-glyph.style-dotted { border-bottom-style: dotted; }

.none-label {
  color: #7a7a7a;
  font: 500 20px/1 Arial, sans-serif;
}

.note-status-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #2b7fff;
}

.highlight-note-input,
.highlight-note-preview {
  box-sizing: border-box;
  width: 100%;
  margin-top: 8px;
  color: #202020;
  font: 18px/1.35 Arial, sans-serif;
}

.highlight-note-input {
  min-height: 84px;
  padding: 4px 5px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
}

.highlight-note-input::placeholder {
  color: #858585;
  opacity: 1;
}

.highlight-note-preview {
  min-height: 36px;
  padding: 3px 7px 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
}

.highlight-toolbar:focus-within {
  border-color: #d7d7d7;
}

@media (max-width: 410px) {
  .highlight-toolbar {
    padding-inline: 9px;
  }

  .highlight-toolbar-main {
    gap: 5px;
  }

  .highlight-swatch,
  .highlight-tool-button {
    width: 42px;
    height: 42px;
  }
}

@keyframes toolbar-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .highlight-toolbar {
    animation: none;
  }
}
</style>
