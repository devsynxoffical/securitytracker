import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ShiftEventsBatchDto,
  ShiftEventsResponseDto,
  HeartbeatDto,
  HeartbeatResponseDto,
  ClosedShiftDto,
  ShiftClosedReason,
  ShiftClosedReasonType,
  ShiftEndReason,
  ShiftEventType,
  ShiftFlag,
  ShiftState,
  ErrorCodes,
  shiftPolicyFrom,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScheduleLike, isWorkday, localDateToDbDate, resolveAttendanceDate } from '../attendance/schedule.util';

const EARLY_START_MS = 60 * 60_000;

interface ShiftContext {
  timezone: string;
  minShiftMinutes: number;
  schedule: ScheduleLike | null;
}

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  /**
   * Process shift lifecycle events with idempotency and monotonic time reconstruction (F5, F7).
   */
  async processEvents(
    employeeId: string,
    deviceId: string,
    companyId: string,
    dto: ShiftEventsBatchDto,
  ): Promise<ShiftEventsResponseDto> {
    // Sort events chronologically
    const sortedEvents = [...dto.events].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const processedShiftIds: string[] = [];
    const acknowledgedEventIds: string[] = [];
    let closedShift: ClosedShiftDto | null = null;

    for (const event of sortedEvents) {
      // 1. Check idempotency on clientEventId
      const existingEvent = await this.prisma.shiftEvent.findUnique({
        where: { clientEventId: event.clientEventId },
      });
      if (existingEvent) {
        acknowledgedEventIds.push(event.clientEventId);
        continue;
      }

      const eventTime = new Date(event.occurredAt);

      if (event.type === ShiftEventType.START) {
        // Check for existing open shift
        const openShift = await this.prisma.shift.findFirst({
          where: {
            employeeId,
            state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] },
          },
          include: { device: true },
        });

        if (openShift) {
          if (openShift.deviceId !== deviceId) {
            throw new ConflictException({
              code: ErrorCodes.SHIFT_ALREADY_OPEN,
              message: `A shift is already open on device: ${openShift.device.name}`,
              details: { shiftId: openShift.id, deviceName: openShift.device.name },
            });
          }
          // Same device: keep and link
          processedShiftIds.push(openShift.id);
          continue;
        }

        // Determine attendance date per F8 (binds night shifts crossing midnight to scheduled start date)
        const ctx = await this.shiftContext(employeeId, companyId, eventTime);
        const resolved = resolveAttendanceDate(eventTime, ctx.schedule, ctx.timezone);
        const flags = startFlags(eventTime, resolved, ctx);
        if (event.monotonicOffsetMs) flags.push(ShiftFlag.OFFLINE_START);

        const newShift = await this.prisma.shift.create({
          data: {
            employeeId,
            deviceId,
            attendanceDate: localDateToDbDate(resolved.date),
            startedAt: eventTime,
            state: ShiftState.WORKING,
            lastHeartbeatAt: this.clock.now(),
            flags,
          },
        });

        await this.prisma.shiftEvent.create({
          data: {
            shiftId: newShift.id,
            clientEventId: event.clientEventId,
            type: event.type,
            occurredAt: eventTime,
            receivedAt: this.clock.now(),
            reconstructed: !!event.monotonicOffsetMs,
          },
        });

        processedShiftIds.push(newShift.id);
        acknowledgedEventIds.push(event.clientEventId);
      } else {
        // Requires open shift
        const activeShift = await this.prisma.shift.findFirst({
          where: {
            employeeId,
            state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] },
          },
        });

        if (!activeShift) {
          // The shift the client refers to is closed (auto-close, other device, admin). Acknowledge the
          // event so the client drops it and tell it why the shift is gone.
          acknowledgedEventIds.push(event.clientEventId);
          if (!closedShift) {
            const last = await this.prisma.shift.findFirst({ where: { employeeId }, orderBy: { startedAt: 'desc' } });
            if (last && last.state === ShiftState.ENDED) closedShift = this.describeClosed(last, deviceId);
          }
          continue;
        }
        acknowledgedEventIds.push(event.clientEventId);

        if (event.type === ShiftEventType.BREAK_START) {
          await this.prisma.$transaction([
            this.prisma.shift.update({
              where: { id: activeShift.id },
              data: { state: ShiftState.ON_BREAK, lastHeartbeatAt: this.clock.now() },
            }),
            this.prisma.shiftBreak.create({
              data: {
                shiftId: activeShift.id,
                type: event.breakType || 'general',
                startedAt: eventTime,
              },
            }),
            this.prisma.shiftEvent.create({
              data: {
                shiftId: activeShift.id,
                clientEventId: event.clientEventId,
                type: event.type,
                breakType: event.breakType,
                occurredAt: eventTime,
                receivedAt: this.clock.now(),
                reconstructed: !!event.monotonicOffsetMs,
              },
            }),
          ]);
        } else if (event.type === ShiftEventType.BREAK_END) {
          const openBreak = await this.prisma.shiftBreak.findFirst({
            where: { shiftId: activeShift.id, endedAt: null },
            orderBy: { startedAt: 'desc' },
          });

          await this.prisma.$transaction([
            this.prisma.shift.update({
              where: { id: activeShift.id },
              data: { state: ShiftState.WORKING, lastHeartbeatAt: this.clock.now() },
            }),
            ...(openBreak
              ? [
                  this.prisma.shiftBreak.update({
                    where: { id: openBreak.id },
                    data: { endedAt: eventTime },
                  }),
                ]
              : []),
            this.prisma.shiftEvent.create({
              data: {
                shiftId: activeShift.id,
                clientEventId: event.clientEventId,
                type: event.type,
                occurredAt: eventTime,
                receivedAt: this.clock.now(),
                reconstructed: !!event.monotonicOffsetMs,
              },
            }),
          ]);
        } else if (event.type === ShiftEventType.END) {
          // Close open break if any
          const openBreak = await this.prisma.shiftBreak.findFirst({
            where: { shiftId: activeShift.id, endedAt: null },
          });

          const durationSeconds = Math.max(
            0,
            Math.floor((eventTime.getTime() - activeShift.startedAt.getTime()) / 1000),
          );

          // Calculate total break seconds
          const allBreaks = await this.prisma.shiftBreak.findMany({
            where: { shiftId: activeShift.id },
          });
          let totalBreakSeconds = 0;
          for (const b of allBreaks) {
            const end = b.endedAt || eventTime;
            totalBreakSeconds += Math.max(0, Math.floor((end.getTime() - b.startedAt.getTime()) / 1000));
          }

          const ctx = await this.shiftContext(employeeId, companyId, activeShift.startedAt);
          const endFlags = [...activeShift.flags];
          if (ctx.minShiftMinutes > 0 && durationSeconds < ctx.minShiftMinutes * 60 && !endFlags.includes(ShiftFlag.SHORT_SHIFT)) endFlags.push(ShiftFlag.SHORT_SHIFT);

          await this.prisma.$transaction([
            this.prisma.shift.update({
              where: { id: activeShift.id },
              data: {
                state: ShiftState.ENDED,
                endedAt: eventTime,
                endReason: ShiftEndReason.MANUAL,
                durationSeconds,
                breakSeconds: totalBreakSeconds,
                lastHeartbeatAt: this.clock.now(),
                flags: endFlags,
              },
            }),
            ...(openBreak
              ? [
                  this.prisma.shiftBreak.update({
                    where: { id: openBreak.id },
                    data: { endedAt: eventTime },
                  }),
                ]
              : []),
            this.prisma.shiftEvent.create({
              data: {
                shiftId: activeShift.id,
                clientEventId: event.clientEventId,
                type: event.type,
                occurredAt: eventTime,
                receivedAt: this.clock.now(),
                reconstructed: !!event.monotonicOffsetMs,
              },
            }),
          ]);

          processedShiftIds.push(activeShift.id);
        }
      }
    }

    return {
      success: true,
      processedEventsCount: sortedEvents.length,
      acknowledgedEventIds,
      currentShift: await this.getCurrentShift(employeeId),
      closedShift,
    };
  }

  /**
   * Heartbeat from desktop client (F5 rule 2). When the client still believes a shift is open that the
   * server has closed, the response carries a `shift_closed` command with the reason.
   */
  async heartbeat(
    employeeId: string,
    deviceId: string,
    dto: HeartbeatDto,
  ): Promise<HeartbeatResponseDto> {
    const commands: HeartbeatResponseDto['commands'] = [];
    if (dto.shiftId) {
      const shift = await this.prisma.shift.findFirst({ where: { id: dto.shiftId, employeeId } });
      if (shift && shift.state !== ShiftState.ENDED) {
        await this.prisma.shift.update({
          where: { id: shift.id },
          data: { lastHeartbeatAt: this.clock.now(), deviceId },
        });
      } else {
        const closed = shift ? this.describeClosed(shift, deviceId) : { id: dto.shiftId, endedAt: null, reason: ShiftClosedReason.ENDED };
        commands.push({ type: 'shift_closed', shiftId: closed.id, endedAt: closed.endedAt, reason: closed.reason });
      }
    }

    return {
      serverTime: this.clock.nowIso(),
      configVersion: 1,
      commands,
    };
  }

  /** Reason a closed shift is gone, derived from its flags, end reason and the device that ended it. */
  private describeClosed(
    shift: { id: string; endedAt: Date | null; endReason: string | null; flags: string[]; deviceId: string },
    requestingDeviceId: string,
  ): ClosedShiftDto {
    let reason: ShiftClosedReasonType = ShiftClosedReason.ENDED;
    if (shift.flags.includes('no_heartbeat')) reason = ShiftClosedReason.AUTO_CLOSED_NO_HEARTBEAT;
    else if (shift.flags.includes('max_length')) reason = ShiftClosedReason.AUTO_CLOSED_MAX_LENGTH;
    else if (shift.endReason === ShiftEndReason.ADMIN || shift.deviceId !== requestingDeviceId) reason = ShiftClosedReason.ENDED_ELSEWHERE;
    return { id: shift.id, endedAt: shift.endedAt ? shift.endedAt.toISOString() : null, reason };
  }

  async getCurrentShift(employeeId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: {
        employeeId,
        state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] },
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!shift) return null;

    return {
      id: shift.id,
      state: shift.state,
      attendanceDate: shift.attendanceDate,
      startedAt: shift.startedAt,
      lastHeartbeatAt: shift.lastHeartbeatAt,
      activeSeconds: shift.activeSeconds,
      breakSeconds: shift.breakSeconds,
      idleSeconds: shift.idleSeconds,
      currentBreak: shift.breaks[0] || null,
    };
  }

  /** Company timezone, shift policy and the schedule effective at `at` (F8 inputs). */
  private async shiftContext(employeeId: string, companyId: string, at: Date): Promise<ShiftContext> {
    const [company, assignment] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true, settings: true } }),
      this.prisma.employeeSchedule.findFirst({
        where: {
          employeeId,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
        },
        include: { schedule: true },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);
    return {
      timezone: company?.timezone || 'UTC',
      minShiftMinutes: shiftPolicyFrom(company?.settings).minShiftMinutes,
      schedule: assignment?.schedule ?? null,
    };
  }
}

/**
 * Flags set when a shift starts (03 F5): `unscheduled` without a schedule or outside the F8 window,
 * `early_start` more than 60 min before the scheduled start, `outside_schedule` on a non-workday or
 * after the scheduled end.
 */
export function startFlags(startedAt: Date, resolved: ReturnType<typeof resolveAttendanceDate>, ctx: ShiftContext): string[] {
  const flags: string[] = [];
  if (!ctx.schedule) return [ShiftFlag.UNSCHEDULED];
  if (resolved.unscheduled || !resolved.window) {
    flags.push(ShiftFlag.UNSCHEDULED);
    if (!isWorkday(resolved.date, ctx.schedule)) flags.push(ShiftFlag.OUTSIDE_SCHEDULE);
    return flags;
  }
  if (startedAt.getTime() < resolved.window.start.getTime() - EARLY_START_MS) flags.push(ShiftFlag.EARLY_START);
  if (startedAt.getTime() > resolved.window.end.getTime()) flags.push(ShiftFlag.OUTSIDE_SCHEDULE);
  return flags;
}
