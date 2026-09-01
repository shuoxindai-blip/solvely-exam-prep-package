<script setup lang="ts">
import type { ProAccess } from '../composables/useProAccess'

defineProps<{ modelValue: ProAccess }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProAccess] }>()
</script>

<template>
  <aside class="commercial-demo-controller" aria-label="Solvely Pro 演示会员控制器">
    <header>
      <strong>会员状态</strong>
      <span>仅供演示</span>
    </header>
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
  </aside>
</template>
