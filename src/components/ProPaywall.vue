<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

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

type PlanId = 'weekly' | 'monthly' | 'yearly'

const plans: Array<{
  id: PlanId
  name: string
  price: string
  cadence: string
  previousPrice: string
  badge?: string
  renewal: string
}> = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: '$1.99',
    cadence: '1st wk',
    previousPrice: '$11.22/wk',
    badge: 'SAVE 83% ⚡',
    renewal: 'then $9.99/wk. Cancel anytime',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$14.99',
    cadence: '/mo',
    previousPrice: '$16.99/mo',
    renewal: '$14.99/month. Cancel anytime',
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '$6.66',
    cadence: '/mo',
    previousPrice: '$199.99/yr',
    renewal: 'Billed yearly. Cancel anytime',
  },
]

const selectedPlan = ref<PlanId>('weekly')
const activePlan = computed(() => plans.find((plan) => plan.id === selectedPlan.value) ?? plans[0])

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close')
}

watch(() => props.open, (open) => {
  document.body.classList.toggle('pro-paywall-open', open)
  if (open) selectedPlan.value = 'weekly'
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
          aria-describedby="proPaywallContext"
        >
          <button class="pro-paywall-back" type="button" aria-label="Back" @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5m6-6-6 6 6 6" />
            </svg>
          </button>
          <div class="pro-paywall-value">
            <h2 id="proPaywallTitle">
              Turn Hours of Studying into <strong>Minutes,</strong><br />
              Unlock Your <strong>GPA Boost Bundle</strong>
            </h2>
            <span id="proPaywallContext" class="sr-only">Unlock {{ context }} with Solvely Pro.</span>
            <svg class="pro-paywall-underline" viewBox="0 0 142 14" aria-hidden="true">
              <path d="M5 9C41 0 94 2 137 9" />
            </svg>

            <div class="pro-growth-chart" aria-label="Illustration of grades improving toward a goal">
              <svg viewBox="0 0 470 172" role="img" aria-hidden="true">
                <defs>
                  <linearGradient id="proGrowthLine" x1="44" y1="0" x2="405" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#5E9CFF" />
                    <stop offset=".34" stop-color="#ED5CE9" />
                    <stop offset="1" stop-color="#FF4E16" />
                  </linearGradient>
                  <linearGradient id="proGrowthFill" x1="0" y1="52" x2="0" y2="157" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#FF7A56" stop-opacity=".28" />
                    <stop offset="1" stop-color="#FF7A56" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <text x="0" y="27" class="pro-chart-label pro-chart-label-title">GPA</text>
                <text x="7" y="45" class="pro-chart-label pro-chart-label-score">4.0</text>
                <text x="7" y="78" class="pro-chart-label">3.5</text>
                <text x="7" y="151" class="pro-chart-label">2.5</text>
                <line x1="44" x2="405" y1="39" y2="39" class="pro-chart-grid" />
                <line x1="44" x2="405" y1="72" y2="72" class="pro-chart-grid" />
                <line x1="44" x2="405" y1="145" y2="145" class="pro-chart-grid" />
                <path d="M57 127C98 127 99 107 145 106C231 105 312 91 397 52L397 145H57Z" fill="url(#proGrowthFill)" />
                <path d="M57 127C98 127 99 107 145 106C231 105 312 91 397 52" fill="none" stroke="url(#proGrowthLine)" stroke-width="3" stroke-linecap="round" />
                <line x1="105" x2="105" y1="120" y2="145" class="pro-chart-drop" />
                <line x1="145" x2="145" y1="108" y2="145" class="pro-chart-drop" />
                <line x1="397" x2="397" y1="53" y2="145" class="pro-chart-drop" />
                <circle cx="105" cy="119" r="8" fill="#669CF5" stroke="#fff" stroke-width="2" />
                <circle cx="145" cy="106" r="8" fill="#E359D7" stroke="#fff" stroke-width="2" />
              </svg>
              <strong class="pro-chart-goal">GOAL</strong>
              <span class="pro-chart-rocket" aria-hidden="true">🚀</span>
            </div>

            <div class="pro-feature-table" role="table" aria-label="Solvely Pro feature comparison">
              <div class="pro-feature-row pro-feature-head" role="row">
                <strong role="columnheader">Features</strong>
                <strong role="columnheader">Free</strong>
                <strong class="pro-infinity" role="columnheader" aria-label="Solvely Pro">∞</strong>
              </div>
              <div v-for="feature in ['Unlimited Exam Predictions', 'Full Mock Exam Score Reports', 'Personalized Targeted Practice', 'Ask Solvely AI Tutor', 'Unlimited AI Live Notes']" :key="feature" class="pro-feature-row" role="row">
                <span role="cell">{{ feature }}</span>
                <i role="cell" aria-label="Not included">−</i>
                <svg role="cell" viewBox="0 0 24 24" aria-label="Included">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </div>
            </div>
          </div>
          <div class="pro-paywall-offer">
            <p>Join 5,000,000+ Solvely users<br />getting better grades with less effort</p>
            <fieldset class="pro-plan-list">
              <legend class="sr-only">Choose a Solvely Pro plan</legend>
              <label
                v-for="plan in plans"
                :key="plan.id"
                :class="['pro-plan', { selected: selectedPlan === plan.id }]"
              >
                <input v-model="selectedPlan" type="radio" name="solvely-pro-plan" :value="plan.id" />
                <span class="pro-plan-radio" aria-hidden="true"></span>
                <span class="pro-plan-copy">
                  <strong>{{ plan.name }}</strong>
                  <span class="pro-plan-price"><b>{{ plan.price }}</b> <small>{{ plan.cadence }}</small> <del>{{ plan.previousPrice }}</del></span>
                </span>
                <em v-if="plan.badge">{{ plan.badge }}</em>
              </label>
            </fieldset>
            <button class="pro-unlock" type="button" @click="emit('unlock')">🚀 Unlock for {{ activePlan.price }}</button>
            <small class="pro-renewal">{{ activePlan.renewal }}</small>
            <ul class="pro-legal">
              <li>Your auto-renew subscription starts immediately. You will be charged after the valid subscription has expired.</li>
              <li><a href="#" @click.prevent>Terms &amp; Conditions</a> <span>|</span> <a href="#" @click.prevent>Privacy Policy</a></li>
            </ul>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
