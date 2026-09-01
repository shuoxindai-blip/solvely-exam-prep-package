<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  context?: string
}>(), {
  context: 'this SAT Prep experience',
})

const emit = defineEmits<{
  close: []
  unlock: []
}>()
const selectedPlan = ref<'weekly' | 'monthly' | 'yearly'>('weekly')

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(() => props.open, (open) => {
  document.body.classList.toggle('pro-paywall-open', open)
}, { immediate: true })

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('pro-paywall-open')
})
</script>

<template>
  <Teleport to="body">
    <Transition name="pro-paywall">
      <div v-if="open" class="pro-paywall-backdrop" @mousedown.self="emit('close')">
        <section
          class="pro-paywall"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proPaywallTitle"
        >
          <button class="pro-paywall-close" type="button" aria-label="Close" @click="emit('close')">×</button>
          <div class="pro-paywall-value">
            <span class="pro-mark" aria-hidden="true">x²</span>
            <p class="pro-eyebrow">SOLVELY PRO</p>
            <h2 id="proPaywallTitle">Turn focused practice into a higher SAT score.</h2>
            <p>Unlock {{ context }} and keep every lesson, test, and recommendation connected.</p>
            <ul>
              <li><i>✓</i><span><strong>100 interactive video lessons</strong><small>Video, written guidance, exit tickets, flashcards, and topic quizzes</small></span></li>
              <li><i>✓</i><span><strong>3,879 SAT practice questions</strong><small>Targeted practice across every Reading &amp; Writing and Math domain</small></span></li>
              <li><i>✓</i><span><strong>Full-length test and score insights</strong><small>Question review, topic performance, and adaptive next steps</small></span></li>
            </ul>
          </div>
          <div class="pro-paywall-offer">
            <p>Join millions of Solvely learners studying with less effort.</p>
            <label :class="['pro-plan', { selected: selectedPlan === 'weekly' }]">
              <input v-model="selectedPlan" type="radio" name="solvely-pro-plan" value="weekly" />
              <span><strong>Weekly</strong><b>$1.99 <small>first week</small></b></span>
              <em>Save 83%</em>
            </label>
            <label :class="['pro-plan', { selected: selectedPlan === 'monthly' }]">
              <input v-model="selectedPlan" type="radio" name="solvely-pro-plan" value="monthly" />
              <span><strong>Monthly</strong><b>$14.99 <small>/month</small></b></span>
            </label>
            <label :class="['pro-plan', { selected: selectedPlan === 'yearly' }]">
              <input v-model="selectedPlan" type="radio" name="solvely-pro-plan" value="yearly" />
              <span><strong>Yearly</strong><b>$6.66 <small>/month</small></b></span>
            </label>
            <button class="pro-unlock" type="button" @click="emit('unlock')">Unlock Pro</button>
            <button class="pro-restore" type="button" @click="emit('unlock')">Restore Purchase</button>
            <small class="pro-renewal">Renews automatically. Cancel anytime.</small>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
