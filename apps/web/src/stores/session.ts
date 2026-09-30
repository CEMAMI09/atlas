import { defineStore } from 'pinia'
import type { PublicUser } from '@atlas/shared'
import { api, setCsrfToken } from '@/lib/api'

export const useSession = defineStore('session', {
  state: () => ({
    ready: false,
    needsSetup: false,
    user: null as PublicUser | null,
    csrfToken: '',
  }),
  actions: {
    async bootstrap() {
      const status = await api<{ needsSetup: boolean }>('/api/bootstrap')
      this.needsSetup = status.needsSetup
      if (!status.needsSetup) {
        const session = await api<{ user: PublicUser | null; csrfToken?: string }>('/api/auth/session')
        this.user = session.user
        this.csrfToken = session.csrfToken ?? ''
        setCsrfToken(this.csrfToken || null)
      }
      this.ready = true
    },
    async setup(input: { name: string; email: string; password: string; timezone: string }) {
      const session = await api<{ user: PublicUser; csrfToken: string }>('/api/auth/setup', { method: 'POST', json: input })
      this.user = session.user
      this.csrfToken = session.csrfToken
      this.needsSetup = false
      setCsrfToken(session.csrfToken)
    },
    async login(email: string, password: string) {
      const session = await api<{ user: PublicUser; csrfToken: string }>('/api/auth/login', { method: 'POST', json: { email, password } })
      this.user = session.user
      this.csrfToken = session.csrfToken
      setCsrfToken(session.csrfToken)
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST', json: {} })
      this.user = null
      this.csrfToken = ''
      setCsrfToken(null)
    },
  },
})
