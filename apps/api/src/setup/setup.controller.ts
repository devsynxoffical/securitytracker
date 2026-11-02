import { Controller, Get, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { BootstrapSetupSchema } from '@company-os/contracts';
import { Public } from '../auth/guards/jwt-auth.guard';
import { SetupService } from './setup.service';

@Controller('setup')
export class SetupController {
  constructor(private setup: SetupService) {}

  @Public()
  @Get('status')
  status() {
    return this.setup.status();
  }

  @Public()
  @Post('bootstrap')
  @HttpCode(HttpStatus.CREATED)
  bootstrap(@Body() body: unknown, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    return this.setup.bootstrap(BootstrapSetupSchema.parse(body), ip);
  }
}
