import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
  CreatePipelineDto,
  CreatePipelineStageDto,
  UpdatePipelineStageDto,
  ReorderStagesDto,
  PipelineEntityValue,
} from '@company-os/contracts';

@Injectable()
export class PipelinesService {
  constructor(private prisma: PrismaService) {}

  async listPipelines(companyId: string, entity?: PipelineEntityValue) {
    return this.prisma.pipeline.findMany({
      where: { companyId, ...(entity ? { entity } : {}) },
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count: { select: { leads: { where: { deletedAt: null } }, deals: { where: { deletedAt: null } } } },
      },
      orderBy: [{ entity: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createPipeline(companyId: string, dto: CreatePipelineDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.pipeline.updateMany({ where: { companyId, entity: dto.entity }, data: { isDefault: false } });
      }
      return tx.pipeline.create({ data: { companyId, name: dto.name, entity: dto.entity, isDefault: dto.isDefault } });
    });
  }

  async updatePipeline(companyId: string, id: string, dto: Partial<CreatePipelineDto>) {
    const pipeline = await this.getPipeline(companyId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.pipeline.updateMany({ where: { companyId, entity: pipeline.entity, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.pipeline.update({ where: { id }, data: { name: dto.name, isDefault: dto.isDefault } });
    });
  }

  async deletePipeline(companyId: string, id: string) {
    await this.getPipeline(companyId, id);
    const [leads, deals] = await Promise.all([
      this.prisma.lead.count({ where: { pipelineId: id, deletedAt: null } }),
      this.prisma.deal.count({ where: { pipelineId: id, deletedAt: null } }),
    ]);
    if (leads + deals > 0) throw new ConflictException('Pipeline has records. Move them to another pipeline first.');
    return this.prisma.pipeline.delete({ where: { id } });
  }

  async createStage(pipelineId: string, companyId: string, dto: CreatePipelineStageDto) {
    await this.getPipeline(companyId, pipelineId);
    return this.prisma.pipelineStage.create({
      data: {
        pipelineId,
        name: dto.name,
        position: dto.position,
        type: dto.type,
        countsAsQualified: dto.countsAsQualified,
        countsAsMeeting: dto.countsAsMeeting,
        probability: dto.probability,
      },
    });
  }

  async updateStage(companyId: string, pipelineId: string, stageId: string, dto: UpdatePipelineStageDto) {
    await this.getStage(companyId, pipelineId, stageId);
    return this.prisma.pipelineStage.update({ where: { id: stageId }, data: dto });
  }

  async deleteStage(companyId: string, pipelineId: string, stageId: string) {
    await this.getStage(companyId, pipelineId, stageId);
    const [leads, deals] = await Promise.all([
      this.prisma.lead.count({ where: { stageId, deletedAt: null } }),
      this.prisma.deal.count({ where: { stageId, deletedAt: null } }),
    ]);
    if (leads + deals > 0) throw new ConflictException('Stage has records. Move them to another stage first.');
    return this.prisma.pipelineStage.delete({ where: { id: stageId } });
  }

  async reorderStages(companyId: string, pipelineId: string, dto: ReorderStagesDto) {
    const pipeline = await this.getPipeline(companyId, pipelineId);
    const ids = pipeline.stages.map((s) => s.id);
    if (ids.length !== dto.stageIds.length || dto.stageIds.some((id) => !ids.includes(id))) {
      throw new BadRequestException('stageIds must contain every stage of the pipeline exactly once');
    }
    await this.prisma.$transaction(dto.stageIds.map((id, i) => this.prisma.pipelineStage.update({ where: { id }, data: { position: i + 1 } })));
    return this.prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { position: 'asc' } });
  }

  private async getPipeline(companyId: string, id: string) {
    const pipeline = await this.prisma.pipeline.findFirst({ where: { id, companyId }, include: { stages: true } });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  private async getStage(companyId: string, pipelineId: string, stageId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId, pipeline: { companyId } } });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }
}
