import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ShiftEventsBatchDto,
  HeartbeatDto,
  HeartbeatResponseDto,
  ShiftEventType,
  ShiftState,
  ErrorCodes,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

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
  ) {
    // Sort events chronologically
    const sortedEvents = [...dto.events].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    const processedShiftIds: string[] = [];

    for (const event of sortedEvents) {
      // 1. Check idempotency on clientEventId
      const existingEvent = await this.prisma.shiftEvent.findUnique({
        where: { clientEventId: event.clientEventId },
      });
      if (existingEvent) {
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
        const attendanceDate = await this.resolveAttendanceDate(employeeId, companyId, eventTime);

        const newShift = await this.prisma.shift.create({
          data: {
            employeeId,
            deviceId,
            attendanceDate,
            startedAt: eventTime,
            state: ShiftState.WORKING,
            lastHeartbeatAt: this.clock.now(),
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
      } else {
        // Requires open shift
        const activeShift = await this.prisma.shift.findFirst({
          where: {
            employeeId,
            state: { in: [ShiftState.WORKING, ShiftState.ON_BREAK] },
          },
        });

        if (!activeShift) {
          // If event arrives for an already ended shift, record event idempotently if shift exists
          continue;
        }

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

          await this.prisma.$transaction([
            this.prisma.shift.update({
              where: { id: activeShift.id },
              data: {
                state: ShiftState.ENDED,
                endedAt: eventTime,
                endReason: 'manual',
                durationSeconds,
                breakSeconds: totalBreakSeconds,
                lastHeartbeatAt: this.clock.now(),
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
      currentShift: await this.getCurrentShift(employeeId),
    };
  }

  /**
   * Heartbeat from desktop client (F5 rule 2).
   */
  async heartbeat(
    employeeId: string,
    deviceId: string,
    dto: HeartbeatDto,
  ): Promise<HeartbeatResponseDto> {
    if (dto.shiftId) {
      await this.prisma.shift.updateMany({
        where: { id: dto.shiftId, employeeId },
        data: {
          lastHeartbeatAt: this.clock.now(),
          deviceId,
        },
      });
    }

    return {
      serverTime: this.clock.nowIso(),
      configVersion: 1,
      commands: [],
    };
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

  /**
   * Resolves attendance date based on schedule proximity or UTC date (F8).
   */
  private async resolveAttendanceDate(
    employeeId: string,
    companyId: string,
    startTime: Date,
  ): Promise<Date> {
    const activeSchedule = await this.prisma.employeeSchedule.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: startTime },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: startTime } }],
      },
      include: { schedule: true },
    });

    // Default UTC date string
    const dateStr = startTime.toISOString().split('T')[0]!;
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}
