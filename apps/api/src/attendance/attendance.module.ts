import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, PrismaService, ClockService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
