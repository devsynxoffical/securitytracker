import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { ClockService } from './common/clock.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { OrgModule } from './org/org.module';
import { SecurityModule } from './security/security.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TrackingModule } from './tracking/tracking.module';
import { CrmModule } from './crm/crm.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TargetsModule } from './targets/targets.module';
import { MailModule } from './mail/mail.module';
import { ReportsModule } from './reports/reports.module';
import { RbacGuard } from './auth/guards/rbac.guard';
import { AuditInterceptor } from './auth/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    DevicesModule,
    OrgModule,
    SecurityModule,
    ShiftsModule,
    AttendanceModule,
    TrackingModule,
    CrmModule,
    NotificationsModule,
    TargetsModule,
    MailModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    RedisService,
    ClockService,
    {
      provide: APP_GUARD,
      useClass: RbacGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [PrismaService, RedisService, ClockService],
})
export class AppModule {}
