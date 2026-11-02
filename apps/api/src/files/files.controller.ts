import { Controller, Get, Post, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { FilesService, PresignSchema, DownloadQuerySchema } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * 07 section 6: POST /files/presign (upload URL), GET /files/download (redirect to a presigned GET).
 * Entry permission is crm.leads.view (every CRM role has it); the owner record is then checked in scope.
 */
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private files: FilesService) {}

  @Get('status')
  @RequirePermission('crm.leads.view')
  status() {
    return { configured: this.files.isConfigured() };
  }

  @Post('presign')
  @RequirePermission('crm.leads.view')
  presign(@Req() req: any, @Body() body: unknown) {
    return this.files.presignUpload(req.scopeFilter, PresignSchema.parse(body));
  }

  @Get('download')
  @RequirePermission('crm.leads.view')
  async download(@Req() req: any, @Query() query: unknown, @Res() res: Response) {
    const { objectKey } = DownloadQuerySchema.parse(query);
    const url = await this.files.presignDownload(req.scopeFilter, objectKey);
    res.redirect(302, url);
  }
}
