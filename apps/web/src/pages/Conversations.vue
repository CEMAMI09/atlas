<script setup lang="ts">
import type { Conversation, ConversationDetail } from '@atlas/shared'
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'

const items = ref<Conversation[]>([])
const detail = ref<ConversationDetail | null>(null)
onMounted(async () => {
  items.value = (await api<{ conversations: Conversation[] }>('/api/conversations')).conversations
})
async function open(id: string) {
  detail.value = await api<ConversationDetail>(`/api/conversations/${id}`)
}
</script>

<template>
  <div class="grid-page">
    <section class="panel span-4">
      <button v-for="item in items" :key="item.id" class="item" type="button" @click="open(item.id)">
        <strong>{{ item.title }}</strong>
        <span class="small muted">{{ item.summary?.summary }}</span>
      </button>
    </section>
    <section class="panel span-8">
      <template v-if="detail">
        <h2 style="margin: 0 0 8px; font-size: 16px">{{ detail.title }}</h2>
        <p class="small">{{ detail.summary?.summary }}</p>
        <p class="small muted">Topics: {{ detail.summary?.topics.join(', ') || 'none' }}</p>
        <div v-for="segment in detail.segments" :key="segment.id" class="item">
          <strong>{{ segment.speaker }}</strong>
          <span>{{ segment.text }}</span>
        </div>
        <p class="faint small">Possible tasks stay suggestions until you accept them on Tasks.</p>
      </template>
      <p v-else class="muted small">Select a conversation. Recordings are not running.</p>
    </section>
  </div>
</template>
