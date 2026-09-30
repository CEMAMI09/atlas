import { z } from 'zod'
import { IsoDateTime } from './common'

export const TaskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done', 'canceled'])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskPriority = z.enum(['low', 'normal', 'high', 'urgent'])
export type TaskPriority = z.infer<typeof TaskPriority>

export const TaskSource = z.enum(['manual', 'atlas', 'conversation', 'email', 'calendar', 'automation', 'import'])
export type TaskSource = z.infer<typeof TaskSource>

const Tag = z.string().trim().min(1).max(40)

export const Task = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatus,
  priority: TaskPriority,
  dueAt: IsoDateTime.nullable(),
  source: TaskSource,
  project: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
  isMock: z.boolean(),
})
export type Task = z.infer<typeof Task>

export const CreateTaskInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: TaskPriority.default('normal'),
  dueAt: IsoDateTime.nullable().optional(),
  project: z.string().trim().max(120).nullable().optional(),
  tags: z.array(Tag).max(20).default([]),
})
export type CreateTaskInput = z.input<typeof CreateTaskInput>

export const UpdateTaskInput = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(5000).nullable(),
    status: TaskStatus,
    priority: TaskPriority,
    dueAt: IsoDateTime.nullable(),
    project: z.string().trim().max(120).nullable(),
    tags: z.array(Tag).max(20),
  })
  .partial()
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>

export const TaskListQuery = z.object({
  status: z.array(TaskStatus).max(5).optional(),
  includeDone: z.boolean().default(false),
  project: z.string().max(120).optional(),
  dueBefore: IsoDateTime.optional(),
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).default(100),
})
export type TaskListQuery = z.input<typeof TaskListQuery>

export const TaskSuggestionStatus = z.enum(['pending', 'accepted', 'dismissed'])
export type TaskSuggestionStatus = z.infer<typeof TaskSuggestionStatus>

/** A possible task extracted from a conversation or email. Never becomes a task without approval. */
export const TaskSuggestion = z.object({
  id: z.uuid(),
  title: z.string(),
  detail: z.string().nullable(),
  sourceKind: z.enum(['conversation', 'email', 'calendar']),
  sourceId: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: TaskSuggestionStatus,
  createdAt: IsoDateTime,
  isMock: z.boolean(),
})
export type TaskSuggestion = z.infer<typeof TaskSuggestion>
