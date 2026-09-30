<script setup lang="ts">
import { onMounted } from 'vue'
import { money } from '@/lib/format'
import { useAtlas } from '@/stores/atlas'
const atlas = useAtlas()
onMounted(() => { if (!atlas.snapshot) void atlas.loadHome('desktop') })
</script>
<template>
  <section class="panel" v-if="atlas.snapshot?.project">
    <div class="row"><h2 style="margin: 0">{{ atlas.snapshot.project.name }}</h2><span class="pill"><b>{{ atlas.snapshot.project.health }}</b></span></div>
    <p v-for="reason in atlas.snapshot.project.healthReasons" :key="reason" class="small muted">{{ reason }}</p>
    <p v-if="atlas.snapshot.project.payments.summary">MRR {{ money(atlas.snapshot.project.payments.summary.mrr.amount) }} · mock figures until Stripe is live.</p>
    <div v-for="item in atlas.snapshot.project.deployments.recent" :key="item.id" class="item">
      <strong>{{ item.target }} · {{ item.state }}</strong>
      <span class="small muted">{{ item.commitMessage }}{{ item.errorMessage ? ` · ${item.errorMessage}` : '' }}</span>
    </div>
  </section>
</template>
