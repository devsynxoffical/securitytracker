import { Injectable, Logger } from '@nestjs/common';
import { ChatWebSocketEvents } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ChatGateway } from './chat.gateway';
import { COMPANY_CHANNEL_KEY, UNIT_KINDS, UnitChannelRow, derivedUnitChannels, isChatActive, unitMembershipDiff } from './chat.rules';

const SYNC_TTL_MS = 60_000;

/**
 * Keeps company, department and team channel memberships in step with the org (FR-CHAT-01) and
 * removes non-active employees from every channel (FR-CHAT-10). Called from the employees service
 * on update, disable and enable, and lazily when an employee lists channels.
 */
@Injectable()
export class ChatMembershipService {
  private readonly logger = new Logger(ChatMembershipService.name);
  private readonly syncedAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private gateway: ChatGateway,
  ) {}

  /** The company-wide channel exists once per company and cannot be deleted (22 section 1). */
  async ensureCompanyChannel(companyId: string) {
    const existing = await this.prisma.chatChannel.findUnique({ where: { companyId_directKey: { companyId, directKey: COMPANY_CHANNEL_KEY } } });
    if (existing) return existing;
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    return this.prisma.chatChannel.create({
      data: { companyId, kind: 'company', name: company?.name || 'Company', directKey: COMPANY_CHANNEL_KEY, createdAt: this.clock.now() },
    });
  }

  private async ensureDepartmentChannel(companyId: string, departmentId: string) {
    const dept = await this.prisma.department.findFirst({ where: { id: departmentId, companyId }, select: { name: true } });
    if (!dept) return null;
    return this.prisma.chatChannel.upsert({
      where: { companyId_kind_departmentId: { companyId, kind: 'department', departmentId } },
      update: { name: dept.name },
      create: { companyId, kind: 'department', name: dept.name, departmentId, createdAt: this.clock.now() },
    });
  }

  private async ensureTeamChannel(companyId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, companyId }, select: { name: true } });
    if (!team) return null;
    return this.prisma.chatChannel.upsert({
      where: { companyId_kind_teamId: { companyId, kind: 'team', teamId } },
      update: { name: team.name },
      create: { companyId, kind: 'team', name: team.name, teamId, createdAt: this.clock.now() },
    });
  }

  /** Cheap enough to run on every channel list, throttled per employee. */
  async syncEmployeeThrottled(employeeId: string): Promise<void> {
    const now = this.clock.now().getTime();
    const last = this.syncedAt.get(employeeId);
    if (last && now - last < SYNC_TTL_MS) return;
    this.syncedAt.set(employeeId, now);
    await this.syncEmployee(employeeId);
  }

  async syncEmployee(employeeId: string): Promise<{ joined: number; left: number }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, status: true, deletedAt: true, departmentId: true, teamId: true },
    });
    if (!employee) return { joined: 0, left: 0 };

    if (!isChatActive(employee)) {
      const memberships = await this.prisma.chatMember.findMany({ where: { employeeId }, select: { channelId: true } });
      if (memberships.length) {
        await this.prisma.chatMember.deleteMany({ where: { employeeId } });
        for (const m of memberships) this.gateway.leaveUser(employeeId, m.channelId);
        this.gateway.emitToUser(employeeId, ChatWebSocketEvents.CHANNEL_CHANGED, { reason: 'removed' });
      }
      this.syncedAt.delete(employeeId);
      return { joined: 0, left: memberships.length };
    }

    const desired: UnitChannelRow[] = [];
    for (const target of derivedUnitChannels(employee)) {
      const channel =
        target.kind === 'company'
          ? await this.ensureCompanyChannel(employee.companyId)
          : target.kind === 'department'
            ? await this.ensureDepartmentChannel(employee.companyId, target.departmentId!)
            : await this.ensureTeamChannel(employee.companyId, target.teamId!);
      if (channel) desired.push({ id: channel.id, kind: target.kind, departmentId: target.departmentId, teamId: target.teamId });
    }

    const current = await this.prisma.chatMember.findMany({
      where: { employeeId, channel: { kind: { in: UNIT_KINDS } } },
      select: { channel: { select: { id: true, kind: true, departmentId: true, teamId: true } } },
    });
    const { join, leave } = unitMembershipDiff(
      current.map((m) => ({ id: m.channel.id, kind: m.channel.kind as UnitChannelRow['kind'], departmentId: m.channel.departmentId, teamId: m.channel.teamId })),
      desired,
    );

    if (leave.length) {
      await this.prisma.chatMember.deleteMany({ where: { employeeId, channelId: { in: leave } } });
      for (const id of leave) this.gateway.leaveUser(employeeId, id);
    }
    if (join.length) {
      const joinedAt = this.clock.now();
      await this.prisma.chatMember.createMany({ data: join.map((channelId) => ({ channelId, employeeId, joinedAt })), skipDuplicates: true });
      for (const id of join) this.gateway.joinUser(employeeId, id);
    }
    if (join.length || leave.length) {
      this.gateway.emitToUser(employeeId, ChatWebSocketEvents.CHANNEL_CHANGED, { reason: 'org' });
      this.logger.log(`chat membership synced: joined ${join.length}, left ${leave.length}`);
    }
    return { joined: join.length, left: leave.length };
  }
}
