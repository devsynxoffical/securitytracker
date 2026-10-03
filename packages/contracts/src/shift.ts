import { z } from 'zod';
import { ShiftEventType, ShiftState } from './enums.js';

export const ShiftEventItemSchema = z.object({
  clientEventId: z.string().uuid(),
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
  shiftId: z.string().uuid().optional(),
});
export type HeartbeatDto = z.infer<typeof HeartbeatSchema>;

export const HeartbeatResponseSchema = z.object({
  serverTime: z.string().datetime(),
  configVersion: z.number().int(),
  commands: z.array(z.string()),
});
export type HeartbeatResponseDto = z.infer<typeof HeartbeatResponseSchema>;
