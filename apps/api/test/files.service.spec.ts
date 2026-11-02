import { describe, it, expect, vi } from 'vitest';
import {
  FilesService,
  PresignSchema,
  buildObjectKey,
  parseObjectKey,
  sanitizeFileName,
  readS3Config,
  MAX_FILE_BYTES,
} from '../src/files/files.service';
import { ClockService } from '../src/common/clock.service';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OWNER = '00000000-0000-0000-0000-000000000123';
const ownScope: ScopeFilter = { scope: 'own', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };

function service(configured: boolean, prisma: any = {}) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const env: Record<string, string> = configured
    ? { S3_BUCKET: 'b', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_REGION: 'eu-central-1', S3_ENDPOINT: 'http://minio:9000', S3_FORCE_PATH_STYLE: 'true' }
    : {};
  const config: any = { get: (k: string) => env[k] };
  return new FilesService(prisma, clock, config);
}

describe('FilesService validation (FR-CRM-05)', () => {
  it('accepts an allowed type within 25 MB', () => {
    const dto = PresignSchema.parse({ ownerType: 'lead', ownerId: OWNER, fileName: 'quote.pdf', mime: 'application/pdf', size: 1024 });
    expect(dto.mime).toBe('application/pdf');
  });

  it('rejects oversized files and disallowed types', () => {
    expect(() => PresignSchema.parse({ ownerType: 'lead', ownerId: OWNER, fileName: 'big.pdf', mime: 'application/pdf', size: MAX_FILE_BYTES + 1 })).toThrow();
    expect(() => PresignSchema.parse({ ownerType: 'lead', ownerId: OWNER, fileName: 'x.exe', mime: 'application/x-msdownload', size: 10 })).toThrow();
    expect(() => PresignSchema.parse({ ownerType: 'invoice', ownerId: OWNER, fileName: 'x.pdf', mime: 'application/pdf', size: 10 })).toThrow();
  });
});

describe('object keys', () => {
  it('builds company/owner partitioned keys with a sanitized name and parses them back', () => {
    const key = buildObjectKey(COMPANY, 'deal', OWNER, '../../etc/pass wd?.pdf', new Date('2026-11-02T10:00:00.000Z'), 'fixed-id');
    expect(key).toBe(`${COMPANY}/deal/${OWNER}/2026/11/fixed-id-pass wd_.pdf`);
    expect(parseObjectKey(key)).toEqual({ companyId: COMPANY, ownerType: 'deal', ownerId: OWNER });
  });

  it('rejects foreign or malformed keys', () => {
    expect(parseObjectKey('random/key')).toBeNull();
    expect(parseObjectKey(`${COMPANY}/invoice/${OWNER}/2026/11/x`)).toBeNull();
    expect(sanitizeFileName('')).toBe('file');
  });
});

describe('configuration', () => {
  it('reads S3 env and reports unconfigured without credentials', () => {
    expect(readS3Config(() => undefined)).toBeNull();
    const cfg = readS3Config((k) => ({ S3_BUCKET: 'b', S3_ACCESS_KEY: 'k', S3_SECRET_KEY: 's', S3_FORCE_PATH_STYLE: 'TRUE' } as Record<string, string>)[k]);
    expect(cfg).toMatchObject({ bucket: 'b', region: 'us-east-1', forcePathStyle: true });
    expect(service(false).isConfigured()).toBe(false);
  });

  it('returns 503 when storage is not configured', async () => {
    await expect(service(false).presignUpload(ownScope, { ownerType: 'lead', ownerId: OWNER, fileName: 'a.pdf', mime: 'application/pdf', size: 1 })).rejects.toMatchObject({ status: 503 });
  });
});

describe('owner scope', () => {
  it('404 when the owner is outside scope, presigned URL otherwise', async () => {
    const prisma: any = { lead: { findFirst: vi.fn().mockResolvedValue(null) } };
    const svc = service(true, prisma);
    await expect(svc.presignUpload(ownScope, { ownerType: 'lead', ownerId: OWNER, fileName: 'a.pdf', mime: 'application/pdf', size: 1 })).rejects.toMatchObject({ status: 404 });
    expect(prisma.lead.findFirst.mock.calls[0][0].where.ownerId).toEqual({ in: [ME] });

    prisma.lead.findFirst.mockResolvedValue({ id: OWNER });
    const res = await svc.presignUpload(ownScope, { ownerType: 'lead', ownerId: OWNER, fileName: 'a.pdf', mime: 'application/pdf', size: 1 });
    expect(res.uploadUrl).toContain('X-Amz-Signature');
    expect(res.objectKey.startsWith(`${COMPANY}/lead/${OWNER}/2026/11/`)).toBe(true);
    expect(res.headers['Content-Type']).toBe('application/pdf');
  });

  it('download refuses keys of another company', async () => {
    const svc = service(true, { lead: { findFirst: vi.fn().mockResolvedValue({ id: OWNER }) } });
    await expect(svc.presignDownload(ownScope, `00000000-0000-0000-0000-000000000002/lead/${OWNER}/2026/11/id-a.pdf`)).rejects.toMatchObject({ status: 404 });
    await expect(svc.presignDownload(ownScope, 'junk')).rejects.toMatchObject({ status: 400 });
    const url = await svc.presignDownload(ownScope, `${COMPANY}/lead/${OWNER}/2026/11/00000000-0000-0000-0000-000000000abc-a.pdf`);
    expect(url).toContain('response-content-disposition');
  });
});
