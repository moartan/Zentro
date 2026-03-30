import { API_BASE_URL } from './config';
import { getActorHeaders } from '../auth/actorContext';

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
};

function toFriendlyErrorMessage(code: string | null, fallback: string) {
  if (code === 'MEMBER_LIMIT_REACHED') {
    return 'Plan limit reached. Upgrade your subscription to add more members.';
  }
  if (code === 'TEAM_LIMIT_REACHED') {
    return 'Team limit reached for your current plan. Upgrade to create more teams.';
  }
  if (code === 'TEAM_MEMBER_LIMIT_REACHED') {
    return 'Team member limit reached for your current plan.';
  }
  if (code === 'TASK_LIMIT_REACHED') {
    return 'Active task limit reached for your current plan. Upgrade your subscription to create more active tasks.';
  }
  return fallback;
}

async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const actorHeaders = getActorHeaders();
  if (actorHeaders) {
    Object.assign(headers, actorHeaders);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const hasJson = response.headers.get('content-type')?.includes('application/json');
  const payload = hasJson ? await response.json() : null;

  if (!response.ok) {
    const errorCode = payload?.error?.code ?? null;
    const fallback = payload?.error?.message ?? payload?.error ?? 'API request failed';
    const errorMessage = toFriendlyErrorMessage(errorCode, fallback);
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

export function apiDeleteWithBody<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', body });
}
