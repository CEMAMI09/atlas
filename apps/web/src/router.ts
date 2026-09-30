import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup', component: () => import('@/pages/Auth.vue'), meta: { setup: true } },
    { path: '/login', component: () => import('@/pages/Auth.vue') },
    { path: '/', component: () => import('@/pages/Overview.vue'), meta: { title: 'Overview' } },
    { path: '/atlas', component: () => import('@/pages/Chat.vue'), meta: { title: 'Atlas' } },
    { path: '/timeline', component: () => import('@/pages/Timeline.vue'), meta: { title: 'Timeline' } },
    { path: '/cameras', component: () => import('@/pages/Cameras.vue'), meta: { title: 'Cameras' } },
    { path: '/room', component: () => import('@/pages/Room.vue'), meta: { title: 'Room' } },
    { path: '/calendar', component: () => import('@/pages/Calendar.vue'), meta: { title: 'Calendar' } },
    { path: '/tasks', component: () => import('@/pages/Tasks.vue'), meta: { title: 'Tasks' } },
    { path: '/conversations', component: () => import('@/pages/Conversations.vue'), meta: { title: 'Conversations' } },
    { path: '/struct', component: () => import('@/pages/Struct.vue'), meta: { title: 'Struct' } },
    { path: '/health', component: () => import('@/pages/Placeholder.vue'), meta: { title: 'Health', note: 'No health provider is connected.' } },
    { path: '/finance', component: () => import('@/pages/Finance.vue'), meta: { title: 'Finance' } },
    { path: '/automations', component: () => import('@/pages/Automations.vue'), meta: { title: 'Automations' } },
    { path: '/devices', component: () => import('@/pages/Devices.vue'), meta: { title: 'Devices' } },
    { path: '/integrations', component: () => import('@/pages/Integrations.vue'), meta: { title: 'Integrations' } },
    { path: '/settings', component: () => import('@/pages/Settings.vue'), meta: { title: 'Settings' } },
    { path: '/system', component: () => import('@/pages/System.vue'), meta: { title: 'System' } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSession()
  if (!session.ready) await session.bootstrap()
  if (session.needsSetup && to.path !== '/setup') return '/setup'
  if (!session.needsSetup && to.path === '/setup') return '/'
  if (!session.user && to.path !== '/login' && to.path !== '/setup') return '/login'
  if (session.user && (to.path === '/login' || to.path === '/setup')) return '/'
  return true
})

export default router
