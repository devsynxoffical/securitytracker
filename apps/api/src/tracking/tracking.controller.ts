import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  BatchIngestSegmentsSchema,
  TamperEventSchema,
  CreateProductivityRuleSchema,
  CreateTrackingExclusionSchema,
  CreateActivityExceptionAppSchema,
} from '@company-os/contracts';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Post('segments')
  @HttpCode(HttpStatus.OK)
  async ingestSegments(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    if (!user.deviceId) {
      throw new BadRequestException('Desktop device identity is required for tracking ingest');
    }
    const dto = BatchIngestSegmentsSchema.parse(body);
    return this.trackingService.ingestSegments(user.id, user.deviceId, dto);
  }

  @Post('tamper-events')
  @HttpCode(HttpStatus.OK)
  async recordTamperEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    if (!user.deviceId) {
      throw new BadRequestException('Desktop device identity is required for tamper events');
    }
    const dto = TamperEventSchema.parse(body);
    return this.trackingService.recordTamperEvents(user.id, user.deviceId, dto);
  }

  @Get('config')
  async getTrackingConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.getTrackingConfig(user.companyId);
  }

  @Get('summary')
  @RequirePermission('tracking.view_summary')
  async getTrackingSummary(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.trackingService.getTrackingSummary(req.scopeFilter, {
      employeeId,
      from,
      to,
    });
  }

  @Get('apps')
  @RequirePermission('tracking.view_summary')
  async getDailyApps(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
  ) {
    return this.trackingService.getDailyApps(req.scopeFilter, {
      employeeId,
      date,
    });
  }

  @Get('domains')
  @RequirePermission('tracking.view_summary')
  async getDailyDomains(
    @Req() req: any,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
  ) {
    return this.trackingService.getDailyDomains(req.scopeFilter, {
      employeeId,
      date,
    });
  }

  @Get('timeline')
  @RequirePermission('tracking.view_detail')
  async getTimeline(
    @Req() req: any,
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
  ) {
    if (!employeeId || !date) {
      throw new BadRequestException('employeeId and date query parameters are required');
    }
    return this.trackingService.getTimeline(employeeId, date, req.scopeFilter);
  }

  // -----------------------------------------------------------------
  // Productivity Rules & Exclusions
  // -----------------------------------------------------------------

  @Get('productivity-rules')
  @RequirePermission('tracking.manage_rules')
  async listProductivityRules(@CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.listProductivityRules(user.companyId);
  }

  @Post('productivity-rules')
  @RequirePermission('tracking.manage_rules')
  async createProductivityRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateProductivityRuleSchema.parse(body);
    return this.trackingService.createProductivityRule(user.companyId, dto);
  }

  @Delete('productivity-rules/:id')
  @RequirePermission('tracking.manage_rules')
  async deleteProductivityRule(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trackingService.deleteProductivityRule(id, user.companyId);
  }

  @Get('exclusions')
  @RequirePermission('tracking.manage_rules')
  async listExclusions(@CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.listExclusions(user.companyId);
  }

  @Post('exclusions')
  @RequirePermission('tracking.manage_rules')
  async createExclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateTrackingExclusionSchema.parse(body);
    return this.trackingService.createExclusion(user.companyId, dto);
  }

  @Get('exception-apps')
  @RequirePermission('tracking.manage_rules')
  async listExceptionApps(@CurrentUser() user: AuthenticatedUser) {
    return this.trackingService.listExceptionApps(user.companyId);
  }

  @Post('exception-apps')
  @RequirePermission('tracking.manage_rules')
  async createExceptionApp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateActivityExceptionAppSchema.parse(body);
    return this.trackingService.createExceptionApp(user.companyId, dto);
  }
}
