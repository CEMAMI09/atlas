import { z } from 'zod'
import { IsoDateTime } from './common'
import { isValidTimeZone } from './time'

export const TimeZoneName = z.string().max(100).refine(isValidTimeZone, 'Unknown time zone')

export const Password = z.string().min(12, 'Use at least 12 characters').max(256)

export const SetupInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(320),
  password: Password,
  timezone: TimeZoneName,
})
export type SetupInput = z.infer<typeof SetupInput>

export const LoginInput = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
})
export type LoginInput = z.infer<typeof LoginInput>

export const PublicUser = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  timezone: z.string(),
  initials: z.string(),
  onboardingCompletedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
})
export type PublicUser = z.infer<typeof PublicUser>

export const SessionInfo = z.object({
  user: PublicUser,
  csrfToken: z.string(),
  expiresAt: IsoDateTime,
})
export type SessionInfo = z.infer<typeof SessionInfo>

export const BootstrapStatus = z.object({
  needsSetup: z.boolean(),
  version: z.string(),
})
export type BootstrapStatus = z.infer<typeof BootstrapStatus>

export const UpdateProfileInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timezone: TimeZoneName.optional(),
})
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: Password,
})
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>

export const OnboardingStep = z.enum(['account', 'ai', 'google', 'home_assistant', 'vercel', 'stripe', 'privacy', 'dashboard'])
export type OnboardingStep = z.infer<typeof OnboardingStep>

export const OnboardingState = z.object({
  completed: z.boolean(),
  steps: z.record(OnboardingStep, z.enum(['pending', 'done', 'skipped'])),
})
export type OnboardingState = z.infer<typeof OnboardingState>
