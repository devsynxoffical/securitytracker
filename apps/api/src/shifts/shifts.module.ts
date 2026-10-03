import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [ShiftsController],
  providers: [ShiftsService, PrismaService, ClockService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
