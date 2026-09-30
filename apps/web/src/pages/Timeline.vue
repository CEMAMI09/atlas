<script setup lang="ts">
import type { AtlasEvent, TimelinePage } from '@atlas/shared'
import { CATEGORY_LABELS } from '@atlas/shared'
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { useAtlas } from '@/stores/atlas'

const atlas = useAtlas()
const events = ref<AtlasEvent[]>([])
const category = ref('')
const q = ref('')

async function load() {
  const params = new URLSearchParams({ limit: '80' })
  if (category.value) params.set('categories', category.value)
  if (q.value) params.set('q', q.value)
  const page = await api<TimelinePage>(`/api/timeline?${params}`)
  events.value = page.events
}
onMounted(async () => {
  if (!atlas.snapshot) await atlas.loadHome('desktop')
  await load()
})
</script>

<template>
  <div class="edit-bar">
    <select v-model="category" class="btn" @change="load">
      <option value="">All categories</option>
      <option v-for="(label, key) in CATEGORY_LABELS" :key="key" :value="key">{{ label }}</option>
    </select>
    <input v-model="q" class="btn" placeholder="Search" @change="load" />
  </div>
  <section class="panel">
    <div v-for="event in events" :key="event.id" class="item">
      <strong>{{ formatTime(event.timestamp, atlas.snapshot?.overview.timezone) }} · {{ event.title }}</strong>
      <span class="small muted">{{ event.summary }} · {{ event.source }}{{ event.isMock ? ' · mock' : '' }}</span>
    </div>
    <p v-if="!events.length" class="muted small">No events in this view.</p>
  </section>
</template>
