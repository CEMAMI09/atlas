<script setup lang="ts">
import { onMounted } from 'vue'
import { money } from '@/lib/format'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
</script>
<template>
  <section class="panel">
    <template v-if="atlas.snapshot?.payments">
      <div class="metric">{{ money(atlas.snapshot.payments.mrr.amount) }}</div>
      <p class="small muted">Estimated MRR · {{ atlas.snapshot.payments.mode }} · {{ atlas.snapshot.payments.activeSubscriptions }} active</p>
    </template>
    <p v-else class="muted">No finance provider is connected. Stripe summary appears here in mock or live read-only mode.</p>
  </section>
</template>
