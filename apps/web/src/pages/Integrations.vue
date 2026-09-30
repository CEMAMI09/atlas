<script setup lang="ts">
import type { IntegrationModeOverride, IntegrationStatus } from '@atlas/shared'
import { onMounted } from 'vue'
import { api } from '@/lib/api'
import { useAtlas } from '@/stores/atlas'

const atlas = useAtlas()
onMounted(() => void atlas.loadIntegrations())
async function setMode(id: string, mode: IntegrationModeOverride) {
  const body = await api<{ integrations: IntegrationStatus[] }>(`/api/integrations/${id}/mode`, { method: 'POST', json: { mode } })
  atlas.integrations = body.integrations
}
</script>

<template>
  <div class="grid-page">
    <article v-for="item in atlas.integrations" :key="item.id" class="panel span-4">
      <div class="row">
        <strong>{{ item.displayName }}</strong>
        <span class="pill"><b>{{ item.state }}</b></span>
      </div>
      <p class="small muted">{{ item.description }}</p>
      <p class="small faint">{{ item.lastError || (item.configured ? 'Credentials present' : item.missingConfig.length ? `Missing ${item.missingConfig.join(', ')}` : 'Not configured') }}</p>
      <div v-if="item.discovered.length" class="small muted">Discovered: {{ item.discovered.map((entry) => entry.name).join(', ') }}</div>
      <div class="edit-bar">
        <a v-if="item.supportsOAuth && item.state !== 'CONNECTED'" class="btn" href="/api/integrations/google/start">Connect</a>
        <button class="btn" type="button" @click="setMode(item.id, 'mock')">Mock</button>
        <button class="btn" type="button" @click="setMode(item.id, 'auto')">Auto</button>
        <button class="btn-ghost" type="button" @click="setMode(item.id, 'disabled')">Disconnect</button>
      </div>
    </article>
  </div>
</template>
