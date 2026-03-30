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

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(80).optional(),
    jobTitle: optionalTrimmed(100),
    phone: optionalTrimmed(32),
    country: optionalTrimmed(64),
    gender: z.enum(['male', 'female']).nullable().optional(),
    bio: optionalTrimmed(300),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long.').max(128),
});

export const updateBackupEmailSchema = z.object({
  backupEmail: z.union([z.string().trim().email('Valid backup email is required.'), z.null()]),
});

export const uploadAvatarSchema = z.object({
  fileName: z.string().trim().min(1, 'File name is required.').max(255),
  contentType: z.string().trim().min(1, 'File type is required.').max(120),
  dataBase64: z.string().trim().min(1, 'Image data is required.'),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email('Valid email is required.'),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().email('Valid new email is required.'),
  currentPassword: z.string().min(1, 'Current password is required.'),
});
