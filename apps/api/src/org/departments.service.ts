import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from '@company-os/contracts';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async listDepartments(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId },
      include: {
        manager: {
          select: { id: true, code: true, firstName: true, lastName: true },
        },
        _count: { select: { employees: true, teams: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(companyId: string, dto: CreateDepartmentDto) {
    return this.prisma.department.create({
      data: {
        companyId,
        name: dto.name,
        managerId: dto.managerId || null,
      },
    });
  }

  async updateDepartment(id: string, companyId: string, dto: UpdateDepartmentDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id, companyId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        managerId: dto.managerId,
      },
    });
  }

  async deleteDepartment(id: string, companyId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, companyId },
    });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.department.delete({ where: { id } });
  }
}
