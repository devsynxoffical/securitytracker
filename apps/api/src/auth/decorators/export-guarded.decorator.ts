import { SetMetadata } from '@nestjs/common';

export const EXPORT_GUARDED_KEY = 'export_guarded';

export interface ExportGuardedOptions {
  /** Only apply when the request carries `?format=csv` (routes that also serve JSON). Default: always. */
  csvOnly?: boolean;
  /**
   * FR-SEC-23: the route is allowed under any policy other than `disabled`; the `super_admin`
   * restriction does not apply (mail attachment download keeps its own mailbox permission check).
   */
  anyEnabledPolicy?: boolean;
}

/**
 * Marks an export endpoint (08 section 9, FR-SEC-20). ExportPolicyGuard reads the company's
 * `dataExportPolicy` and answers 403 EXPORT_DISABLED when the policy forbids the export.
 */
export const ExportGuarded = (options: ExportGuardedOptions = {}) => SetMetadata(EXPORT_GUARDED_KEY, options);
