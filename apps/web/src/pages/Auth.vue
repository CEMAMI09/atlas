<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/lib/api'
import { useSession } from '@/stores/session'

const session = useSession()
const route = useRoute()
const router = useRouter()
const setup = route.path === '/setup'
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (setup) await session.setup({ name: name.value, email: email.value, password: password.value, timezone })
    else await session.login(email.value, password.value)
    await router.push('/')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth">
    <form class="auth-card card" @submit.prevent="submit">
      <img src="/brand/atlas-wordmark.svg" alt="Atlas" />
      <h1 style="font-size: 20px; margin: 16px 0 4px">{{ setup ? 'Welcome to Atlas' : 'Sign in' }}</h1>
      <p class="muted small">{{ setup ? 'Create the local account for this Atlas server. Integrations stay optional.' : 'This server keeps its own account. Nothing is sent to a hosted Atlas.' }}</p>
      <label v-if="setup" class="field">Name <input v-model="name" required autocomplete="name" /></label>
      <label class="field">Email <input v-model="email" type="email" required autocomplete="username" /></label>
      <label class="field">Password <input v-model="password" type="password" required minlength="12" autocomplete="current-password" /></label>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-accent" type="submit" :disabled="busy">{{ setup ? 'Create account' : 'Sign in' }}</button>
    </form>
  </main>
</template>
