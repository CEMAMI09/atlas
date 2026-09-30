<script setup lang="ts">
import type { DashboardSnapshot, WidgetInstance, WidgetType } from '@atlas/shared'
import { WIDGET_DEFINITIONS } from '@atlas/shared'
import { formatTime, money } from '@/lib/format'

const props = defineProps<{ widget: WidgetInstance; snapshot: DashboardSnapshot | null }>()
const def = WIDGET_DEFINITIONS[props.widget.type as WidgetType]
const snap = () => props.snapshot
</script>

<template>
  <article class="widget">
    <header>
      <strong>{{ def?.name ?? widget.type }}</strong>
      <span v-if="snapshot?.overview.mockMode" class="faint">Mock</span>
    </header>
    <div class="body">
      <template v-if="widget.type === 'atlas.status' && snap()">
        <div class="metric">{{ snap()!.overview.greeting }}</div>
        <p class="muted small">{{ snap()!.overview.userName }} · {{ snap()!.overview.atlas.aiAvailable ? 'AI ready' : 'AI not configured' }}</p>
        <div class="pills" style="margin-top: 8px">
          <span class="pill">Room <b>{{ snap()!.overview.room.label }}</b></span>
          <span class="pill">Security <b>{{ snap()!.overview.security.label }}</b></span>
          <span class="pill">Server <b>{{ snap()!.overview.server.label }}</b></span>
        </div>
      </template>
      <template v-else-if="widget.type === 'atlas.chat'">
        <p class="small muted">Ask from the bar above. Answers use Atlas tools.</p>
      </template>
      <template v-else-if="widget.type === 'room.state'">
        <div class="metric">{{ snap()?.room?.room.name ?? 'No room' }}</div>
        <p class="small muted">{{ snap()?.room?.occupancy ?? 'Unknown' }} · {{ snap()?.room?.climate.temperatureC ?? '—' }}°C</p>
      </template>
      <template v-else-if="widget.type === 'security.status'">
        <div class="metric">{{ snap()?.security?.mode ?? 'Unknown' }}</div>
        <p class="small muted">{{ snap()?.security?.panelName ?? 'No panel' }}</p>
      </template>
      <template v-else-if="widget.type === 'calendar.next'">
        <div class="metric" style="font-size: 16px">{{ snap()?.overview.nextEvent?.title ?? 'Nothing next' }}</div>
        <p class="small muted">{{ formatTime(snap()?.overview.nextEvent?.start, snap()?.overview.timezone) }}</p>
      </template>
      <template v-else-if="widget.type === 'calendar.agenda'">
        <div v-if="!snap()?.calendar.length" class="muted small">No events in range.</div>
        <div v-for="event in snap()?.calendar.slice(0, 6)" :key="event.id" class="item">
          <strong>{{ event.title }}</strong>
          <span class="small muted">{{ formatTime(event.start, snap()?.overview.timezone) }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'tasks.list'">
        <div v-for="task in snap()?.tasks.slice(0, 6)" :key="task.id" class="item">
          <strong>{{ task.title }}</strong>
          <span class="small muted">{{ task.priority }} · {{ task.status }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'timeline.recent'">
        <div v-for="event in snap()?.events.slice(0, 6)" :key="event.id" class="item">
          <strong>{{ event.title }}</strong>
          <span class="small muted">{{ formatTime(event.timestamp, snap()?.overview.timezone) }} · {{ event.source }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'cameras.preview'">
        <img v-if="snap()?.cameras[0]?.streamAvailable" :src="`/api/cameras/${encodeURIComponent(snap()!.cameras[0]!.id)}/stream`" :alt="snap()!.cameras[0]!.name" style="width: 100%; border-radius: 6px; display: block; background: #070708; min-height: 120px" />
        <img v-else-if="snap()?.cameras[0]?.snapshotPath" :src="snap()!.cameras[0]!.snapshotPath!" :alt="snap()!.cameras[0]!.name" style="width: 100%; border-radius: 6px; display: block" />
        <p class="small muted">{{ snap()?.cameras[0]?.streamAvailable ? 'Live view' : 'No live stream' }}</p>
      </template>
      <template v-else-if="widget.type === 'struct.status'">
        <div class="metric">{{ snap()?.project?.health ?? 'Unknown' }}</div>
        <p class="small muted">{{ snap()?.project?.healthReasons[0] }}</p>
        <p v-if="snap()?.project?.payments.summary" class="small">MRR {{ money(snap()!.project!.payments.summary!.mrr.amount) }}</p>
      </template>
      <template v-else-if="widget.type === 'email.important'">
        <div v-for="mail in snap()?.emails.slice(0, 4)" :key="mail.id" class="item">
          <strong>{{ mail.subject }}</strong>
          <span class="small muted">{{ mail.from.name }} · {{ mail.snippet }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'vercel.deployments'">
        <div v-for="item in snap()?.deployments.slice(0, 4)" :key="item.id" class="item">
          <strong>{{ item.projectName }} · {{ item.state }}</strong>
          <span class="small muted">{{ item.commitMessage }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'stripe.summary'">
        <div class="metric">{{ snap()?.payments ? money(snap()!.payments!.mrr.amount) : '—' }}</div>
        <p class="small muted">{{ snap()?.payments ? `${snap()!.payments!.activeSubscriptions} active subscriptions` : 'Stripe is not connected' }}</p>
      </template>
      <template v-else-if="widget.type === 'conversations.recent'">
        <div v-for="item in snap()?.conversations.slice(0, 3)" :key="item.id" class="item">
          <strong>{{ item.title }}</strong>
          <span class="small muted">{{ item.summary?.summary }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'system.health'">
        <div class="metric">{{ snap()?.overview.server.label }}</div>
        <p class="small muted">Database and services are reported on the System page.</p>
      </template>
      <template v-else-if="widget.type === 'weather.current'">
        <div class="metric">{{ snap()?.weather.temperatureC ?? '—' }}°</div>
        <p class="small muted">{{ snap()?.weather.available ? snap()?.weather.condition : 'Weather provider is not configured' }}</p>
      </template>
      <template v-else-if="widget.type === 'presence.ring'">
        <div class="metric">{{ snap()?.presence?.status ?? 'Unknown' }}</div>
        <p class="small muted">{{ snap()?.presence?.roomName ?? 'No ring hardware' }} · confidence {{ snap()?.presence?.confidence ?? 0 }}</p>
      </template>
      <template v-else-if="widget.type === 'devices.status'">
        <div v-for="device in snap()?.devices.slice(0, 5)" :key="device.id" class="item">
          <strong>{{ device.name }}</strong>
          <span class="small muted">{{ device.online ? device.state : 'offline' }}</span>
        </div>
      </template>
      <template v-else-if="widget.type === 'controls.quick'">
        <p class="small muted">Lights can be toggled from Devices. Actions are audited.</p>
      </template>
      <p v-else class="small muted">Waiting for data.</p>
    </div>
  </article>
</template>
