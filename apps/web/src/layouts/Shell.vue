<script setup lang="ts">
import {
  Activity,
  AudioLines,
  BedDouble,
  Box,
  Calendar,
  Cpu,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  Plug,
  Server,
  Settings,
  Shield,
  Video,
  Wallet,
  Workflow,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { breakpointForWidth } from '@atlas/shared'
import { useSession } from '@/stores/session'
import { useAtlas } from '@/stores/atlas'

const route = useRoute()
const router = useRouter()
const session = useSession()
const atlas = useAtlas()
const open = ref(false)
const ask = ref('')

const items = [
  { to: '/atlas', label: 'Atlas', icon: MessageSquare },
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/timeline', label: 'Timeline', icon: Activity },
  { to: '/cameras', label: 'Cameras', icon: Video },
  { to: '/room', label: 'Room', icon: BedDouble },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/conversations', label: 'Conversations', icon: AudioLines },
  { to: '/struct', label: 'Struct', icon: Box },
  { to: '/health', label: 'Health', icon: HeartPulse },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/automations', label: 'Automations', icon: Workflow },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/system', label: 'System', icon: Server },
]

const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : 'Atlas'))
const core = computed(() => (atlas.snapshot?.overview.atlas.state === 'online' ? 'Online' : 'Checking'))

function submitAsk() {
  const text = ask.value.trim()
  if (!text) return
  ask.value = ''
  void router.push({ path: '/atlas', query: { q: text } })
}

onMounted(() => {
  if (session.user && !atlas.snapshot) void atlas.loadHome(breakpointForWidth(window.innerWidth))
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open }">
      <div class="brand">
        <img src="/brand/atlas-icon.svg" alt="" />
        <div>
          <strong>Atlas OS</strong>
          <span>Personal intelligence</span>
        </div>
      </div>
      <nav class="nav">
        <RouterLink v-for="item in items" :key="item.to" :to="item.to" :class="{ active: item.to === '/' ? route.path === '/' : route.path.startsWith(item.to) }" @click="open = false">
          <component :is="item.icon" />
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="side-foot">
        <div class="status-row"><span class="dot" :class="atlas.connected ? 'live' : 'ok'" /> Atlas Core {{ core }}</div>
        <div class="status-row"><Shield :size="14" /> {{ atlas.snapshot?.overview.security.label ?? 'Security unknown' }}</div>
        <div class="user-row">
          <span class="avatar">{{ session.user?.initials }}</span>
          <span>{{ session.user?.name }}</span>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" type="button" aria-label="Menu" @click="open = !open"><Menu /></button>
        <div>
          <h1>{{ title }}</h1>
          <p v-if="atlas.snapshot">{{ atlas.snapshot.overview.greeting }}, {{ atlas.snapshot.overview.userName }}</p>
        </div>
        <form class="ask" @submit.prevent="submitAsk">
          <MessageSquare :size="15" />
          <input v-model="ask" placeholder="Ask Atlas" aria-label="Ask Atlas" />
        </form>
      </header>
      <div class="content"><slot /></div>
      <nav class="mobile-nav">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/atlas">Atlas</RouterLink>
        <RouterLink to="/timeline">Timeline</RouterLink>
        <RouterLink to="/cameras">Cameras</RouterLink>
        <RouterLink to="/settings">More</RouterLink>
      </nav>
    </div>
  </div>
</template>
