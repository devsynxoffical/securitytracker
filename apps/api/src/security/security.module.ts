import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

@Module({
  controllers: [SecurityController],
  providers: [SecurityService, PrismaService, ClockService],
  exports: [SecurityService],
})
export class SecurityModule {}
