<script setup lang="ts">
import { onMounted } from 'vue'
import { formatTime } from '@/lib/format'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
</script>
<template>
  <section class="panel">
    <div v-for="event in atlas.snapshot?.calendar ?? []" :key="event.id" class="item">
      <strong>{{ event.title }}</strong>
      <span class="small muted">{{ formatTime(event.start, atlas.snapshot?.overview.timezone) }}{{ event.location ? ` · ${event.location}` : '' }}</span>
    </div>
    <p v-if="!atlas.snapshot?.calendar.length" class="muted small">Calendar is not available.</p>
  </section>
</template>
