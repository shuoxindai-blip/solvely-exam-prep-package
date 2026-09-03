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
const isFullscreen = ref(false)
const isDragging = ref(false)
const shell = ref<HTMLElement | null>(null)
const scientificHost = ref<HTMLElement | null>(null)
const calculatorLoadError = ref('')
const position = reactive({ x: 28, y: 92 })

const desmosScriptUrl = 'https://www.desmos.com/api/v1.11/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6&lang=en'
let desmosCalculator: DesmosCalculatorInstance | null = null
const shellStyle = computed(() => poppedOut.value && !isFullscreen.value
  ? { left: `${position.x}px`, top: `${position.y}px` }
  : undefined)

function clampPosition() {
  const rect = shell.value?.getBoundingClientRect()
  const width = rect?.width ?? 410
  const height = rect?.height ?? 578
  position.x = Math.max(12, Math.min(position.x, window.innerWidth - width - 12))
  position.y = Math.max(12, Math.min(position.y, window.innerHeight - height - 12))
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
    clampPosition()
    desmosCalculator?.resize()
  }
}

function beginDrag(event: PointerEvent) {
  if (!poppedOut.value || isFullscreen.value) return
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

async function toggleCalculatorFullscreen() {
  try {
    if (document.fullscreenElement === shell.value) await document.exitFullscreen()
    else await shell.value?.requestFullscreen()
  } catch {
    // The exam-level fullscreen control remains available if element fullscreen is blocked.
  }
}

function syncFullscreen() {
  isFullscreen.value = document.fullscreenElement === shell.value
  void nextTick(() => desmosCalculator?.resize())
}

function closeCalculator() {
  poppedOut.value = false
  emit('popout-change', false)
  emit('close')
}

onMounted(() => {
  window.addEventListener('resize', clampPosition)
  document.addEventListener('fullscreenchange', syncFullscreen)
  void mountScientificCalculator()
})

onBeforeUnmount(() => {
  desmosCalculator?.destroy()
  desmosCalculator = null
  window.removeEventListener('resize', clampPosition)
  document.removeEventListener('fullscreenchange', syncFullscreen)
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
      :class="{ 'popped-out': poppedOut, dragging: isDragging, fullscreen: isFullscreen }"
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
          <button type="button" :aria-label="isFullscreen ? 'Exit calculator fullscreen' : 'Enter calculator fullscreen'" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleCalculatorFullscreen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="!isFullscreen" d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /><path v-else d="M9 3v6H3M15 3v6h6M21 15h-6v6M3 15h6v6" /></svg>
          </button>
          <button class="calculator-close" type="button" aria-label="Close calculator" title="Close" @click="closeCalculator">×</button>
        </div>
      </header>

      <div class="calculator-content">
        <div v-if="calculatorMode === 'scientific'" ref="scientificHost" class="scientific-calculator-host" aria-label="Desmos scientific calculator" />
        <iframe v-else src="/geogebra-calculator.html" title="GeoGebra graphing calculator" allow="clipboard-write" />
        <p v-if="calculatorLoadError" class="calculator-load-error" role="status">{{ calculatorLoadError }}</p>
      </div>
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

.calculator-shell.fullscreen {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
}

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
.calculator-window-actions svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.calculator-window-actions .calculator-close { font-size: 27px; font-weight: 300; line-height: 1; }

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

@media (max-width: 680px) {
  .calculator-titlebar { grid-template-columns: auto 1fr auto; padding-left: 10px; }
  .calculator-titlebar strong { display: none; }
  .calculator-mode-picker { justify-self: start; }
  .calculator-shell.popped-out { width: calc(100vw - 24px); }
}
</style>
