<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: number
  role: ChatRole
  text: string
}

const props = defineProps<{
  open: boolean
  contextTitle: string
  contextDetail?: string
  panelWidth?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:panelWidth': [value: number]
}>()

const composer = ref('')
const messages = ref<ChatMessage[]>([])
const chatScroll = ref<HTMLElement | null>(null)
const composerInput = ref<HTMLTextAreaElement | null>(null)
const voiceActive = ref(false)
const voiceStatus = ref<'connecting' | 'listening' | 'muted'>('connecting')
const voiceTranscript = ref('')
const voiceSeconds = ref(0)
const lastVoiceDuration = ref<number | null>(null)
const assistantThinking = ref(false)
const floating = ref(false)
let nextMessageId = 1
let answerTimer: number | undefined
let voiceReadyTimer: number | undefined
let voiceClock: number | undefined
let recognition: any = null

const contextCopy = computed(() => props.contextDetail || props.contextTitle)

function togglePanel() {
  emit('update:open', !props.open)
  if (!props.open) void nextTick(() => composerInput.value?.focus())
}

function closePanel() {
  emit('update:open', false)
}

function resetChat() {
  stopAnswerTimer()
  messages.value = []
  lastVoiceDuration.value = null
  composer.value = ''
  void nextTick(() => composerInput.value?.focus())
}

function scrollToLatest() {
  void nextTick(() => {
    if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight
  })
}

function stopAnswerTimer() {
  if (answerTimer !== undefined) window.clearTimeout(answerTimer)
  answerTimer = undefined
  assistantThinking.value = false
}

function answerFor(message: string) {
  const value = message.toLowerCase()
  if (value.includes('practice') || value.includes('question')) {
    return `Try the Quick Practice at the end of this lesson first. I can explain any answer step by step and connect it back to ${props.contextTitle}.`
  }
  if (value.includes('formula') || value.includes('equation')) {
    return `For ${props.contextTitle}, start by naming the quantities and the relationship between them. Then isolate the unknown and check that your result fits the original conditions.`
  }
  return `Sure — ask me about any idea in ${props.contextTitle}. I can simplify the concept, walk through an example, or help you prepare for the Quick Practice.`
}

function queueAssistantReply(message: string) {
  assistantThinking.value = true
  answerTimer = window.setTimeout(() => {
    messages.value.push({ id: nextMessageId++, role: 'assistant', text: answerFor(message) })
    assistantThinking.value = false
    answerTimer = undefined
    scrollToLatest()
  }, 720)
}

function sendMessage() {
  const text = composer.value.trim()
  if (!text || assistantThinking.value) return
  messages.value.push({ id: nextMessageId++, role: 'user', text })
  composer.value = ''
  scrollToLatest()
  queueAssistantReply(text)
}

function onComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  sendMessage()
}

function clearVoiceTimers() {
  if (voiceReadyTimer !== undefined) window.clearTimeout(voiceReadyTimer)
  if (voiceClock !== undefined) window.clearInterval(voiceClock)
  voiceReadyTimer = undefined
  voiceClock = undefined
}

function startRecognition() {
  const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!Recognition) return
  try {
    recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript
      voiceTranscript.value = transcript.trim()
    }
    recognition.onerror = () => {
      voiceStatus.value = 'listening'
    }
    recognition.start()
  } catch {
    recognition = null
  }
}

function startVoice() {
  if (voiceActive.value) return
  voiceActive.value = true
  voiceStatus.value = 'connecting'
  voiceTranscript.value = ''
  voiceSeconds.value = 0
  lastVoiceDuration.value = null
  voiceReadyTimer = window.setTimeout(() => {
    voiceStatus.value = 'listening'
    voiceReadyTimer = undefined
    startRecognition()
  }, 650)
  voiceClock = window.setInterval(() => { voiceSeconds.value += 1 }, 1000)
}

function toggleMute() {
  if (voiceStatus.value === 'muted') {
    voiceStatus.value = 'listening'
    startRecognition()
    return
  }
  voiceStatus.value = 'muted'
  try { recognition?.stop?.() } catch { /* no-op */ }
  recognition = null
}

function endVoice() {
  const transcript = voiceTranscript.value.trim()
  try { recognition?.stop?.() } catch { /* no-op */ }
  recognition = null
  clearVoiceTimers()
  voiceActive.value = false
  lastVoiceDuration.value = voiceSeconds.value
  if (transcript) {
    messages.value.push({ id: nextMessageId++, role: 'user', text: transcript })
    queueAssistantReply(transcript)
  }
  scrollToLatest()
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, seconds)} seconds`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function beginResize(event: PointerEvent) {
  if (floating.value || window.innerWidth <= 1020) return
  const startX = event.clientX
  const startWidth = props.panelWidth || 344
  const onMove = (moveEvent: PointerEvent) => {
    const next = Math.min(520, Math.max(320, startWidth + startX - moveEvent.clientX))
    emit('update:panelWidth', Math.round(next))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) closePanel()
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onWindowKeydown)
    void nextTick(() => composerInput.value?.focus())
  } else {
    window.removeEventListener('keydown', onWindowKeydown)
    if (voiceActive.value) endVoice()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  stopAnswerTimer()
  clearVoiceTimers()
  try { recognition?.stop?.() } catch { /* no-op */ }
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <footer class="solvely-tutor-bar" aria-label="AI Tutor controls">
    <div class="solvely-tutor-brand">
      <span class="solvely-tutor-book" aria-hidden="true">♧</span>
      <span><strong>AI Tutor</strong><small>00:00 / 00:00</small></span>
    </div>
    <div class="solvely-tutor-player" aria-label="Lesson audio controls">
      <button type="button" aria-label="Previous audio segment" disabled>◁</button>
      <button type="button" class="solvely-play-button" aria-label="Play lesson audio">▶</button>
      <button type="button" aria-label="Next audio segment">▷</button>
    </div>
    <div class="solvely-tutor-actions">
      <button type="button" class="solvely-settings-button" aria-label="AI Tutor settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z"/><path d="M19.4 13.5c.05-.49.05-1.01 0-1.5l1.55-1.2-1.8-3.1-1.86.75a7.7 7.7 0 0 0-1.3-.75l-.27-1.98h-3.58l-.28 1.98c-.46.2-.9.45-1.3.75L8.7 7.7l-1.8 3.1L8.46 12a8.1 8.1 0 0 0 0 1.5L6.9 14.7l1.8 3.1 1.86-.75c.4.3.84.55 1.3.75l.28 1.98h3.58l.27-1.98c.46-.2.9-.45 1.3-.75l1.86.75 1.8-3.1-1.55-1.2Z"/></svg>
      </button>
      <button type="button" class="solvely-ask-button" :class="{ 'is-open': open }" :aria-expanded="open" @click="togglePanel">
        <img v-if="!open" src="/assets/solvely-ai-logo.jpeg" alt="" />
        <span>{{ open ? 'Hide Solvely' : 'Ask Solvely' }}</span>
      </button>
    </div>
  </footer>

  <div v-if="open && !floating" class="solvely-chat-resize" role="separator" aria-label="Resize chat panel" aria-orientation="vertical" @pointerdown="beginResize" />

  <aside v-if="open" class="solvely-chat-panel" :class="{ floating }" aria-label="Ask Solvely">
    <header class="solvely-chat-header">
      <button type="button" class="solvely-chat-title">New Chat <span>⌄</span></button>
      <div>
        <button type="button" aria-label="Start a new chat" title="Start a new chat" @click="resetChat">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
        </button>
        <button type="button" :aria-label="floating ? 'Dock chat' : 'Float chat'" :title="floating ? 'Dock chat' : 'Float chat'" @click="floating = !floating">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
        </button>
        <button type="button" aria-label="Hide chat" title="Hide chat" @click="closePanel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>
      </div>
    </header>

    <p class="solvely-chat-context">Context: {{ contextCopy }}</p>

    <div ref="chatScroll" class="solvely-chat-scroll" aria-live="polite">
      <div v-if="!messages.length && lastVoiceDuration === null" class="solvely-chat-empty">
        <img src="/assets/solvely-ai-logo.jpeg" alt="" />
        <h2>Hi! How can I help?</h2>
        <p>Ask me anything about <em>{{ contextCopy }}</em> .</p>
      </div>

      <div v-else class="solvely-chat-messages">
        <article v-for="message in messages" :key="message.id" :class="['solvely-chat-message', message.role]">
          <p>{{ message.text }}</p>
        </article>
        <article v-if="assistantThinking" class="solvely-chat-message assistant thinking" aria-label="Solvely is responding"><i /><i /><i /></article>
        <article v-if="lastVoiceDuration !== null" class="solvely-voice-ended">
          <strong><span>☎</span> VOICE CHAT HAS ENDED</strong>
          <p>This session lasted {{ formatDuration(lastVoiceDuration) }}.</p>
        </article>
      </div>

      <section v-if="voiceActive" class="solvely-voice-sheet" aria-label="Solvi Voice Chat">
        <span>Solvi Voice Chat</span>
        <div class="solvely-voice-orb" :class="voiceStatus"><i /><i /><i /></div>
        <h3>{{ voiceStatus === 'connecting' ? 'Just a moment...' : voiceStatus === 'muted' ? 'Microphone muted' : 'I’m listening...' }}</h3>
        <p v-if="voiceTranscript">{{ voiceTranscript }}</p>
        <footer>
          <button type="button" :class="{ muted: voiceStatus === 'muted' }" :aria-label="voiceStatus === 'muted' ? 'Unmute' : 'Mute'" @click="toggleMute">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>
          </button>
          <button type="button" class="end" aria-label="End" @click="endVoice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg> End
          </button>
        </footer>
      </section>
    </div>

    <form v-if="!voiceActive" class="solvely-chat-composer" @submit.prevent="sendMessage">
      <textarea ref="composerInput" v-model="composer" rows="1" placeholder="Ask Solvi anything..." aria-label="Ask Solvi anything..." @keydown="onComposerKeydown" />
      <button type="submit" class="solvely-send-button" :disabled="!composer.trim() || assistantThinking" aria-label="Send">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/></svg>
      </button>
      <span class="solvely-composer-divider" />
      <button type="button" class="solvely-voice-button" aria-label="Voice" title="Use Conversation Mode" @click="startVoice">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 5.5a7.5 7.5 0 0 0 0 13M16.6 5.5a7.5 7.5 0 0 1 0 13"/><path d="M9.7 8.6a4.2 4.2 0 0 0 0 6.8M14.3 8.6a4.2 4.2 0 0 1 0 6.8"/><circle cx="12" cy="12" r="1.3"/></svg>
      </button>
    </form>
  </aside>
</template>
