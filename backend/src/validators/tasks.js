import { z } from 'zod';

export const roleSchema = z.enum(['super_admin', 'business_owner', 'employee']);
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'on_hold', 'done', 'canceled']);
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const assignmentTypeSchema = z.enum(['individual', 'team']);
const dateTimeSchema = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid datetime value');

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long'),
    description: z.string().trim().max(1000, 'Description is too long').optional().default(''),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    assignmentType: assignmentTypeSchema.optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    assigneeTeamId: z.string().uuid().nullable().optional(),
    startAt: dateTimeSchema.optional().nullable(),
    dueAt: dateTimeSchema.optional().nullable(),
    completedAt: dateTimeSchema.optional().nullable(),
    estimatedAt: dateTimeSchema.optional().nullable(),
    dueDate: z.string().date().optional().nullable(), // legacy compatibility
    statusNote: z.string().trim().max(1000, 'Reason is too long').optional().nullable(),
    holdReason: z.string().trim().max(1000, 'Hold reason is too long').optional().nullable(),
    cancelReason: z.string().trim().max(1000, 'Cancel reason is too long').optional().nullable(),
    completionNote: z.string().trim().max(1000, 'Completion note is too long').optional().nullable(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(120, 'Title is too long').optional(),
    description: z.string().trim().max(1000, 'Description is too long').optional(),
    status: taskStatusSchema.optional(),
    isDone: z.boolean().optional(),
    priority: taskPrioritySchema.optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    assignmentType: assignmentTypeSchema.optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    assigneeTeamId: z.string().uuid().nullable().optional(),
    startAt: dateTimeSchema.nullable().optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    completedAt: dateTimeSchema.nullable().optional(),
    estimatedAt: dateTimeSchema.nullable().optional(),
    dueDate: z.string().date().nullable().optional(), // legacy compatibility
    statusNote: z.string().trim().max(1000, 'Reason is too long').nullable().optional(),
    holdReason: z.string().trim().max(1000, 'Hold reason is too long').nullable().optional(),
    cancelReason: z.string().trim().max(1000, 'Cancel reason is too long').nullable().optional(),
    completionNote: z.string().trim().max(1000, 'Completion note is too long').nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .strict();
