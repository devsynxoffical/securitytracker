import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CreateTeamSchema, UpdateTeamSchema } from '@company-os/contracts';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  @RequirePermission('org.manage')
  async listTeams(@CurrentUser() user: AuthenticatedUser) {
    return this.teamsService.listTeams(user.companyId);
  }

  @Post()
  @RequirePermission('org.manage')
  async createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = CreateTeamSchema.parse(body);
    return this.teamsService.createTeam(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermission('org.manage')
  async updateTeam(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = UpdateTeamSchema.parse(body);
    return this.teamsService.updateTeam(id, user.companyId, dto);
  }

  @Delete(':id')
  @RequirePermission('org.manage')
  async deleteTeam(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teamsService.deleteTeam(id, user.companyId);
  }
}
