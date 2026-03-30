import { z } from 'zod';

export const teamStatusSchema = z.enum(['active', 'on_hold', 'completed', 'archived']);

const uuid = z.string().uuid();

export const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(''),
  status: teamStatusSchema.optional().default('active'),
  leaderUserId: uuid,
  memberUserIds: z.array(uuid).min(1).max(200),
});

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    status: teamStatusSchema.optional(),
    leaderUserId: uuid.optional(),
    memberUserIds: z.array(uuid).min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  });

export const addTeamCommentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
