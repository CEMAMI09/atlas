<script setup lang="ts">
import { onMounted } from 'vue'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
</script>
<template>
  <section class="panel" v-if="atlas.snapshot?.room">
    <h2 style="margin-top: 0">{{ atlas.snapshot.room.room.name }}</h2>
    <div class="pills">
      <span class="pill">Occupancy <b>{{ atlas.snapshot.room.occupancy }}</b></span>
      <span class="pill">{{ atlas.snapshot.room.climate.temperatureC ?? '—' }}°C</span>
      <span class="pill">{{ atlas.snapshot.room.climate.humidity ?? '—' }}% humidity</span>
    </div>
    <div v-for="light in atlas.snapshot.room.lights" :key="light.id" class="item"><strong>{{ light.name }}</strong><span class="small muted">{{ light.on ? 'On' : 'Off' }}</span></div>
    <div v-for="door in atlas.snapshot.room.doors" :key="door.id" class="item"><strong>{{ door.name }}</strong><span class="small muted">{{ door.open ? 'Open' : door.locked ? 'Locked' : 'Closed' }}</span></div>
  </section>
  <p v-else class="muted">Room state is unavailable.</p>
</template>
