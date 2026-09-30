<script setup lang="ts">
import type { AtlasSettings, SettingsPatch } from '@atlas/shared'
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'

const settings = ref<AtlasSettings | null>(null)
onMounted(async () => {
  settings.value = await api<AtlasSettings>('/api/settings')
})
async function save(patch: SettingsPatch) {
  settings.value = await api<AtlasSettings>('/api/settings', { method: 'PATCH', json: patch })
  if (settings.value) document.documentElement.dataset.accent = settings.value.appearance.accentIntensity
}
</script>

<template>
  <div class="grid-page" v-if="settings">
    <section class="panel span-6">
      <h2 style="font-size: 14px">Appearance</h2>
      <label class="field">Accent
        <select :value="settings.appearance.accentIntensity" @change="save({ appearance: { accentIntensity: ($event.target as HTMLSelectElement).value as 'subtle' | 'standard' | 'strong' } })">
          <option value="subtle">Subtle</option>
          <option value="standard">Standard</option>
          <option value="strong">Strong</option>
        </select>
      </label>
      <p class="small muted">Dark theme only. Tokens are ready for more themes later.</p>
    </section>
    <section class="panel span-6">
      <h2 style="font-size: 14px">Developer</h2>
      <label class="small"><input type="checkbox" :checked="settings.developer.useMockIntegrations" @change="save({ developer: { useMockIntegrations: ($event.target as HTMLInputElement).checked } })" /> Use mock integrations</label>
      <p class="small muted">Mock data is labelled. Turning this off does not invent live values.</p>
    </section>
    <section class="panel span-6">
      <h2 style="font-size: 14px">Privacy</h2>
      <p class="small">Microphone is disabled until you explicitly enable transcription. Privacy mode stops capture.</p>
      <button class="btn" type="button" @click="api('/api/privacy', { method: 'PATCH', json: { privacyMode: true, micState: 'PRIVACY_MODE' } })">Enable privacy mode</button>
    </section>
    <section class="panel span-6">
      <h2 style="font-size: 14px">Atlas AI</h2>
      <label class="field">Router
        <select :value="settings.ai.routerMode" @change="save({ ai: { routerMode: ($event.target as HTMLSelectElement).value as 'auto' | 'fast' | 'reasoning' } })">
          <option value="auto">Auto</option>
          <option value="fast">Fast</option>
          <option value="reasoning">Reasoning</option>
        </select>
      </label>
    </section>
  </div>
</template>
