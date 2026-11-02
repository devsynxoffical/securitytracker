import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { CrmEntityTypeValue, CustomFieldType, ErrorCodes } from '@company-os/contracts';
import { PrismaService } from '../../common/prisma.service';

/**
 * Validates `custom` jsonb values against the company's custom field definitions (FR-CRM-23).
 * Unknown keys are rejected so that typos never silently create fields.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private prisma: PrismaService) {}

  async validate(
    companyId: string,
    entityType: CrmEntityTypeValue,
    values: Record<string, unknown> | undefined,
    options: { partial: boolean },
  ): Promise<Record<string, unknown>> {
    const defs = await this.prisma.customFieldDef.findMany({
      where: { companyId, entityType, isActive: true },
    });
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const input = values ?? {};
    const issues: Array<{ key: string; message: string }> = [];
    const out: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(input)) {
      const def = byKey.get(key);
      if (!def) {
        issues.push({ key, message: 'Unknown custom field' });
        continue;
      }
      if (raw === null || raw === undefined || raw === '') {
        out[key] = null;
        continue;
      }
      const opts = Array.isArray(def.options) ? (def.options as unknown[]).map(String) : [];
      switch (def.type) {
        case CustomFieldType.TEXT:
        case CustomFieldType.PHONE:
          if (typeof raw !== 'string') issues.push({ key, message: 'Expected text' });
          else out[key] = raw;
          break;
        case CustomFieldType.EMAIL:
          if (typeof raw !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw))
            issues.push({ key, message: 'Expected an email address' });
          else out[key] = raw.toLowerCase();
          break;
        case CustomFieldType.URL:
          if (typeof raw !== 'string' || !/^https?:\/\//.test(raw))
            issues.push({ key, message: 'Expected a URL starting with http(s)://' });
          else out[key] = raw;
          break;
        case CustomFieldType.NUMBER: {
          const n = typeof raw === 'number' ? raw : Number(raw);
          if (!Number.isFinite(n)) issues.push({ key, message: 'Expected a number' });
          else out[key] = n;
          break;
        }
        case CustomFieldType.DATE:
          if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw)))
            issues.push({ key, message: 'Expected an ISO date' });
          else out[key] = raw;
          break;
        case CustomFieldType.CHECKBOX:
          if (typeof raw !== 'boolean') issues.push({ key, message: 'Expected true or false' });
          else out[key] = raw;
          break;
        case CustomFieldType.SELECT:
          if (typeof raw !== 'string' || !opts.includes(raw))
            issues.push({ key, message: `Expected one of: ${opts.join(', ')}` });
          else out[key] = raw;
          break;
        case CustomFieldType.MULTI_SELECT:
          if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !opts.includes(v)))
            issues.push({ key, message: `Expected a list of: ${opts.join(', ')}` });
          else out[key] = raw;
          break;
        default:
          issues.push({ key, message: 'Unsupported field type' });
      }
    }

    if (!options.partial) {
      for (const def of defs) {
        if (def.required && (out[def.key] === undefined || out[def.key] === null)) {
          issues.push({ key: def.key, message: `${def.label} is required` });
        }
      }
    }

    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        code: ErrorCodes.CUSTOM_FIELD_INVALID,
        message: 'Custom field validation failed',
        details: { issues },
      });
    }
    return out;
  }
}
