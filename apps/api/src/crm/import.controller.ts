import { Controller, Get, Post, Param, Body, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { StartImportSchema, ImportEntitySchema, PermissionKey } from '@company-os/contracts';
import { CrmImportService, ImportEntity } from './import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PermissionsService } from '../auth/permissions.service';

const UploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  csv: z.string().min(1),
});

const IMPORT_KEY: Record<ImportEntity, PermissionKey> = {
  lead: 'crm.leads.import',
  contact: 'crm.contacts.import',
  account: 'crm.accounts.import',
};

/**
 * Upload is JSON `{fileName, csv}` (text, max 20 MB) so no multipart dependency is needed.
 * Entry permission is crm.leads.view; the handler checks the entity's own import key.
 */
@Controller('crm')
@UseGuards(JwtAuthGuard)
export class CrmImportController {
  constructor(
    private imports: CrmImportService,
    private permissions: PermissionsService,
  ) {}

  @Post(':entity/import')
  @RequirePermission('crm.leads.view')
  async upload(@Param('entity') entity: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const et = this.parseEntity(entity);
    await this.assertImport(user, et);
    const dto = UploadSchema.parse(body);
    return this.imports.createJob(user.companyId, user.id, et, dto.fileName, dto.csv);
  }

  @Post('import/:jobId/start')
  @RequirePermission('crm.leads.view')
  async start(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const job = await this.imports.getJob(user.companyId, jobId);
    await this.assertImport(user, job.entityType as ImportEntity);
    return this.imports.start(user.companyId, user.id, jobId, StartImportSchema.parse(body));
  }

  @Get('import/:jobId')
  @RequirePermission('crm.leads.view')
  async get(@Param('jobId') jobId: string, @CurrentUser() user: AuthenticatedUser) {
    const job = await this.imports.getJob(user.companyId, jobId);
    await this.assertImport(user, job.entityType as ImportEntity);
    return job;
  }

  private parseEntity(raw: string): ImportEntity {
    const singular = raw.endsWith('s') ? raw.slice(0, -1) : raw;
    const parsed = ImportEntitySchema.safeParse(singular);
    if (!parsed.success) throw new BadRequestException('Import supports leads, contacts and accounts');
    return parsed.data as ImportEntity;
  }

  private async assertImport(user: AuthenticatedUser, entity: ImportEntity) {
    if (!(await this.permissions.has(user, IMPORT_KEY[entity]))) throw new ForbiddenException(`Permission missing: ${IMPORT_KEY[entity]}`);
  }
}
