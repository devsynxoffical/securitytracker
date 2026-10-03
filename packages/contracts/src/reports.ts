import { z } from 'zod';

export const ReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});
export type ReportQueryDto = z.infer<typeof ReportQuerySchema>;
