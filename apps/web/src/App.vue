<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Shell from '@/layouts/Shell.vue'

const route = useRoute()
const bare = computed(() => route.path === '/login' || route.path === '/setup')
</script>

<template>
  <RouterView v-if="bare" />
  <Shell v-else><RouterView /></Shell>
</template>
