import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ShiftEventsBatchSchema,
  HeartbeatSchema,
} from '@company-os/contracts';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  async processEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    if (!user.deviceId) {
      throw new BadRequestException('Desktop device identity is required for shift events');
    }
    const dto = ShiftEventsBatchSchema.parse(body);
    return this.shiftsService.processEvents(user.id, user.deviceId, user.companyId, dto);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = HeartbeatSchema.parse(body);
    return this.shiftsService.heartbeat(user.id, user.deviceId || 'web', dto);
  }

  @Get('current')
  async getCurrentShift(@CurrentUser() user: AuthenticatedUser) {
    return this.shiftsService.getCurrentShift(user.id);
  }
}
