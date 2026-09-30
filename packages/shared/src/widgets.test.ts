import { describe, expect, it } from 'vitest'
import { defaultLayout, normalizeWidget } from './widgets'

describe('dashboard layouts', () => {
  it('seeds the default desktop widgets with stable positions', () => {
    const layout = defaultLayout('desktop')
    expect(layout.find((widget) => widget.id === 'agenda')).toMatchObject({ x: 0, y: 3, w: 4, h: 6 })
    expect(layout.find((widget) => widget.id === 'system')).toMatchObject({ x: 6, y: 15, w: 6, h: 5 })
  })

  it('restores a widget inside its minimum size', () => {
    const widget = normalizeWidget({ id: 'agenda1', type: 'calendar.agenda', x: 0, y: 0, w: 1, h: 1, settings: {} }, 12)
    expect(widget.w).toBeGreaterThanOrEqual(3)
    expect(widget.h).toBeGreaterThanOrEqual(3)
  })
})
