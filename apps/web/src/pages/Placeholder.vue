<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
<template>
  <section class="panel">
    <h2 style="margin-top: 0">{{ route.meta.title }}</h2>
    <p class="muted">{{ String(route.meta.note ?? '') }}</p>
  </section>
</template>
