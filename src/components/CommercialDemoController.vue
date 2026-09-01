<script setup lang="ts">
import type { ProAccess } from '../composables/useProAccess'

defineProps<{ modelValue: ProAccess }>()
const emit = defineEmits<{ 'update:modelValue': [value: ProAccess] }>()
</script>

<template>
  <aside class="commercial-demo-controller" aria-label="Solvely Pro demo access controller">
    <header>
      <strong>Commercial access</strong>
      <span>Not product UI</span>
    </header>
    <nav aria-label="Preview membership state">
      <button
        v-for="option in [
          ['free', 'Non-member'],
          ['member', 'Pro'],
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
