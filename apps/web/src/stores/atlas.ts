import { defineStore } from 'pinia'
import type { AtlasSettings, DashboardLayout, DashboardSnapshot, IntegrationStatus, WidgetInstance } from '@atlas/shared'
import { api } from '@/lib/api'

export const useAtlas = defineStore('atlas', {
  state: () => ({
    snapshot: null as DashboardSnapshot | null,
    layout: null as DashboardLayout | null,
    settings: null as AtlasSettings | null,
    integrations: [] as IntegrationStatus[],
    editing: false,
    draft: null as WidgetInstance[] | null,
    connected: false,
  }),
  actions: {
    async loadHome(breakpoint: DashboardLayout['breakpoint']) {
      const [snapshot, layout, settings] = await Promise.all([
        api<DashboardSnapshot>('/api/snapshot'),
        api<DashboardLayout>(`/api/dashboard?breakpoint=${breakpoint}`),
        api<AtlasSettings>('/api/settings'),
      ])
      this.snapshot = snapshot
      this.layout = layout
      this.settings = settings
      document.documentElement.dataset.accent = settings.appearance.accentIntensity
      if (!this.editing) this.draft = layout.widgets.map((widget) => ({ ...widget }))
    },
    async saveLayout(breakpoint: DashboardLayout['breakpoint']) {
      if (!this.layout || !this.draft) return
      this.layout = await api<DashboardLayout>(`/api/dashboard?breakpoint=${breakpoint}`, {
        method: 'PUT',
        json: { widgets: this.draft, baseVersion: this.layout.version },
      })
      this.draft = this.layout.widgets.map((widget) => ({ ...widget }))
      this.editing = false
    },
    async resetLayout(breakpoint: DashboardLayout['breakpoint']) {
      this.layout = await api<DashboardLayout>(`/api/dashboard?breakpoint=${breakpoint}`, { method: 'DELETE' })
      this.draft = this.layout.widgets.map((widget) => ({ ...widget }))
      this.editing = false
    },
    async loadIntegrations() {
      const body = await api<{ integrations: IntegrationStatus[] }>('/api/integrations')
      this.integrations = body.integrations
    },
  },
})
