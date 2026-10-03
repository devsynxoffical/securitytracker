import { Module } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, PrismaService, ClockService],
  exports: [TrackingService],
})
export class TrackingModule {}
