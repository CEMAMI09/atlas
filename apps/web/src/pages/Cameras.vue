<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
const still = reactive<Record<string, boolean>>({})
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
function streamUrl(id: string) {
  return `/api/cameras/${encodeURIComponent(id)}/stream`
}
</script>
<template>
  <div class="grid-page">
    <article v-for="camera in atlas.snapshot?.cameras ?? []" :key="camera.id" class="panel span-6">
      <div class="row"><strong>{{ camera.name }}</strong><span class="pill">{{ camera.provider }}</span></div>
      <img v-if="camera.streamAvailable && !still[camera.id]" :src="streamUrl(camera.id)" :alt="camera.name" style="width: 100%; margin-top: 8px; border-radius: 6px; background: #070708; min-height: 180px" @error="still[camera.id] = true" />
      <img v-else-if="camera.snapshotPath" :src="camera.snapshotPath" :alt="camera.name" style="width: 100%; margin-top: 8px; border-radius: 6px" />
      <p class="small muted">{{ camera.streamAvailable && !still[camera.id] ? 'Live view from Home Assistant.' : 'No live view. Showing the latest still, if Home Assistant has one.' }}</p>
    </article>
    <p v-if="!(atlas.snapshot?.cameras.length)" class="muted span-12">No cameras are available from Home Assistant.</p>
  </div>
</template>
