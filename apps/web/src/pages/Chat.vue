<script setup lang="ts">
import { useChat } from '@ai-sdk/vue'
import { SUGGESTED_QUERIES } from '@atlas/shared'
import { DefaultChatTransport, type UIMessage } from 'ai'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { useSession } from '@/stores/session'

const session = useSession()
const route = useRoute()
const router = useRouter()
const input = ref('')
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const transport = new DefaultChatTransport({
  api: '/api/chat',
  credentials: 'include',
  headers: () => ({ 'x-csrf-token': session.csrfToken }),
  body: () => ({ threadId: chatId.value }),
})
const chatId = ref<string>(crypto.randomUUID())
const { messages, sendMessage, status, stop, error } = useChat({ id: chatId.value, transport })
const threads = ref<{ id: string; title: string }[]>([])

function fresh() {
  chatId.value = crypto.randomUUID()
  messages.value = []
}
function html(text: string) {
  return DOMPurify.sanitize(md.render(text))
}
function textOf(message: UIMessage) {
  return message.parts.filter((part) => part.type === 'text').map((part) => (part.type === 'text' ? part.text : '')).join('\n')
}
function tools(message: UIMessage) {
  return message.parts.filter((part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool')
}
function toolLabel(type: string) {
  const name = type.replace(/^tool-/, '')
  const index = name.indexOf('_')
  return index === -1 ? name : `${name.slice(0, index)}.${name.slice(index + 1)}`
}
async function ask(text: string) {
  const value = text.trim()
  if (!value) return
  input.value = ''
  await sendMessage({ text: value })
  threads.value = (await api<{ threads: { id: string; title: string }[] }>('/api/chat/threads')).threads
}
async function openThread(id: string) {
  chatId.value = id
  const body = await api<{ messages: UIMessage[] }>(`/api/chat/threads/${id}`)
  messages.value = body.messages
}
onMounted(async () => {
  threads.value = (await api<{ threads: { id: string; title: string }[] }>('/api/chat/threads')).threads
  const q = route.query.q
  if (typeof q === 'string' && q.trim()) {
    await router.replace({ query: {} })
    await ask(q)
  }
})
</script>

<template>
  <div class="chat-layout">
    <aside class="panel">
      <button class="btn" type="button" @click="fresh">New conversation</button>
      <div class="list" style="margin-top: 10px">
        <button v-for="thread in threads" :key="thread.id" class="item" type="button" @click="openThread(thread.id)">
          <strong>{{ thread.title }}</strong>
        </button>
      </div>
    </aside>
    <section class="panel" style="display: flex; flex-direction: column">
      <div class="suggestions">
        <button v-for="query in SUGGESTED_QUERIES" :key="query" type="button" @click="ask(query)">{{ query }}</button>
      </div>
      <div class="messages" style="flex: 1">
        <article v-for="message in messages" :key="message.id" class="bubble">
          <div class="who">{{ message.role === 'user' ? 'You' : 'Atlas' }} · {{ formatTime(new Date().toISOString()) }}</div>
          <div v-if="message.role === 'assistant'" class="md-source">
            {{ tools(message).length ? 'From Atlas tools' : 'Model response' }}
          </div>
          <details v-for="(part, index) in tools(message)" :key="index" class="tool-card">
            <summary>{{ toolLabel(part.type) }} · {{ 'state' in part ? part.state : 'tool' }}</summary>
            <pre>{{ JSON.stringify('output' in part ? part.output : part, null, 2) }}</pre>
          </details>
          <div class="text" v-html="html(textOf(message))" />
        </article>
        <p v-if="error" class="error">{{ error.message }}</p>
      </div>
      <form class="composer" @submit.prevent="ask(input)">
        <input v-model="input" placeholder="Ask Atlas" :disabled="status === 'streaming'" />
        <button v-if="status === 'streaming' || status === 'submitted'" class="btn" type="button" @click="stop()">Stop</button>
        <button class="btn" type="button" disabled title="Voice input is not enabled">Voice</button>
        <button class="btn-accent" type="submit">Send</button>
      </form>
    </section>
  </div>
</template>
