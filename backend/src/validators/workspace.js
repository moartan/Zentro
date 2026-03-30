import { z } from 'zod';

const optionalTrimmed = (maxLength) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (typeof value === 'undefined') return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === undefined || value === null || value.length <= maxLength, {
      message: `Must be at most ${maxLength} characters.`,
    });

export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2, 'Business name is required').max(120, 'Business name is too long'),
    plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  })
  .strict();

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2, 'Workspace name is required.').max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(2, 'Workspace slug is required.')
      .max(120)
      .regex(/^[a-z0-9-]+$/, 'Slug can only include lowercase letters, numbers, and dashes.')
      .optional(),
    description: optionalTrimmed(500),
    supportEmail: z.union([z.string().trim().email('Valid support email is required.'), z.null()]).optional(),
    supportPhone: optionalTrimmed(32),
    website: z.union([z.string().trim().url('Website must be a valid URL.'), z.null()]).optional(),
    accentColor: z
      .union([z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Accent color must be a valid hex color.'), z.null()])
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const uploadWorkspaceLogoSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required.').max(255),
  contentType: z.string().trim().min(1, 'File type is required.').max(120),
  dataBase64: z.string().trim().min(1, 'Image data is required.'),
});

export const archiveWorkspaceSchema = z.object({
  archive: z.boolean(),
  confirmation: z.string().trim().min(1, 'Confirmation is required.'),
});

export const deleteWorkspaceSchema = z.object({
  confirmation: z.string().trim().min(1, 'Confirmation is required.'),
  currentPassword: z.string().min(1, 'Current password is required.'),
});
