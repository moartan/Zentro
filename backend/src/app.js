import express from 'express';
import cookieParser from 'cookie-parser';

import { corsMiddleware } from './middleware/cors.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import usersRoutes from './routes/users.js';
import adminUsersRoutes from './routes/adminUsers.js';
import tasksRoutes from './routes/tasks.js';
import membersRoutes from './routes/members.js';
import invitationsRoutes from './routes/invitations.js';
import subscriptionsRoutes from './routes/subscriptions.js';
import teamsRoutes from './routes/teams.js';
import profileRoutes from './routes/profile.js';
import notificationsRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';

export const app = express();

app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(corsMiddleware);

app.use(healthRoutes);
app.use(authRoutes);
app.use(workspaceRoutes);
app.use(usersRoutes);
app.use(adminUsersRoutes);
app.use(tasksRoutes);
app.use(membersRoutes);
app.use(invitationsRoutes);
app.use(subscriptionsRoutes);
app.use(teamsRoutes);
app.use(profileRoutes);
app.use(notificationsRoutes);
app.use(dashboardRoutes);
