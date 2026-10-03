import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { ClockService } from './clock.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, ClockService],
  exports: [PrismaService, RedisService, ClockService],
})
export class CommonModule {}
