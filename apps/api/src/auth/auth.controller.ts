import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  DesktopLoginSchema,
  AdminLoginSchema,
  RefreshTokenSchema,
  ChangePasswordSchema,
  AcceptConsentSchema,
} from '@company-os/contracts';
import { AuthService } from './auth.service';
import { JwtAuthGuard, Public } from './guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async desktopLogin(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const dto = DesktopLoginSchema.parse(body);
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];
    return this.authService.desktopLogin(dto, ip, userAgent);
  }

  @Public()
  @Post('admin/auth/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = AdminLoginSchema.parse(body);
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.adminLogin(dto, ip, userAgent);

    if (result.tokens) {
      // Set secure HttpOnly cookie for admin session
      res.cookie('companyos_session', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 12 * 60 * 60 * 1000,
      });
    }

    return result;
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const dto = RefreshTokenSchema.parse(body);
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshTokens(dto, ip, userAgent);
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie('companyos_session');
    return { success: true };
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = ChangePasswordSchema.parse(body);
    await this.authService.changePassword(user.id, user.sessionId, dto);
    return { success: true };
  }

  @Post('auth/consent')
  @HttpCode(HttpStatus.OK)
  async acceptConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const dto = AcceptConsentSchema.parse(body);
    const ip = req.ip || '127.0.0.1';
    await this.authService.acceptConsent(user.id, dto, ip, user.deviceId);
    return { success: true };
  }

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }
}
