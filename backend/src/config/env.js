import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const emptyStringToUndefined = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4800),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_ORIGIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
    FRONTEND_RESET_PASSWORD_URL: z.preprocess(
      emptyStringToUndefined,
      z.string().url().optional(),
    ),
    FRONTEND_INVITATION_URL: z.preprocess(
      emptyStringToUndefined,
      z.string().url().optional(),
    ),
    SYSTEM_FROM_EMAIL: z.preprocess(emptyStringToUndefined, z.string().email().optional()),
    RESEND_API_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    PROFILE_AVATAR_BUCKET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    WORKSPACE_LOGO_BUCKET: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    DEV_BUSINESS_ID: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
    DEV_USER_ID: z.preprocess(emptyStringToUndefined, z.string().uuid().optional()),
    DEV_ROLE: z.preprocess(
      emptyStringToUndefined,
      z.enum(['super_admin', 'business_owner', 'employee']).optional(),
    ),
  })
  .refine((value) => value.SUPABASE_ANON_KEY !== value.SUPABASE_SERVICE_ROLE_KEY, {
    message: 'SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be different keys.',
    path: ['SUPABASE_ANON_KEY'],
  });

export const env = envSchema.parse(process.env);
