import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/** Emails tab on CRM records (FR-MAIL-17, FR-CRM-34). Lives in the mail module; routes under /crm. */
@Controller('crm')
@UseGuards(JwtAuthGuard)
export class CrmThreadsController {
  constructor(private conversations: ConversationsService) {}

  @Get('contacts/:id/threads')
  @RequirePermission('crm.contacts.view')
  forContact(@Param('id') id: string, @Req() req: any, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.threadsForContact(id, req.scopeFilter, user.id);
  }

  @Get('deals/:id/threads')
  @RequirePermission('crm.deals.view')
  forDeal(@Param('id') id: string, @Req() req: any, @CurrentUser() user: AuthenticatedUser) {
    return this.conversations.threadsForDeal(id, req.scopeFilter, user.id);
  }
}
