import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { DataExportPolicy, ErrorCodes, SystemRoleNames } from '@company-os/contracts';
import { PrismaService } from '../../common/prisma.service';
import { EXPORT_GUARDED_KEY, ExportGuardedOptions } from '../decorators/export-guarded.decorator';

/** Reads `dataExportPolicy` from the company settings jsonb; missing or unknown values mean `disabled`. */
export function resolveExportPolicy(settings: unknown): DataExportPolicy {
  const value = (settings as Record<string, unknown> | null)?.dataExportPolicy;
  return value === DataExportPolicy.SUPER_ADMIN || value === DataExportPolicy.PERMISSION ? value : DataExportPolicy.DISABLED;
}

/**
 * FR-SEC-20: one guard for every export endpoint. Runs after JwtAuthGuard and RbacGuard (the
 * `@RequirePermission` of the route still applies under every policy).
 *  - disabled     -> 403 EXPORT_DISABLED
 *  - super_admin  -> only the Super Admin role; every export writes an `export` audit entry
 *  - permission   -> the route's permission decides
 */
@Injectable()
export class ExportPolicyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ExportGuardedOptions | undefined>(EXPORT_GUARDED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    if (options.csvOnly && request.query?.format !== 'csv') return true;

    const user = request.user;
    if (!user?.companyId) throw new ForbiddenException('User context is incomplete');

    const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, select: { settings: true } });
    const policy = resolveExportPolicy(company?.settings);

    if (policy === DataExportPolicy.DISABLED) {
      throw new ForbiddenException({ code: ErrorCodes.EXPORT_DISABLED, message: 'Exports are disabled by company policy' });
    }

    if (policy === DataExportPolicy.SUPER_ADMIN && !options.anyEnabledPolicy) {
      if (user.roleName !== SystemRoleNames.SUPER_ADMIN) {
        throw new ForbiddenException({ code: ErrorCodes.EXPORT_DISABLED, message: 'Exports are limited to Super Admins by company policy' });
      }
      await this.audit(request, user, policy);
    }
    return true;
  }

  private async audit(request: any, user: any, policy: DataExportPolicy): Promise<void> {
    const url: string = request.originalUrl || request.url || '';
    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id ?? null,
        actorRole: user.roleName ?? null,
        action: 'export',
        entityType: url.split('/').filter(Boolean)[2] || 'export',
        entityId: null,
        before: Prisma.JsonNull,
        after: { url, policy } as Prisma.InputJsonValue,
        ip: request.ip || 'unknown',
        deviceId: request.headers?.['x-device-id'] || user.deviceId || null,
        client: request.headers?.['x-client-type'] || 'admin',
      },
    });
  }
}
