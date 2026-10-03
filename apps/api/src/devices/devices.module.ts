import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService, ClockService],
  exports: [DevicesService],
})
export class DevicesModule {}
