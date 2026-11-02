import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { DataExportPolicies, SHIFT_POLICY_DEFAULTS, ShiftPolicySchema } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';

/**
 * Company settings (06 section 7 `settings`, stored on companies.settings jsonb plus the
 * timezone and week_start columns). Keys are an allowlist; unknown keys are rejected.
 * The shift policy keys (03 F3, F5) come from ShiftPolicySchema in packages/contracts so the
 * desktop app and /me share one definition; the admin settings page mirrors this field list.
 */
export const CompanySettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
  weekStart: z.number().int().min(1).max(7).optional(),
  idleThresholdSeconds: z.number().int().min(60).max(3600).optional(),
  longIdleThresholdSeconds: z.number().int().min(300).max(14400).optional(),
  breakAllowanceMinutes: z.number().int().min(0).max(480).optional(),
  deviceApprovalMode: z.enum(['manual', 'auto_first', 'off']).optional(),
  deviceLimitPerEmployee: z.number().int().min(1).max(10).optional(),
  maxShiftHours: z.number().int().min(4).max(24).optional(),
  heartbeatTimeoutMinutes: z.number().int().min(1).max(120).optional(),
  captureWindowTitles: z.boolean().optional(),
  adminIpAllowlist: z.array(z.string().min(1).max(64)).max(50).optional(),
  /** 08 section 9 FR-SEC-20: data containment. */
  dataExportPolicy: z.enum(DataExportPolicies).optional(),
}).merge(ShiftPolicySchema.partial());
export type CompanySettingsDto = z.infer<typeof CompanySettingsSchema>;

export const SETTINGS_DEFAULTS = {
  idleThresholdSeconds: 300,
  longIdleThresholdSeconds: 1800,
  breakAllowanceMinutes: 60,
  deviceApprovalMode: 'manual',
  deviceLimitPerEmployee: 1,
  maxShiftHours: 16,
  heartbeatTimeoutMinutes: 10,
  captureWindowTitles: false,
  adminIpAllowlist: [] as string[],
  dataExportPolicy: 'disabled' as (typeof DataExportPolicies)[number],
  ...SHIFT_POLICY_DEFAULTS,
};

const JSON_KEYS = Object.keys(SETTINGS_DEFAULTS) as Array<keyof typeof SETTINGS_DEFAULTS>;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return this.present(company);
  }

  async update(companyId: string, dto: CompanySettingsDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    const current = (company.settings as Record<string, unknown>) ?? {};
    const next: Record<string, unknown> = { ...current };
    for (const key of JSON_KEYS) {
      if (dto[key] !== undefined) next[key] = dto[key];
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        timezone: dto.timezone,
        weekStart: dto.weekStart,
        settings: next as Prisma.InputJsonValue,
      },
    });
    return this.present(updated);
  }

  private present(company: { id: string; name: string; timezone: string; weekStart: number; settings: Prisma.JsonValue; updatedAt: Date }) {
    const stored = (company.settings as Record<string, unknown>) ?? {};
    const merged: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
    for (const key of JSON_KEYS) if (stored[key] !== undefined) merged[key] = stored[key];
    return {
      id: company.id,
      name: company.name,
      timezone: company.timezone,
      weekStart: company.weekStart,
      ...merged,
      updatedAt: company.updatedAt,
    };
  }
}
