import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateTeamDto, UpdateTeamDto } from '@company-os/contracts';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async listTeams(companyId: string) {
    return this.prisma.team.findMany({
      where: { companyId },
      include: {
        department: { select: { id: true, name: true } },
        leader: {
          select: { id: true, code: true, firstName: true, lastName: true },
        },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createTeam(companyId: string, dto: CreateTeamDto) {
    return this.prisma.team.create({
      data: {
        companyId,
        name: dto.name,
        departmentId: dto.departmentId,
        leaderId: dto.leaderId || null,
      },
    });
  }

  async updateTeam(id: string, companyId: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId },
    });
    if (!team) throw new NotFoundException('Team not found');

    return this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        departmentId: dto.departmentId,
        leaderId: dto.leaderId,
      },
    });
  }

  async deleteTeam(id: string, companyId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id, companyId },
    });
    if (!team) throw new NotFoundException('Team not found');

    return this.prisma.team.delete({ where: { id } });
  }
}
