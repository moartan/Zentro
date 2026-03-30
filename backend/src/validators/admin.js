import { z } from 'zod';

export const adminUserIdsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
});

