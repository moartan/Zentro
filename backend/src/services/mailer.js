import { env } from '../config/env.js';

function escapeHtml(value) {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getInvitationLink(token) {
  const base = env.FRONTEND_INVITATION_URL ?? 'http://localhost:5173/invitation';
  return `${base}?token=${encodeURIComponent(token)}`;
}

function getTaskDetailsLink(taskId) {
  const base = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/cpanel/tasks/${encodeURIComponent(taskId)}`;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { ok: false, reason: 'missing_to' };

  if (!env.RESEND_API_KEY || !env.SYSTEM_FROM_EMAIL) {
    console.log('email_fallback_console', {
      to,
      subject,
      text: text ?? null,
    });
    return { ok: true, provider: 'console' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SYSTEM_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const payloadText = await response.text();
    throw new Error(`Resend error: ${response.status} ${payloadText}`);
  }

  return { ok: true, provider: 'resend' };
}

export async function sendUrgentTaskEmail({
  to,
  recipientName,
  workspaceName,
  taskId,
  taskTitle,
  dueAt,
  assignedByName,
}) {
  const safeRecipient = escapeHtml(recipientName || 'there');
  const safeWorkspace = escapeHtml(workspaceName || 'your workspace');
  const safeTitle = escapeHtml(taskTitle || 'Urgent task');
  const safeAssigner = escapeHtml(assignedByName || 'Workspace owner');
  const dueLabel = dueAt ? new Date(dueAt).toLocaleString() : 'No due date';
  const safeDue = escapeHtml(dueLabel);
  const link = getTaskDetailsLink(taskId);

  const subject = `Urgent task assigned: ${taskTitle}`;
  const text = [
    `Hi ${recipientName || 'there'},`,
    '',
    `You have an urgent task in ${workspaceName || 'your workspace'}.`,
    `Task: ${taskTitle}`,
    `Assigned by: ${assignedByName || 'Workspace owner'}`,
    `Due: ${dueLabel}`,
    `Open task: ${link}`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>Hi ${safeRecipient},</p>
      <p>You have an <strong>urgent task</strong> in <strong>${safeWorkspace}</strong>.</p>
      <p><strong>Task:</strong> ${safeTitle}<br />
      <strong>Assigned by:</strong> ${safeAssigner}<br />
      <strong>Due:</strong> ${safeDue}</p>
      <p><a href="${escapeHtml(link)}">Open task</a></p>
    </div>
  `;

  return sendEmail({ to, subject, html, text });
}
