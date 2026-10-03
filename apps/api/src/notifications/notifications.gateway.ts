import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/ws',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`WS connection rejected: No token provided (${client.id})`);
        client.disconnect();
        return;
      }

      const secret = this.config.get<string>('JWT_ACCESS_SECRET') || 'jwt_access_secret_for_dev_mode_only';
      const payload = this.jwtService.verify(token, { secret });

      client.data.user = payload;

      // Join rooms
      if (payload.sub) {
        client.join(`user:${payload.sub}`);
      }
      if (payload.companyId) {
        client.join(`company:${payload.companyId}`);
      }
      if (payload.role) {
        client.join(`role:${payload.role}`);
      }

      this.logger.log(`WS Client connected: ${client.id} (user: ${payload.sub})`);
    } catch (err) {
      this.logger.warn(`WS Auth failed for ${client.id}: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS Client disconnected: ${client.id}`);
  }

  emitToUser(employeeId: string, event: string, payload: unknown) {
    if (this.server) {
      this.server.to(`user:${employeeId}`).emit(event, payload);
    }
  }

  emitToCompany(companyId: string, event: string, payload: unknown) {
    if (this.server) {
      this.server.to(`company:${companyId}`).emit(event, payload);
    }
  }

  emitToRole(role: string, event: string, payload: unknown) {
    if (this.server) {
      this.server.to(`role:${role}`).emit(event, payload);
    }
  }
}
