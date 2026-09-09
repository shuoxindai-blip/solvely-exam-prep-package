<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  title: string
  src: string
}>()

const emit = defineEmits<{ close: [] }>()
const collapsed = ref(false)
const pdfUrl = computed(() => `${props.src}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`)
</script>

<template>
  <aside
    class="pdf-reference-sheet"
    :class="{ collapsed }"
    role="dialog"
    aria-modal="false"
    :aria-label="`${title} reference sheet`"
  >
    <div class="pdf-reference-titlebar">
      <strong>{{ title }} Reference Sheet</strong>
      <div>
        <button
          type="button"
          :aria-label="collapsed ? 'Expand reference sheet' : 'Collapse reference sheet'"
          @click="collapsed = !collapsed"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path :d="collapsed ? 'm6 8 4 4 4-4' : 'm6 12 4-4 4 4'" />
          </svg>
        </button>
        <button type="button" aria-label="Close reference sheet" @click="emit('close')">×</button>
      </div>
    </div>

    <iframe
      v-if="!collapsed"
      class="pdf-reference-frame"
      :src="pdfUrl"
      :title="`${title} exam reference PDF`"
    />
  </aside>
</template>

<style scoped>
.pdf-reference-sheet {
  position: fixed;
  z-index: 90;
  top: 64px;
  left: 18px;
  width: min(560px, calc(100vw - 36px));
  height: min(720px, calc(100dvh - 96px));
  overflow: hidden;
  border: 1px solid #d2d5da;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
  color: #1e1e1e;
  transition: height 160ms ease;
}

.pdf-reference-sheet.collapsed { height: 52px; }

.pdf-reference-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid #e4e6e9;
  font-family: Arial, Helvetica, sans-serif;
}

.pdf-reference-titlebar strong {
  min-width: 0;
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-reference-titlebar div { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
.pdf-reference-titlebar button { display: grid; width: 34px; height: 34px; padding: 0; place-items: center; border: 0; border-radius: 7px; background: transparent; color: #555; font-size: 27px; line-height: 1; cursor: pointer; }
.pdf-reference-titlebar button:hover { background: #f0f1f3; }
.pdf-reference-titlebar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; }

.pdf-reference-frame {
  display: block;
  width: 100%;
  height: calc(100% - 52px);
  border: 0;
  background: #f1f3f5;
}

:global(.exam-app.dark-mode .pdf-reference-sheet) { border-color: #262626; background: #0a0a0a; color: #fafafa; }
:global(.exam-app.dark-mode .pdf-reference-titlebar) { border-color: #262626; }
:global(.exam-app.dark-mode .pdf-reference-titlebar button) { color: #a3a3a3; }
:global(.exam-app.dark-mode .pdf-reference-titlebar button:hover) { background: #262626; color: #fafafa; }

@media (max-width: 680px) {
  .pdf-reference-sheet {
    top: 72px;
    left: 12px;
    width: calc(100vw - 24px);
    height: calc(100dvh - 96px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pdf-reference-sheet { transition: none; }
}
</style>
