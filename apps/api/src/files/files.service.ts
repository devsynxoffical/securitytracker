import { Injectable, ServiceUnavailableException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ErrorCodes } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { ownerScopeWhere } from '../crm/shared/crm.util';

/** 04 FR-CRM-05: max 25 MB, type allowlist. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
] as const;

export const OWNER_TYPES = ['lead', 'task', 'contact', 'account', 'deal', 'hr_document'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const PresignSchema = z.object({
  ownerType: z.enum(OWNER_TYPES),
  ownerId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mime: z.enum(ALLOWED_MIME),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});
export type PresignDto = z.infer<typeof PresignSchema>;

export const DownloadQuerySchema = z.object({
  objectKey: z.string().min(1).max(600),
});

const PRESIGN_TTL_SECONDS = 600;

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

/** Strips path separators and control characters; keeps a readable name for Content-Disposition. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'file').slice(0, 180);
}

/** `<company>/<ownerType>/<ownerId>/<yyyy>/<mm>/<uuid>-<name>`: unguessable and partition friendly. */
export function buildObjectKey(companyId: string, ownerType: OwnerType, ownerId: string, fileName: string, now: Date, id: string = randomUUID()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${companyId}/${ownerType}/${ownerId}/${yyyy}/${mm}/${id}-${sanitizeFileName(fileName)}`;
}

/** Parses the key back so downloads can re-check the owner. Returns null for foreign keys. */
export function parseObjectKey(key: string): { companyId: string; ownerType: OwnerType; ownerId: string } | null {
  const parts = key.split('/');
  if (parts.length < 6) return null;
  const [companyId, ownerType, ownerId] = parts;
  if (!companyId || !ownerId || !OWNER_TYPES.includes(ownerType as OwnerType)) return null;
  return { companyId, ownerType: ownerType as OwnerType, ownerId };
}

export function readS3Config(get: (k: string) => string | undefined): S3Config | null {
  const bucket = get('S3_BUCKET');
  const accessKey = get('S3_ACCESS_KEY');
  const secretKey = get('S3_SECRET_KEY');
  if (!bucket || !accessKey || !secretKey) return null;
  return {
    endpoint: get('S3_ENDPOINT') || undefined,
    region: get('S3_REGION') || 'us-east-1',
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: (get('S3_FORCE_PATH_STYLE') || 'false').toLowerCase() === 'true',
  };
}

/**
 * Object storage through presigned URLs (02 D9). The API never proxies file bodies.
 * Stateless: the caller persists the returned objectKey on the owning record (for example hr_documents.object_key).
 */
@Injectable()
export class FilesService {
  private client: S3Client | null = null;
  private config: S3Config | null;

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    configService: ConfigService,
  ) {
    this.config = readS3Config((k) => configService.get<string>(k));
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  private s3(): { client: S3Client; config: S3Config } {
    if (!this.config) {
      throw new ServiceUnavailableException({ code: ErrorCodes.INTERNAL_ERROR, message: 'Object storage not configured' });
    }
    if (!this.client) {
      this.client = new S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle,
        credentials: { accessKeyId: this.config.accessKey, secretAccessKey: this.config.secretKey },
      });
    }
    return { client: this.client, config: this.config };
  }

  async presignUpload(scope: ScopeFilter, dto: PresignDto) {
    const { client, config } = this.s3();
    await this.assertOwnerReadable(scope, dto.ownerType, dto.ownerId);
    const objectKey = buildObjectKey(scope.companyId, dto.ownerType, dto.ownerId, dto.fileName, this.clock.now());
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentType: dto.mime,
      ContentLength: dto.size,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
    return {
      uploadUrl,
      objectKey,
      method: 'PUT',
      headers: { 'Content-Type': dto.mime, 'Content-Length': String(dto.size) },
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }

  async presignDownload(scope: ScopeFilter, objectKey: string): Promise<string> {
    const { client, config } = this.s3();
    const parsed = parseObjectKey(objectKey);
    if (!parsed) throw new BadRequestException('Malformed object key');
    if (parsed.companyId !== scope.companyId) throw new NotFoundException('File not found');
    await this.assertOwnerReadable(scope, parsed.ownerType, parsed.ownerId);
    const fileName = objectKey.split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? 'file';
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${sanitizeFileName(fileName)}"`,
    });
    return getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  /** The owner record must exist in the caller's company and scope (05: 404 outside scope). */
  async assertOwnerReadable(scope: ScopeFilter, ownerType: OwnerType, ownerId: string): Promise<void> {
    const base = { id: ownerId, companyId: scope.companyId, deletedAt: null, ...ownerScopeWhere(scope) };
    let found: { id: string } | null = null;
    switch (ownerType) {
      case 'lead':
        found = await this.prisma.lead.findFirst({ where: base, select: { id: true } });
        break;
      case 'contact':
        found = await this.prisma.crmContact.findFirst({ where: base, select: { id: true } });
        break;
      case 'deal':
        found = await this.prisma.deal.findFirst({ where: base, select: { id: true } });
        break;
      case 'account': {
        const where: Record<string, unknown> = { id: ownerId, companyId: scope.companyId, deletedAt: null };
        if (scope.scope !== 'all') {
          const ids = scope.allowedEmployeeIds;
          where.OR = [
            { ownerId: { in: ids } },
            { contacts: { some: { ownerId: { in: ids }, deletedAt: null } } },
            { deals: { some: { ownerId: { in: ids }, deletedAt: null } } },
          ];
        }
        found = await this.prisma.crmAccount.findFirst({ where, select: { id: true } });
        break;
      }
      case 'task': {
        const where: Record<string, unknown> = { id: ownerId, companyId: scope.companyId, deletedAt: null };
        if (scope.scope !== 'all') {
          const ids = scope.allowedEmployeeIds;
          where.OR = [{ creatorId: { in: ids } }, { assigneeId: { in: ids } }, { assignees: { some: { employeeId: { in: ids } } } }];
        }
        found = await this.prisma.task.findFirst({ where, select: { id: true } });
        break;
      }
      case 'hr_document': {
        const where: Record<string, unknown> = { id: ownerId, companyId: scope.companyId };
        if (scope.scope !== 'all') where.employeeId = { in: scope.allowedEmployeeIds };
        found = await this.prisma.hrDocument.findFirst({ where, select: { id: true } });
        break;
      }
      default:
        throw new ForbiddenException('Unsupported owner type');
    }
    if (!found) throw new NotFoundException('Owner record not found');
  }
}
