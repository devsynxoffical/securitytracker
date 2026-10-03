import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '@company-os/contracts';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
