<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ close: [] }>()

const expression = ref('')
const answer = ref(0)
const displayResult = ref('0')
const errorMessage = ref('')
const angleMode = ref<'DEG' | 'RAD'>('DEG')
const history = ref<Array<{ expression: string; result: string }>>([])

const displayExpression = computed(() => expression.value || '0')

const keys = [
  ['(', ')', '%', 'AC'],
  ['sin(', 'cos(', 'tan(', '√('],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['0', '.', '⌫', '+'],
  ['π', '^', 'Ans', '='],
]

function formatNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error('Result is not finite')
  if (Math.abs(value) < 1e-12) return '0'
  return Number(value.toPrecision(12)).toString()
}

function evaluate(input: string) {
  const source = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, String(Math.PI)).replace(/Ans/g, String(answer.value)).replace(/√/g, 'sqrt')
  let position = 0

  const skip = () => {
    while (/\s/.test(source[position] ?? '')) position += 1
  }
  const peek = () => {
    skip()
    return source[position]
  }
  const consume = (token: string) => {
    skip()
    if (source.slice(position, position + token.length) === token) {
      position += token.length
      return true
    }
    return false
  }
  const parseNumber = () => {
    skip()
    const match = source.slice(position).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i)
    if (!match) throw new Error('Expected a number')
    position += match[0].length
    return Number(match[0])
  }
  const applyFunction = (name: string, value: number) => {
    const radians = angleMode.value === 'DEG' ? (value * Math.PI) / 180 : value
    if (name === 'sin') return Math.sin(radians)
    if (name === 'cos') return Math.cos(radians)
    if (name === 'tan') return Math.tan(radians)
    if (name === 'sqrt') return Math.sqrt(value)
    if (name === 'log') return Math.log10(value)
    if (name === 'ln') return Math.log(value)
    throw new Error('Unknown function')
  }
  const parsePrimary = (): number => {
    skip()
    if (consume('(')) {
      const value = parseExpression()
      if (!consume(')')) throw new Error('Missing closing parenthesis')
      return value
    }
    const identifier = source.slice(position).match(/^[a-z]+/i)?.[0]
    if (identifier) {
      position += identifier.length
      if (!consume('(')) throw new Error('Expected parenthesis')
      const value = parseExpression()
      if (!consume(')')) throw new Error('Missing closing parenthesis')
      return applyFunction(identifier, value)
    }
    return parseNumber()
  }
  const parsePostfix = () => {
    let value = parsePrimary()
    while (consume('%')) value /= 100
    return value
  }
  const parseUnary = (): number => {
    if (consume('+')) return parseUnary()
    if (consume('-')) return -parseUnary()
    return parsePostfix()
  }
  const parsePower = (): number => {
    const left = parseUnary()
    return consume('^') ? left ** parsePower() : left
  }
  const parseTerm = () => {
    let value = parsePower()
    while (true) {
      if (consume('*')) value *= parsePower()
      else if (consume('/')) value /= parsePower()
      else break
    }
    return value
  }
  function parseExpression() {
    let value = parseTerm()
    while (true) {
      if (consume('+')) value += parseTerm()
      else if (consume('-')) value -= parseTerm()
      else break
    }
    return value
  }

  const value = parseExpression()
  if (peek() !== undefined) throw new Error('Check the expression')
  return value
}

function calculate() {
  if (!expression.value.trim()) return
  try {
    const original = expression.value
    const value = evaluate(original)
    const formatted = formatNumber(value)
    answer.value = value
    displayResult.value = formatted
    history.value.unshift({ expression: original, result: formatted })
    history.value = history.value.slice(0, 5)
    errorMessage.value = ''
  } catch {
    errorMessage.value = 'Invalid expression'
    displayResult.value = 'Error'
  }
}

function press(key: string) {
  errorMessage.value = ''
  if (key === '=') return calculate()
  if (key === 'AC') {
    expression.value = ''
    displayResult.value = '0'
    return
  }
  if (key === '⌫') {
    expression.value = expression.value.slice(0, -1)
    return
  }
  expression.value += key
}

function useHistory(item: { expression: string; result: string }) {
  expression.value = item.result
  displayResult.value = item.result
}

function onKeydown(event: KeyboardEvent) {
  const map: Record<string, string> = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '⌫', Escape: 'AC' }
  const key = map[event.key] ?? event.key
  if (/^[0-9.+()%]$/.test(key) || ['×', '÷', '−', '=', '⌫', 'AC', '^'].includes(key)) {
    event.preventDefault()
    press(key)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="calculator-shell" aria-label="Scientific calculator">
    <header class="calculator-titlebar">
      <strong>Calculator</strong>
      <button class="angle-mode" type="button" :aria-label="`Angle mode ${angleMode}`" @click="angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG'">{{ angleMode }}</button>
      <button class="calculator-close" type="button" aria-label="Close calculator" @click="emit('close')">×</button>
    </header>

    <div class="calculator-body">
      <div class="calculator-display" aria-live="polite">
        <span>{{ displayExpression }}</span>
        <strong>{{ displayResult }}</strong>
        <small v-if="errorMessage">{{ errorMessage }}</small>
      </div>

      <div class="calculator-keys">
        <button v-for="key in keys.flat()" :key="key" type="button" :class="{ operator: ['÷', '×', '−', '+', '^', '='].includes(key), utility: ['AC', '⌫', '%'].includes(key), function: key.includes('(') }" @click="press(key)">{{ key }}</button>
      </div>

      <aside class="calculator-history" aria-label="Calculation history">
        <div><strong>History</strong><button v-if="history.length" type="button" @click="history = []">Clear</button></div>
        <p v-if="!history.length">Your calculations will appear here.</p>
        <button v-for="item in history" :key="`${item.expression}-${item.result}`" type="button" @click="useHistory(item)"><span>{{ item.expression }}</span><strong>= {{ item.result }}</strong></button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.calculator-shell {
  display: grid;
  grid-template-rows: 54px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid #d4d4d4;
  border-radius: 10px;
  overflow: hidden;
  background: #f7f7f8;
  color: #171717;
  font-family: Arial, Helvetica, sans-serif;
}

.calculator-titlebar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 15px;
  border-bottom: 1px solid #d4d4d4;
  background: #fff;
}

.calculator-titlebar strong { font-size: 16px; }
.calculator-titlebar button { border: 0; background: transparent; cursor: pointer; }
.angle-mode { padding: 7px 13px; border-radius: 7px !important; background: #eeeeef !important; color: #525252; font-size: 12px; font-weight: 700; }
.calculator-close { justify-self: end; color: #555; font-size: 28px; font-weight: 300; line-height: 1; }

.calculator-body {
  display: grid;
  grid-template-rows: auto auto minmax(100px, 1fr);
  min-height: 0;
  padding: 18px;
  overflow: auto;
}

.calculator-display {
  display: flex;
  min-height: 118px;
  padding: 18px 20px;
  border: 1px solid #d7d7d7;
  border-radius: 10px;
  background: #fff;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, .03);
}

.calculator-display span { width: 100%; overflow: hidden; color: #747474; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.calculator-display strong { max-width: 100%; margin-top: 8px; overflow: hidden; font-size: clamp(27px, 3vw, 42px); font-weight: 500; text-overflow: ellipsis; }
.calculator-display small { margin-top: 4px; color: #d22; }

.calculator-keys {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.calculator-keys button {
  min-height: 46px;
  border: 1px solid #d3d3d3;
  border-radius: 8px;
  background: #fff;
  color: #202020;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 1px rgba(0, 0, 0, .04);
}

.calculator-keys button:hover { background: #ececec; }
.calculator-keys button:active { transform: translateY(1px); }
.calculator-keys .operator { border-color: #9fdcf1; background: #dff6ff; color: #047aa2; }
.calculator-keys .utility { background: #ededee; color: #555; }
.calculator-keys .function { font-size: 14px; }

.calculator-history { min-height: 0; margin-top: 18px; padding-top: 14px; border-top: 1px solid #dadada; overflow: auto; }
.calculator-history > div { display: flex; justify-content: space-between; }
.calculator-history > div button { border: 0; background: transparent; color: #777; cursor: pointer; }
.calculator-history p { color: #929292; font-size: 13px; }
.calculator-history > button { display: flex; width: 100%; padding: 9px 4px; border: 0; border-bottom: 1px solid #e4e4e4; background: transparent; justify-content: space-between; cursor: pointer; }
.calculator-history > button span { max-width: 65%; overflow: hidden; color: #777; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 760px) {
  .calculator-body { padding: 12px; }
  .calculator-keys { gap: 6px; }
  .calculator-keys button { min-height: 42px; }
}

@media (prefers-reduced-motion: reduce) {
  .calculator-keys button:active { transform: none; }
}
</style>
