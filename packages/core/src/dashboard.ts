import { and, asc, eq } from 'drizzle-orm'
import { dashboardLayouts, dashboardWidgets, type Database, type Executor } from '@atlas/database'
import {
  AtlasError,
  BREAKPOINT_COLUMNS,
  DashboardLayout,
  SaveLayoutInput,
  WidgetInstance,
  WidgetType,
  defaultLayout,
  normalizeWidget,
  type Breakpoint,
} from '@atlas/shared'

export async function readLayout(db: Executor, userId: string, breakpoint: Breakpoint): Promise<DashboardLayout> {
  const columns = BREAKPOINT_COLUMNS[breakpoint]
  const layouts = await db
    .select()
    .from(dashboardLayouts)
    .where(and(eq(dashboardLayouts.userId, userId), eq(dashboardLayouts.name, 'overview'), eq(dashboardLayouts.breakpoint, breakpoint)))
    .limit(1)
  const layout = layouts[0]
  if (!layout) {
    return { breakpoint, columns, widgets: defaultLayout(breakpoint), isDefault: true, version: 0, updatedAt: null }
  }
  const widgets = await db.select().from(dashboardWidgets).where(eq(dashboardWidgets.layoutId, layout.id)).orderBy(asc(dashboardWidgets.sortOrder))
  const parsed = widgets.flatMap((widget) => {
    if (!WidgetType.safeParse(widget.type).success) return []
    const instance = WidgetInstance.safeParse({
      id: widget.instanceId,
      type: widget.type,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      settings: widget.settings ?? {},
    })
    if (!instance.success) return []
    const data = instance.data
    return [normalizeWidget({ id: data.id, type: data.type, x: data.x, y: data.y, w: data.w, h: data.h, settings: data.settings ?? {} }, columns)]
  })
  return {
    breakpoint,
    columns,
    widgets: parsed.length > 0 ? parsed : defaultLayout(breakpoint),
    isDefault: false,
    version: layout.version,
    updatedAt: layout.updatedAt.toISOString(),
  }
}

export async function saveLayout(db: Database, userId: string, breakpoint: Breakpoint, input: SaveLayoutInput): Promise<DashboardLayout> {
  const columns = BREAKPOINT_COLUMNS[breakpoint]
  const widgets = input.widgets.map((widget) =>
    normalizeWidget({ id: widget.id, type: widget.type, x: widget.x, y: widget.y, w: widget.w, h: widget.h, settings: widget.settings ?? {} }, columns),
  )
  const ids = new Set(widgets.map((widget) => widget.id))
  if (ids.size !== widgets.length) throw new AtlasError('VALIDATION_FAILED', 'Widget ids must be unique.')

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.userId, userId), eq(dashboardLayouts.name, 'overview'), eq(dashboardLayouts.breakpoint, breakpoint)))
      .limit(1)
    const current = existing[0]
    if (input.baseVersion !== null && current && current.version !== input.baseVersion) {
      throw new AtlasError('CONFLICT', 'The dashboard changed somewhere else. Reload and try again.')
    }
    if (input.baseVersion !== null && !current && input.baseVersion !== 0) {
      throw new AtlasError('CONFLICT', 'The dashboard changed somewhere else. Reload and try again.')
    }
    let layoutId = current?.id
    const version = (current?.version ?? 0) + 1
    if (!layoutId) {
      const inserted = await tx
        .insert(dashboardLayouts)
        .values({ userId, name: 'overview', breakpoint, columns, version })
        .returning({ id: dashboardLayouts.id })
      layoutId = inserted[0]?.id
    } else {
      await tx.update(dashboardLayouts).set({ version, columns, updatedAt: new Date() }).where(eq(dashboardLayouts.id, layoutId))
      await tx.delete(dashboardWidgets).where(eq(dashboardWidgets.layoutId, layoutId))
    }
    if (!layoutId) throw new AtlasError('INTERNAL', 'Could not save the dashboard.')
    if (widgets.length > 0) {
      await tx.insert(dashboardWidgets).values(
        widgets.map((widget, index) => ({
          layoutId: layoutId!,
          instanceId: widget.id,
          type: widget.type,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          settings: widget.settings,
          sortOrder: index,
        })),
      )
    }
    return readLayout(tx, userId, breakpoint)
  })
}

export async function resetLayout(db: Database, userId: string, breakpoint: Breakpoint): Promise<DashboardLayout> {
  const existing = await db
    .select()
    .from(dashboardLayouts)
    .where(and(eq(dashboardLayouts.userId, userId), eq(dashboardLayouts.name, 'overview'), eq(dashboardLayouts.breakpoint, breakpoint)))
    .limit(1)
  const layout = existing[0]
  if (layout) await db.delete(dashboardLayouts).where(eq(dashboardLayouts.id, layout.id))
  return readLayout(db, userId, breakpoint)
}
