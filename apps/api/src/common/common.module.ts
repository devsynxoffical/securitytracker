import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { ClockService } from './clock.service';
import { MailerService } from './mailer.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, ClockService, MailerService],
  exports: [PrismaService, RedisService, ClockService, MailerService],
})
export class CommonModule {}
