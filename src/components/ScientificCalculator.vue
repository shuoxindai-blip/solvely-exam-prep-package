<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

type DesmosCalculatorInstance = {
  destroy: () => void
  resize: () => void
}

declare global {
  interface Window {
    Desmos?: {
      ScientificCalculator: (element: HTMLElement, options?: Record<string, unknown>) => DesmosCalculatorInstance
    }
  }
}

const emit = defineEmits<{
  close: []
  'popout-change': [value: boolean]
}>()

const calculatorMode = ref<'scientific' | 'graphing'>('scientific')
const poppedOut = ref(false)
const isDragging = ref(false)
const shell = ref<HTMLElement | null>(null)
const scientificHost = ref<HTMLElement | null>(null)
const calculatorLoadError = ref('')
const position = reactive({ x: 28, y: 92 })
const size = reactive({ width: 410, height: 578 })

const minimumSize = { width: 340, height: 420 }

const desmosScriptUrl = 'https://www.desmos.com/api/v1.11/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6&lang=en'
let desmosCalculator: DesmosCalculatorInstance | null = null
const shellStyle = computed(() => poppedOut.value
  ? { left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: `${size.height}px` }
  : undefined)
let stopResize: (() => void) | undefined

function clampGeometry() {
  const maxWidth = Math.max(280, window.innerWidth - 24)
  const maxHeight = Math.max(360, window.innerHeight - 24)
  size.width = Math.min(maxWidth, Math.max(Math.min(minimumSize.width, maxWidth), size.width))
  size.height = Math.min(maxHeight, Math.max(Math.min(minimumSize.height, maxHeight), size.height))
  position.x = Math.max(12, Math.min(position.x, window.innerWidth - size.width - 12))
  position.y = Math.max(12, Math.min(position.y, window.innerHeight - size.height - 12))
}

function loadDesmos() {
  if (window.Desmos?.ScientificCalculator) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>('script[data-solvely-desmos]')
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Unable to load the calculator.')), { once: true })
    })
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = desmosScriptUrl
    script.async = true
    script.dataset.solvelyDesmos = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Unable to load the calculator.')), { once: true })
    document.head.appendChild(script)
  })
}

async function mountScientificCalculator() {
  calculatorLoadError.value = ''
  await nextTick()
  if (calculatorMode.value !== 'scientific' || !scientificHost.value) return
  try {
    await loadDesmos()
    if (calculatorMode.value !== 'scientific' || !scientificHost.value || !window.Desmos) return
    desmosCalculator?.destroy()
    desmosCalculator = window.Desmos.ScientificCalculator(scientificHost.value, {
      degreeMode: false,
      invertedColors: false,
      qwertyKeyboard: true,
      autosize: true,
    })
  } catch {
    calculatorLoadError.value = 'The scientific calculator could not be loaded. Please try again.'
  }
}

async function togglePopout() {
  poppedOut.value = !poppedOut.value
  emit('popout-change', poppedOut.value)
  if (poppedOut.value) {
    position.x = Math.max(20, Math.min(94, window.innerWidth - 430))
    position.y = Math.max(20, Math.min(112, window.innerHeight - 598))
    await nextTick()
    clampGeometry()
    desmosCalculator?.resize()
  }
}

function beginDrag(event: PointerEvent) {
  if (!poppedOut.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('button, select, label')) return

  const originX = position.x
  const originY = position.y
  const startX = event.clientX
  const startY = event.clientY
  isDragging.value = true

  const onMove = (moveEvent: PointerEvent) => {
    const rect = shell.value?.getBoundingClientRect()
    const width = rect?.width ?? 410
    const height = rect?.height ?? 578
    position.x = Math.max(12, Math.min(originX + moveEvent.clientX - startX, window.innerWidth - width - 12))
    position.y = Math.max(12, Math.min(originY + moveEvent.clientY - startY, window.innerHeight - height - 12))
  }
  const onUp = () => {
    isDragging.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function setResizedDimensions(width: number, height: number) {
  const maxWidth = Math.max(280, window.innerWidth - position.x - 12)
  const maxHeight = Math.max(360, window.innerHeight - position.y - 12)
  size.width = Math.min(maxWidth, Math.max(Math.min(minimumSize.width, maxWidth), width))
  size.height = Math.min(maxHeight, Math.max(Math.min(minimumSize.height, maxHeight), height))
}

function beginResize(event: PointerEvent) {
  if (!poppedOut.value) return
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const startY = event.clientY
  const startWidth = size.width
  const startHeight = size.height
  const onMove = (moveEvent: PointerEvent) => {
    setResizedDimensions(startWidth + moveEvent.clientX - startX, startHeight + moveEvent.clientY - startY)
    desmosCalculator?.resize()
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.body.classList.remove('is-resizing-calculator')
    stopResize = undefined
  }
  const onUp = () => {
    cleanup()
    desmosCalculator?.resize()
  }

  stopResize?.()
  stopResize = cleanup
  document.body.classList.add('is-resizing-calculator')
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (!poppedOut.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const step = event.shiftKey ? 40 : 16
  setResizedDimensions(
    size.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
    size.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
  )
  void nextTick(() => desmosCalculator?.resize())
}

function closeCalculator() {
  poppedOut.value = false
  emit('popout-change', false)
  emit('close')
}

onMounted(() => {
  window.addEventListener('resize', clampGeometry)
  void mountScientificCalculator()
})

onBeforeUnmount(() => {
  desmosCalculator?.destroy()
  desmosCalculator = null
  stopResize?.()
  window.removeEventListener('resize', clampGeometry)
})

watch(calculatorMode, (mode) => {
  desmosCalculator?.destroy()
  desmosCalculator = null
  if (mode === 'scientific') void mountScientificCalculator()
})
</script>

<template>
  <Teleport to="body" :disabled="!poppedOut">
    <section
      ref="shell"
      class="calculator-shell"
      :class="{ 'popped-out': poppedOut, dragging: isDragging }"
      :style="shellStyle"
      :aria-label="calculatorMode === 'scientific' ? 'Scientific calculator' : 'Graphing calculator'"
      role="dialog"
    >
      <header class="calculator-titlebar" @pointerdown="beginDrag">
        <strong>Calculator</strong>
        <label class="calculator-mode-picker">
          <span class="sr-only">Calculator type</span>
          <select v-model="calculatorMode" aria-label="Calculator type">
            <option value="scientific">Scientific</option>
            <option value="graphing">Graphing</option>
          </select>
        </label>
        <div class="calculator-window-actions">
          <button type="button" :aria-label="poppedOut ? 'Switch to inline layout' : 'Pop out calculator'" :title="poppedOut ? 'Switch to inline layout' : 'Pop Out'" @click="togglePopout">
            <svg v-if="poppedOut" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="13" height="13" rx="2" /><path d="M9 2h10a3 3 0 0 1 3 3v10" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8" /><rect x="4" y="8" width="12" height="12" rx="2" /></svg>
          </button>
          <button class="calculator-close" type="button" aria-label="Close calculator" title="Close" @click="closeCalculator"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
      </header>

      <div class="calculator-content">
        <div v-if="calculatorMode === 'scientific'" ref="scientificHost" class="scientific-calculator-host" aria-label="Desmos scientific calculator" />
        <iframe v-else src="/geogebra-calculator.html" title="GeoGebra graphing calculator" allow="clipboard-write" />
        <p v-if="calculatorLoadError" class="calculator-load-error" role="status">{{ calculatorLoadError }}</p>
      </div>
      <button v-if="poppedOut" class="calculator-resize-handle" type="button" aria-label="Resize calculator" title="Drag to resize" @pointerdown="beginResize" @keydown="resizeWithKeyboard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11 11 19M19 16l-3 3" /></svg></button>
    </section>
  </Teleport>
</template>

<style scoped>
.calculator-shell {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #d4d4d4;
  border-radius: 10px;
  background: #fff;
  color: #171717;
  font-family: Arial, Helvetica, sans-serif;
}

.calculator-shell.popped-out {
  position: fixed;
  z-index: 1010;
  width: min(410px, calc(100vw - 24px));
  height: min(578px, calc(100dvh - 24px));
  box-shadow: 0 24px 72px rgba(0, 0, 0, .26);
}

.calculator-resize-handle {
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: 0;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 8px 0 8px 0;
  background: linear-gradient(135deg, transparent 42%, rgba(255, 255, 255, .88) 43%);
  color: #787878;
  cursor: nwse-resize;
}

.calculator-resize-handle:hover,
.calculator-resize-handle:focus-visible { color: #1677ef; }
.calculator-resize-handle:focus-visible { outline: 2px solid #1677ef; outline-offset: -3px; }
.calculator-resize-handle svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }

:global(body.is-resizing-calculator),
:global(body.is-resizing-calculator *) { cursor: nwse-resize !important; user-select: none !important; }

.calculator-titlebar {
  display: grid;
  grid-template-columns: minmax(88px, 1fr) auto minmax(88px, 1fr);
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 15px;
  border-bottom: 1px solid #d4d4d4;
  background: #fff;
  user-select: none;
}

.popped-out .calculator-titlebar { cursor: grab; }
.popped-out.dragging .calculator-titlebar { cursor: grabbing; }
.calculator-titlebar strong { font-size: 16px; }

.calculator-mode-picker select {
  min-width: 126px;
  height: 34px;
  padding: 0 30px 0 12px;
  border: 1px solid #d4d4d4;
  border-radius: 8px;
  background: #f5f5f5;
  color: #333;
  font: 600 13px Arial, Helvetica, sans-serif;
  cursor: pointer;
}

.calculator-window-actions {
  display: flex;
  justify-self: end;
  align-items: center;
  gap: 2px;
}

.calculator-window-actions button {
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #555;
  cursor: pointer;
}

.calculator-window-actions button:hover { background: #ededee; color: #171717; }
.calculator-window-actions svg { display: block; width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.calculator-window-actions .calculator-close svg { width: 18px; height: 18px; }

.calculator-content,
.calculator-content iframe,
.scientific-calculator-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: #fff;
}

.calculator-content { position: relative; }
.calculator-load-error { position: absolute; inset: 0; display: grid; margin: 0; padding: 24px; place-items: center; background: #fff; color: #626262; text-align: center; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:global(.exam-app.dark-mode .calculator-shell),
:global(body.mock-exam-dark .calculator-shell.popped-out) {
  border-color: #262626;
  background: #0a0a0a;
  color: #fafafa;
}

:global(.exam-app.dark-mode .calculator-titlebar),
:global(body.mock-exam-dark .calculator-shell.popped-out .calculator-titlebar) {
  border-color: #262626;
  background: #0d0d0d;
}

:global(.exam-app.dark-mode .calculator-mode-picker select),
:global(body.mock-exam-dark .calculator-shell.popped-out .calculator-mode-picker select) {
  border-color: #262626;
  background: #1a1a1a;
  color: #fafafa;
}

:global(.exam-app.dark-mode .calculator-window-actions button),
:global(body.mock-exam-dark .calculator-shell.popped-out .calculator-window-actions button) { color: #a3a3a3; }
:global(.exam-app.dark-mode .calculator-window-actions button:hover),
:global(body.mock-exam-dark .calculator-shell.popped-out .calculator-window-actions button:hover) { background: #262626; color: #fafafa; }
:global(body.mock-exam-dark .calculator-shell.popped-out .calculator-resize-handle) { background: linear-gradient(135deg, transparent 42%, rgba(10, 10, 10, .88) 43%); color: #a3a3a3; }

@media (max-width: 680px) {
  .calculator-titlebar { grid-template-columns: auto 1fr auto; padding-left: 10px; }
  .calculator-titlebar strong { display: none; }
  .calculator-mode-picker { justify-self: start; }
  .calculator-shell.popped-out { width: calc(100vw - 24px); }
}
</style>
