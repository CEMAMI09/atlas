<script setup lang="ts">
import { onMounted } from 'vue'
import { api } from '@/lib/api'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
async function toggle(externalId: string, on: boolean) {
  await api(`/api/devices/${encodeURIComponent(externalId)}/state`, { method: 'POST', json: { on } })
  await atlas.loadHome('desktop')
}
</script>
<template>
  <section class="panel">
    <div v-for="device in atlas.snapshot?.devices ?? []" :key="device.id" class="item">
      <strong>{{ device.name }}</strong>
      <span class="small muted">{{ device.kind }} · {{ device.online === false ? 'offline' : device.state }}{{ device.battery != null ? ` · ${device.battery}%` : '' }}</span>
      <button v-if="device.kind === 'light'" class="btn" type="button" @click="toggle(device.externalId, device.state !== 'on')">{{ device.state === 'on' ? 'Turn off' : 'Turn on' }}</button>
    </div>
  </section>
</template>
