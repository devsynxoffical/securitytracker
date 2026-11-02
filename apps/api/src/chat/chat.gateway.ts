import { resolveJwtSecret } from '../common/crypto.util';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

/**
 * Chat rooms on the shared `/ws` namespace (FR-CHAT-05). The notifications gateway owns the
 * user/company/role rooms; this gateway verifies the same token and joins `chat:<channelId>` for
 * every channel the employee is a member of (22 section 5: room join requires membership).
 */
@Injectable()
@WebSocketGateway({ cors: { origin: '*', credentials: true }, namespace: '/ws' })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return; // notifications gateway disconnects the socket
      const secret = resolveJwtSecret(this.config.get<string>('JWT_SECRET')); // same as AuthModule
      const payload = this.jwtService.verify(token, { secret }) as { sub?: string };
      if (!payload.sub) return;
      client.join(`user:${payload.sub}`);
      const rooms = await this.roomsFor(payload.sub);
      if (rooms.length) client.join(rooms);
    } catch (err) {
      this.logger.warn(`WS chat join skipped for ${client.id}: ${(err as Error).message}`);
    }
  }

  /** Rooms an employee may join: one per channel membership. */
  async roomsFor(employeeId: string): Promise<string[]> {
    const memberships = await this.prisma.chatMember.findMany({ where: { employeeId }, select: { channelId: true } });
    return memberships.map((m) => `chat:${m.channelId}`);
  }

  emitToChannel(channelId: string, event: string, payload: unknown) {
    this.server?.to(`chat:${channelId}`).emit(event, payload);
  }

  emitToUser(employeeId: string, event: string, payload: unknown) {
    this.server?.to(`user:${employeeId}`).emit(event, payload);
  }

  /** Membership added while connected: subscribe the employee's sockets to the channel room. */
  joinUser(employeeId: string, channelId: string) {
    this.server?.in(`user:${employeeId}`).socketsJoin(`chat:${channelId}`);
  }

  leaveUser(employeeId: string, channelId: string) {
    this.server?.in(`user:${employeeId}`).socketsLeave(`chat:${channelId}`);
  }
}
