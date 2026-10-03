import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LogCallSchema } from '@company-os/contracts';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Post()
  @RequirePermission('crm.calls.log')
  async logCall(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body: unknown,
  ) {
    const dto = LogCallSchema.parse(body);
    return this.callsService.logCall(user.id, user.companyId, dto, req.scopeFilter);
  }

  @Get()
  @RequirePermission('crm.leads.view')
  async listCalls(
    @Req() req: any,
    @Query('leadId') leadId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.callsService.listCalls(req.scopeFilter, {
      leadId,
      employeeId,
      from,
      to,
    });
  }
}
