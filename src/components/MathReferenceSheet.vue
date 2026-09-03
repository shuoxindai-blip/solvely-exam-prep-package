<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ close: [] }>()
const collapsed = ref(false)

const planeFigures = [
  { src: '/assets/reference-sheet/circle.svg', alt: 'Circle formulas: area equals pi r squared and circumference equals two pi r' },
  { src: '/assets/reference-sheet/rectangle.svg', alt: 'Rectangle formula: area equals length times width' },
  { src: '/assets/reference-sheet/triangle.svg', alt: 'Triangle formula: area equals one half base times height' },
  { src: '/assets/reference-sheet/right-triangle.svg', alt: 'Right triangle formula: c squared equals a squared plus b squared' },
]

const solidFigures = [
  { src: '/assets/reference-sheet/rectangular-solid.svg', alt: 'Rectangular solid formula: volume equals length times width times height' },
  { src: '/assets/reference-sheet/cylinder.svg', alt: 'Right circular cylinder formula: volume equals pi r squared h' },
  { src: '/assets/reference-sheet/sphere.svg', alt: 'Sphere formula: volume equals four thirds pi r cubed' },
  { src: '/assets/reference-sheet/cone.svg', alt: 'Cone formula: volume equals one third pi r squared h' },
  { src: '/assets/reference-sheet/pyramid.svg', alt: 'Pyramid formula: volume equals one third length times width times height' },
]
</script>

<template>
  <aside class="reference-sheet" :class="{ collapsed }" role="dialog" aria-modal="false" aria-label="Math reference sheet">
    <div class="reference-titlebar">
      <strong>Reference Sheet</strong>
      <div>
        <button type="button" :aria-label="collapsed ? 'Expand reference sheet' : 'Collapse reference sheet'" @click="collapsed = !collapsed">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path :d="collapsed ? 'm6 8 4 4 4-4' : 'm6 12 4-4 4 4'" /></svg>
        </button>
        <button type="button" aria-label="Close reference sheet" @click="emit('close')">×</button>
      </div>
    </div>

    <div v-if="!collapsed" class="reference-content">
      <div class="reference-formula-grid plane-formulas">
        <figure v-for="figure in planeFigures" :key="figure.src"><img :src="figure.src" :alt="figure.alt" /></figure>
      </div>

      <section class="special-triangle-section">
        <h2>Special Right Triangles</h2>
        <img src="/assets/reference-sheet/special-right-triangles.png" alt="30-60-90 and 45-45-90 special right triangle side relationships" />
      </section>

      <div class="reference-formula-grid solid-formulas">
        <figure v-for="figure in solidFigures" :key="figure.src"><img :src="figure.src" :alt="figure.alt" /></figure>
      </div>

      <ul class="reference-facts">
        <li>The number of degrees of arc in a circle is 360.</li>
        <li>The number of radians of arc in a circle is 2π.</li>
        <li>The sum of the measures in degrees of the angles of a triangle is 180.</li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.reference-sheet {
  position: fixed;
  z-index: 90;
  top: 64px;
  left: 18px;
  width: min(390px, calc(100vw - 36px));
  height: min(590px, calc(100dvh - 96px));
  overflow: hidden;
  border: 1px solid #d2d5da;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
  color: #1e1e1e;
  transition: height 160ms ease;
}

.reference-sheet.collapsed { height: 52px; }

.reference-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid #e4e6e9;
  font-family: Arial, Helvetica, sans-serif;
}

.reference-titlebar strong { font-size: 16px; }
.reference-titlebar div { display: flex; align-items: center; gap: 2px; }
.reference-titlebar button { display: grid; width: 34px; height: 34px; padding: 0; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #555; font-size: 27px; line-height: 1; cursor: pointer; }
.reference-titlebar button:hover { background: #f0f1f3; }
.reference-titlebar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; }

.reference-content { height: calc(100% - 52px); padding: 18px 20px 32px; overflow-y: auto; scrollbar-color: #aeb3ba transparent; scrollbar-width: thin; }
.reference-formula-grid { display: grid; grid-template-columns: repeat(2, 1fr); align-items: center; gap: 24px 34px; }
.reference-formula-grid figure { display: grid; min-height: 126px; margin: 0; place-items: center; }
.reference-formula-grid img { width: auto; max-width: 118px; height: auto; max-height: 126px; }
.solid-formulas { margin-top: 24px; }

.special-triangle-section { margin: 24px -4px 0; padding-top: 20px; border-top: 1px solid #dadde1; text-align: center; }
.special-triangle-section h2 { margin: 0 0 12px; font: 700 16px Arial, Helvetica, sans-serif; }
.special-triangle-section img { width: min(100%, 330px); height: auto; mix-blend-mode: multiply; }
.reference-facts { display: grid; gap: 10px; margin: 26px 0 0; padding: 22px 0 0 20px; border-top: 1px solid #dadde1; font: 15px/1.45 Georgia, 'Times New Roman', serif; }

:global(.exam-app.dark-mode) .reference-sheet { border-color: #444851; background: #24262b; color: #f4f4f5; }
:global(.exam-app.dark-mode) .reference-titlebar { border-color: #444851; }
:global(.exam-app.dark-mode) .reference-titlebar button { color: #d5d7dc; }
:global(.exam-app.dark-mode) .reference-titlebar button:hover { background: #363941; }
:global(.exam-app.dark-mode) .reference-formula-grid img,
:global(.exam-app.dark-mode) .special-triangle-section img { filter: invert(1); mix-blend-mode: normal; }
:global(.exam-app.dark-mode) .special-triangle-section,
:global(.exam-app.dark-mode) .reference-facts { border-color: #444851; }

@media (max-width: 680px) { .reference-sheet { top: 72px; left: 12px; width: calc(100vw - 24px); height: calc(100dvh - 96px); } }
@media (prefers-reduced-motion: reduce) { .reference-sheet { transition: none; } }
</style>
