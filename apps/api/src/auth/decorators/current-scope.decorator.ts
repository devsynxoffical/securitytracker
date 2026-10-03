import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ScopeFilter } from '../guards/rbac.guard.js';

export const CurrentScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ScopeFilter => {
    const request = ctx.switchToHttp().getRequest();
    return (
      request.scopeFilter || {
        scope: 'own',
        companyId: request.user?.companyId || '',
        employeeId: request.user?.id || request.user?.sub || '',
        allowedEmployeeIds: [request.user?.id || request.user?.sub || ''],
      }
    );
  },
);
