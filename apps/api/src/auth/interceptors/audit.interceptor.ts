import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip, headers } = request;

    // Only audit mutating write operations (POST, PUT, PATCH, DELETE) or specific sensitive reads
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isAuditRead = url.includes('/tracking/timeline') || url.includes('/mail/audit');

    if (!isWrite && !isAuditRead) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async () => {
        try {
          if (user && user.companyId) {
            await this.prisma.auditLog.create({
              data: {
                companyId: user.companyId,
                actorId: user.id || null,
                actorRole: user.roleName || null,
                action: `${method} ${url}`,
                entityType: this.extractEntityType(url),
                entityId: request.params?.id || null,
                before: Prisma.JsonNull,
                after: this.sanitizeBody(request.body) ?? Prisma.JsonNull,
                ip: ip || 'unknown',
                deviceId: headers['x-device-id'] || user.deviceId || null,
                client: headers['x-client-type'] || 'desktop',
              },
            });
          }
        } catch (error) {
          console.error('Failed to write audit log:', error);
        }
      }),
    );
  }

  private extractEntityType(url: string): string {
    const segments = url.split('/').filter(Boolean);
    return segments[1] || 'unknown';
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...body };
    // Redact sensitive credentials/tokens
    const sensitiveKeys = ['password', 'refreshToken', 'totpCode', 'secret', 'html'];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}
