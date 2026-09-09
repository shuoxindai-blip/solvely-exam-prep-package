<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ProAccess } from '../composables/useProAccess'

type PrepHomeState = 'empty' | 'created'

const props = defineProps<{
  modelValue: ProAccess
  homeState?: PrepHomeState
  movable?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: ProAccess]
  'update:homeState': [value: PrepHomeState]
}>()

const controller = ref<HTMLElement | null>(null)
const position = ref<{ x: number; y: number } | null>(null)
const dragging = ref(false)
let dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null

const controllerStyle = computed(() => position.value
  ? {
      left: `${position.value.x}px`,
      top: `${position.value.y}px`,
      right: 'auto',
      bottom: 'auto',
    }
  : undefined)

function clampPosition(x: number, y: number) {
  const element = controller.value
  if (!element) return { x, y }

  const viewportMargin = 8
  const maxX = Math.max(viewportMargin, window.innerWidth - element.offsetWidth - viewportMargin)
  const maxY = Math.max(viewportMargin, window.innerHeight - element.offsetHeight - viewportMargin)
  return {
    x: Math.min(Math.max(viewportMargin, x), maxX),
    y: Math.min(Math.max(viewportMargin, y), maxY),
  }
}

function moveController(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return
  position.value = clampPosition(
    event.clientX - dragState.offsetX,
    event.clientY - dragState.offsetY,
  )
}

function stopDrag(event?: PointerEvent) {
  if (event && dragState && event.pointerId !== dragState.pointerId) return
  dragState = null
  dragging.value = false
  window.removeEventListener('pointermove', moveController)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function startDrag(event: PointerEvent) {
  if (!props.movable || event.button !== 0) return
  const element = controller.value
  if (!element) return

  const bounds = element.getBoundingClientRect()
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
  }
  position.value = { x: bounds.left, y: bounds.top }
  dragging.value = true
  window.addEventListener('pointermove', moveController)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  try {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  } catch {
    /* Synthetic pointer events may not support pointer capture. */
  }
  event.preventDefault()
}

function moveWithKeyboard(event: KeyboardEvent) {
  if (!props.movable || !event.key.startsWith('Arrow')) return
  const element = controller.value
  if (!element) return

  const distance = event.shiftKey ? 24 : 8
  const bounds = element.getBoundingClientRect()
  const movement = {
    ArrowLeft: { x: -distance, y: 0 },
    ArrowRight: { x: distance, y: 0 },
    ArrowUp: { x: 0, y: -distance },
    ArrowDown: { x: 0, y: distance },
  }[event.key]
  if (!movement) return

  position.value = clampPosition(bounds.left + movement.x, bounds.top + movement.y)
  event.preventDefault()
}

function keepInViewport() {
  if (!position.value) return
  position.value = clampPosition(position.value.x, position.value.y)
}

onMounted(() => {
  if (props.movable) window.addEventListener('resize', keepInViewport)
})

onBeforeUnmount(() => {
  stopDrag()
  window.removeEventListener('resize', keepInViewport)
})
</script>

<template>
  <aside
    ref="controller"
    :class="[
      'commercial-demo-controller',
      { 'has-home-state': homeState, 'is-movable': movable, 'is-dragging': dragging },
    ]"
    :style="controllerStyle"
    aria-label="Solvely 演示状态控制器"
  >
    <header
      :role="movable ? 'button' : undefined"
      :tabindex="movable ? 0 : undefined"
      :aria-label="movable ? '拖动演示控制器，可使用方向键移动' : undefined"
      :title="movable ? '拖动调整位置' : undefined"
      @pointerdown="startDrag"
      @keydown="moveWithKeyboard"
    >
      <strong>{{ homeState ? '备考首页状态' : '会员状态' }}</strong>
      <span><i v-if="movable" class="commercial-demo-drag-grip" aria-hidden="true" />仅供演示</span>
    </header>
    <nav v-if="homeState" class="commercial-home-state" aria-label="预览备考首页状态">
      <button
        v-for="option in [
          ['empty', '未创建备考'],
          ['created', '已创建 1 个备考'],
        ] as [PrepHomeState, string][]"
        :key="option[0]"
        type="button"
        :class="{ active: homeState === option[0] }"
        :aria-pressed="homeState === option[0]"
        @click="emit('update:homeState', option[0])"
      >
        {{ option[1] }}
      </button>
    </nav>
    <div :class="['commercial-member-state', { separated: homeState }]">
      <span v-if="homeState" class="commercial-demo-label">会员状态</span>
      <nav aria-label="预览会员状态">
      <button
        v-for="option in [
          ['free', '非会员'],
          ['member', 'Pro 会员'],
        ] as [ProAccess, string][]"
        :key="option[0]"
        type="button"
        :class="{ active: modelValue === option[0] }"
        :aria-pressed="modelValue === option[0]"
        @click="emit('update:modelValue', option[0])"
      >
        {{ option[1] }}
      </button>
      </nav>
    </div>
  </aside>
</template>
