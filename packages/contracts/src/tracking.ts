import { z } from 'zod';
import { ActivityException, SegmentClaim, SegmentKind, ProductivityCategory } from './enums.js';

export const TrackingSegmentSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  kind: z.enum([SegmentKind.ACTIVE, SegmentKind.IDLE, SegmentKind.LOCKED]),
  processName: z.string().min(1),
  appName: z.string().min(1),
  domain: z.string().nullable().optional(),
  windowTitle: z.string().nullable().optional(),
  keyCount: z.number().int().nonnegative(),
  mouseCount: z.number().int().nonnegative(),
  exception: z
    .enum([
      ActivityException.NONE,
      ActivityException.CALL_APP,
      ActivityException.MEETING_APP,
      ActivityException.MIC,
    ])
    .default(ActivityException.NONE),
  claim: z
    .enum([SegmentClaim.NONE, SegmentClaim.BREAK, SegmentClaim.AWAY_WORK])
    .default(SegmentClaim.NONE),
  clockSource: z.enum(['anchored', 'unanchored']).default('anchored'),
});
export type TrackingSegmentDto = z.infer<typeof TrackingSegmentSchema>;

export const BatchIngestSegmentsSchema = z.object({
  shiftId: z.string().uuid(),
  segments: z.array(TrackingSegmentSchema).min(1).max(500),
});
export type BatchIngestSegmentsDto = z.infer<typeof BatchIngestSegmentsSchema>;

export const BatchIngestResponseSchema = z.object({
  accepted: z.array(z.string().uuid()),
  rejected: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.enum(['OUTSIDE_SHIFT', 'OVERLAP', 'TOO_OLD', 'INVALID']),
    }),
  ),
});
export type BatchIngestResponseDto = z.infer<typeof BatchIngestResponseSchema>;

export const TamperEventSchema = z.object({
  type: z.enum([
    'agent_stopped',
    'extension_missing',
    'clock_changed',
    'binary_mismatch',
  ]),
  detail: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime(),
});
export type TamperEventDto = z.infer<typeof TamperEventSchema>;

export const CreateProductivityRuleSchema = z.object({
  targetType: z.enum(['app', 'domain']),
  pattern: z.string().min(1),
  category: z.enum([
    ProductivityCategory.PRODUCTIVE,
    ProductivityCategory.NEUTRAL,
    ProductivityCategory.UNPRODUCTIVE,
  ]),
  departmentId: z.string().uuid().nullable().optional(),
});
export type CreateProductivityRuleDto = z.infer<typeof CreateProductivityRuleSchema>;

export const CreateTrackingExclusionSchema = z.object({
  targetType: z.enum(['domain', 'app']),
  pattern: z.string().min(1),
});
export type CreateTrackingExclusionDto = z.infer<typeof CreateTrackingExclusionSchema>;

export const CreateActivityExceptionAppSchema = z.object({
  processName: z.string().min(1),
  type: z.enum(['call', 'meeting']),
});
export type CreateActivityExceptionAppDto = z.infer<typeof CreateActivityExceptionAppSchema>;
