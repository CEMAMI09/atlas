<script setup lang="ts">
import type { SystemStatus } from '@atlas/shared'
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'

const status = ref<SystemStatus | null>(null)
onMounted(async () => {
  status.value = await api<SystemStatus>('/api/system')
})
</script>

<template>
  <section v-if="status" class="grid-page">
    <article class="panel span-4"><div class="metric">{{ status.overall }}</div><p class="small muted">Atlas {{ status.version }} · {{ status.environment }}</p></article>
    <article class="panel span-4"><div class="metric">{{ status.database.state }}</div><p class="small muted">{{ status.database.engine }} · pgvector {{ status.database.pgvector ? 'on' : 'off' }}</p></article>
    <article class="panel span-4"><div class="metric">{{ Math.round(status.host.memoryUsedBytes / 1048576) }} MB</div><p class="small muted">Host memory in use · {{ status.host.cpuCount }} CPUs</p></article>
    <article class="panel span-12">
      <div v-for="service in status.services" :key="service.id" class="item">
        <strong>{{ service.name }}</strong>
        <span class="small muted">{{ service.state }}{{ service.detail ? ` · ${service.detail}` : '' }}</span>
      </div>
    </article>
  </section>
</template>
