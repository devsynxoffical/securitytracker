import { z } from 'zod';
import { ShiftEventType, ShiftState } from './enums.js';

export const ShiftEventItemSchema = z.object({
  clientEventId: z.string().guid(),
  type: z.enum([
    ShiftEventType.START,
    ShiftEventType.BREAK_START,
    ShiftEventType.BREAK_END,
    ShiftEventType.END,
  ]),
  breakType: z.string().optional(),
  occurredAt: z.string().datetime(),
  monotonicOffsetMs: z.number().int().nonnegative().optional(),
});
export type ShiftEventItemDto = z.infer<typeof ShiftEventItemSchema>;

export const ShiftEventsBatchSchema = z.object({
  events: z.array(ShiftEventItemSchema).min(1),
});
export type ShiftEventsBatchDto = z.infer<typeof ShiftEventsBatchSchema>;

export const HeartbeatSchema = z.object({
  state: z.enum([
    ShiftState.OFF_SHIFT,
    ShiftState.WORKING,
    ShiftState.ON_BREAK,
    ShiftState.ENDED,
  ]),
  clientClock: z.string().datetime(),
  queueSize: z.number().int().nonnegative(),
  shiftId: z.string().guid().optional(),
});
export type HeartbeatDto = z.infer<typeof HeartbeatSchema>;

/** Why a shift the client still believes open is closed on the server (F5 rule 4, 03 F5). */
export const ShiftClosedReason = {
  AUTO_CLOSED_NO_HEARTBEAT: 'auto_closed_no_heartbeat',
  AUTO_CLOSED_MAX_LENGTH: 'auto_closed_max_length',
  ENDED_ELSEWHERE: 'ended_elsewhere',
  ENDED: 'ended',
} as const;
export type ShiftClosedReasonType = (typeof ShiftClosedReason)[keyof typeof ShiftClosedReason];

export const ClosedShiftSchema = z.object({
  id: z.string().guid(),
  endedAt: z.string().datetime().nullable(),
  reason: z.enum([
    ShiftClosedReason.AUTO_CLOSED_NO_HEARTBEAT,
    ShiftClosedReason.AUTO_CLOSED_MAX_LENGTH,
    ShiftClosedReason.ENDED_ELSEWHERE,
    ShiftClosedReason.ENDED,
  ]),
});
export type ClosedShiftDto = z.infer<typeof ClosedShiftSchema>;

/** Server to client command carried on the heartbeat response. */
export const HeartbeatCommandSchema = z.object({
  type: z.literal('shift_closed'),
  shiftId: z.string().guid(),
  endedAt: z.string().datetime().nullable(),
  reason: ClosedShiftSchema.shape.reason,
});
export type HeartbeatCommandDto = z.infer<typeof HeartbeatCommandSchema>;

export const HeartbeatResponseSchema = z.object({
  serverTime: z.string().datetime(),
  configVersion: z.number().int(),
  commands: z.array(HeartbeatCommandSchema),
});
export type HeartbeatResponseDto = z.infer<typeof HeartbeatResponseSchema>;

/** Flags the server sets on a shift record (F5, F8). */
export const ShiftFlag = {
  EARLY_START: 'early_start',
  OUTSIDE_SCHEDULE: 'outside_schedule',
  UNSCHEDULED: 'unscheduled',
  SHORT_SHIFT: 'short_shift',
  AUTO_CLOSED: 'auto_closed',
  OFFLINE_START: 'offline_start',
  RECOVERED: 'recovered',
} as const;

export const ShiftEventsResponseSchema = z.object({
  success: z.literal(true),
  processedEventsCount: z.number().int().nonnegative(),
  /** Every client event id the server has seen (created, duplicate or dropped): the client deletes them. */
  acknowledgedEventIds: z.array(z.string().guid()),
  /** Id of the employee's open shift after the batch; the desktop replaces its provisional id with it. */
  shiftId: z.string().guid().nullable(),
  currentShift: z.unknown().nullable(),
  /** Set when a break, end or claim event referred to a shift that is no longer open. */
  closedShift: ClosedShiftSchema.nullable(),
});
export type ShiftEventsResponseDto = z.infer<typeof ShiftEventsResponseSchema>;
