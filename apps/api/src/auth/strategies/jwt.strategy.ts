import { resolveJwtSecret } from '../../common/crypto.util';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.cookies?.['companyos_session'],
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: any): Promise<AuthenticatedUser> {
    const { sub, session: sessionId, device: deviceId } = payload;

    const employee = await this.prisma.employee.findUnique({
      where: { id: sub },
      include: { role: true },
    });

    // FR-SEC-24: any non-active employee (suspended, disabled, invited) is rejected on every request.
    if (!employee || employee.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    if (sessionId) {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.revokedAt) {
        throw new UnauthorizedException('Session is revoked');
      }
    }

    return {
      id: employee.id,
      companyId: employee.companyId,
      code: employee.code,
      email: employee.email,
      roleId: employee.roleId,
      roleName: employee.role.name,
      roleRank: employee.role.rank,
      deviceId: deviceId || null,
      sessionId,
    };
  }
}
