<script setup lang="ts">
import type { ExamPlusAccess } from '../composables/useExamPlusAccess'

defineProps<{ modelValue: ExamPlusAccess }>()
const emit = defineEmits<{ 'update:modelValue': [value: ExamPlusAccess] }>()
</script>

<template>
  <aside class="commercial-demo-controller" aria-label="Exam Plus demo access controller">
    <header>
      <strong>Commercial access</strong>
      <span>Not product UI</span>
    </header>
    <nav aria-label="Preview membership state">
      <button
        v-for="option in [
          ['free', 'Non-member'],
          ['member', 'Exam Plus'],
        ] as [ExamPlusAccess, string][]"
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
