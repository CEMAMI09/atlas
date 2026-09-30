<script setup lang="ts">
import { breakpointForWidth, WIDGET_DEFINITIONS, type WidgetType } from '@atlas/shared'
import { computed, onMounted, ref } from 'vue'
import DashboardGrid from '@/components/DashboardGrid.vue'
import { formatDay } from '@/lib/format'
import { useAtlas } from '@/stores/atlas'

const atlas = useAtlas()
const breakpoint = ref(breakpointForWidth(window.innerWidth))
const adding = ref<WidgetType | ''>('')
const types = Object.values(WIDGET_DEFINITIONS)
const overview = computed(() => atlas.snapshot?.overview)

onMounted(() => void atlas.loadHome(breakpoint.value))
window.addEventListener('resize', () => {
  const next = breakpointForWidth(window.innerWidth)
  if (next !== breakpoint.value) {
    breakpoint.value = next
    void atlas.loadHome(next)
  }
})

function edit() {
  atlas.editing = true
  atlas.draft = (atlas.layout?.widgets ?? []).map((widget) => ({ ...widget, settings: { ...widget.settings } }))
}
function add() {
  if (!adding.value || !atlas.draft) return
  const def = WIDGET_DEFINITIONS[adding.value]
  atlas.draft.push({
    id: `w${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    type: adding.value,
    x: 0,
    y: 80,
    w: def.defaultW,
    h: def.defaultH,
    settings: {},
  })
  adding.value = ''
}
</script>

<template>
  <section v-if="overview" class="pills" style="margin-bottom: 12px">
    <span class="pill">{{ formatDay(overview.now, overview.timezone) }}</span>
    <span class="pill">Atlas <b>{{ overview.atlas.state }}</b></span>
    <span class="pill">Room <b>{{ overview.room.label }}</b></span>
    <span class="pill">Security <b>{{ overview.security.label }}</b></span>
    <span class="pill">Next <b>{{ overview.nextEvent?.title ?? 'None' }}</b></span>
    <span class="pill">Server <b>{{ overview.server.label }}</b></span>
  </section>
  <div class="edit-bar">
    <template v-if="!atlas.editing">
      <button class="btn" type="button" @click="edit">Edit dashboard</button>
    </template>
    <template v-else>
      <select v-model="adding" class="btn">
        <option value="">Add widget</option>
        <option v-for="item in types" :key="item.type" :value="item.type">{{ item.name }}</option>
      </select>
      <button class="btn" type="button" @click="add">Add</button>
      <button class="btn-accent" type="button" @click="atlas.saveLayout(breakpoint)">Save</button>
      <button class="btn-ghost" type="button" @click="atlas.loadHome(breakpoint).then(() => (atlas.editing = false))">Cancel</button>
      <button class="btn-ghost" type="button" @click="atlas.resetLayout(breakpoint)">Reset</button>
    </template>
  </div>
  <DashboardGrid :editing="atlas.editing" :columns="atlas.layout?.columns ?? 12" />
</template>
