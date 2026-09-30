<script setup lang="ts">
import { GridStack, type GridStackNode } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WidgetInstance } from '@atlas/shared'
import { minSizeFor } from '@atlas/shared'
import WidgetView from '@/components/WidgetView.vue'
import { useAtlas } from '@/stores/atlas'

const props = defineProps<{ editing: boolean; columns: number }>()
const atlas = useAtlas()
const root = ref<HTMLElement | null>(null)
let grid: GridStack | null = null

function widgets(): WidgetInstance[] {
  return atlas.draft ?? atlas.layout?.widgets ?? []
}

function mount() {
  if (!root.value) return
  grid?.destroy(false)
  const instance = GridStack.init(
    {
      column: props.columns,
      cellHeight: 72,
      margin: 6,
      animate: true,
      disableDrag: !props.editing,
      disableResize: !props.editing,
      draggable: { handle: '.widget-handle' },
    },
    root.value,
  )
  if (!instance) return
  grid = instance
  instance.on('change', (_event, items) => {
    if (!props.editing || !items || !atlas.draft) return
    for (const item of items) apply(item)
  })
}

function apply(item: GridStackNode) {
  const id = String(item.id ?? item.el?.getAttribute('gs-id') ?? '')
  const widget = atlas.draft?.find((entry) => entry.id === id)
  if (!widget || !atlas.draft) return
  widget.x = item.x ?? widget.x
  widget.y = item.y ?? widget.y
  widget.w = item.w ?? widget.w
  widget.h = item.h ?? widget.h
}

function remove(id: string) {
  if (!atlas.draft) return
  atlas.draft = atlas.draft.filter((widget) => widget.id !== id)
  void nextTick(mount)
}

onMounted(() => void nextTick(mount))
onBeforeUnmount(() => grid?.destroy(false))
watch(() => props.editing, () => void nextTick(mount))
watch(() => widgets().map((widget) => widget.id).join(','), () => void nextTick(mount))
</script>

<template>
  <div ref="root" class="grid-stack" :class="{ editing }">
    <div
      v-for="widget in widgets()"
      :key="widget.id"
      class="grid-stack-item"
      :gs-id="widget.id"
      :gs-x="widget.x"
      :gs-y="widget.y"
      :gs-w="widget.w"
      :gs-h="widget.h"
      :gs-min-w="minSizeFor(widget.type, columns).minW"
      :gs-min-h="minSizeFor(widget.type, columns).minH"
    >
      <div class="grid-stack-item-content">
        <div v-if="editing" class="widget-handle" style="position: absolute; z-index: 2; right: 8px; top: 6px; display: flex; gap: 4px">
          <button class="icon-btn" type="button" @click="remove(widget.id)">×</button>
        </div>
        <WidgetView :widget="widget" :snapshot="atlas.snapshot" />
      </div>
    </div>
  </div>
</template>
