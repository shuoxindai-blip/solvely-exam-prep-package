<script setup lang="ts">
import type { ProAccess } from '../composables/useProAccess'

type PrepHomeState = 'empty' | 'created'

defineProps<{
  modelValue: ProAccess
  homeState?: PrepHomeState
}>()
const emit = defineEmits<{
  'update:modelValue': [value: ProAccess]
  'update:homeState': [value: PrepHomeState]
}>()
</script>

<template>
  <aside
    :class="['commercial-demo-controller', { 'has-home-state': homeState }]"
    aria-label="Solvely 演示状态控制器"
  >
    <header>
      <strong>{{ homeState ? '备考首页状态' : '会员状态' }}</strong>
      <span>仅供演示</span>
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
