import { z } from 'zod';

const nullableInteger = z.union([z.number().int(), z.null()]);

export const billingCycleSchema = z.enum(['monthly', 'yearly']);
export const planCodeSchema = z.enum(['free', 'pro', 'enterprise']);
export const subscriptionStatusSchema = z.enum(['active', 'past_due', 'canceled']);

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(200).optional(),
    currency: z.string().trim().length(3).optional(),
    monthlyPriceCents: nullableInteger.optional(),
    yearlyPriceCents: nullableInteger.optional(),
    yearlyDiscountPercent: z.number().min(0).max(100).optional(),
    isPublic: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    limits: z
      .object({
        maxMembers: nullableInteger.optional(),
        maxTeams: nullableInteger.optional(),
        maxActiveTasks: nullableInteger.optional(),
        maxProjects: nullableInteger.optional(),
      })
      .optional(),
    featureFlags: z
      .object({
        teams: z.boolean().optional(),
        activityLogs: z.boolean().optional(),
        customRoles: z.boolean().optional(),
        apiAccess: z.boolean().optional(),
        fileUploads: z.boolean().optional(),
      })
      .optional(),
  })
  .refine(
    (value) => {
      if (typeof value.monthlyPriceCents === 'number' && value.monthlyPriceCents < 0) return false;
      if (typeof value.yearlyPriceCents === 'number' && value.yearlyPriceCents < 0) return false;
      return true;
    },
    { message: 'Price values must be non-negative.' },
  );

export const updateWorkspaceSubscriptionSchema = z.object({
  planCode: planCodeSchema.optional(),
  status: subscriptionStatusSchema.optional(),
  billingCycle: billingCycleSchema.optional(),
  currency: z.string().trim().length(3).optional(),
  unitPriceCents: nullableInteger.optional(),
  renewalAt: z.string().datetime().nullable().optional(),
});

export const updateMySubscriptionSchema = z.object({
  planCode: planCodeSchema.optional(),
  billingCycle: billingCycleSchema.optional(),
  applyTiming: z.enum(['now', 'next_renewal']).optional(),
});
