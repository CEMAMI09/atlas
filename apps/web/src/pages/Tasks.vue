<script setup lang="ts">
import type { Task, TaskSuggestion } from '@atlas/shared'
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'

const tasks = ref<Task[]>([])
const suggestions = ref<TaskSuggestion[]>([])
const title = ref('')

async function load() {
  const body = await api<{ tasks: Task[]; suggestions: TaskSuggestion[] }>('/api/tasks?includeDone=true')
  tasks.value = body.tasks
  suggestions.value = body.suggestions
}
async function create() {
  if (!title.value.trim()) return
  await api('/api/tasks', { method: 'POST', json: { title: title.value } })
  title.value = ''
  await load()
}
async function complete(id: string) {
  await api(`/api/tasks/${id}`, { method: 'PATCH', json: { status: 'done' } })
  await load()
}
async function accept(id: string) {
  await api(`/api/suggestions/${id}/accept`, { method: 'POST', json: {} })
  await load()
}
onMounted(load)
</script>

<template>
  <form class="edit-bar" @submit.prevent="create">
    <input v-model="title" class="btn" placeholder="New task" style="flex: 1" />
    <button class="btn-accent" type="submit">Add</button>
  </form>
  <section class="panel">
    <div v-for="task in tasks" :key="task.id" class="item">
      <strong>{{ task.title }}</strong>
      <span class="small muted">{{ task.status }} · {{ task.priority }}{{ task.isMock ? ' · mock' : '' }}</span>
      <button v-if="task.status !== 'done'" class="btn" type="button" @click="complete(task.id)">Complete</button>
    </div>
  </section>
  <section v-if="suggestions.length" class="panel" style="margin-top: 12px">
    <h2 style="font-size: 14px">Suggestions</h2>
    <div v-for="item in suggestions" :key="item.id" class="item">
      <strong>{{ item.title }}</strong>
      <span class="small muted">{{ item.detail }}</span>
      <button class="btn" type="button" @click="accept(item.id)">Accept</button>
    </div>
  </section>
</template>
