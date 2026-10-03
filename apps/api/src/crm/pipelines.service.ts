import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePipelineDto, CreatePipelineStageDto } from '@company-os/contracts';

@Injectable()
export class PipelinesService {
  constructor(private prisma: PrismaService) {}

  async listPipelines(companyId: string) {
    return this.prisma.pipeline.findMany({
      where: { companyId },
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count: { select: { leads: true } },
      },
      orderBy: { isDefault: 'desc' },
    });
  }

  async createPipeline(companyId: string, dto: CreatePipelineDto) {
    return this.prisma.pipeline.create({
      data: {
        companyId,
        name: dto.name,
        isDefault: dto.isDefault,
      },
    });
  }

  async createStage(pipelineId: string, companyId: string, dto: CreatePipelineStageDto) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, companyId },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');

    return this.prisma.pipelineStage.create({
      data: {
        pipelineId,
        name: dto.name,
        position: dto.position,
        type: dto.type,
        countsAsQualified: dto.countsAsQualified,
        countsAsMeeting: dto.countsAsMeeting,
      },
    });
  }
}
