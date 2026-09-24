import { UserProfile, Device, RegisterDeviceResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const effectiveToken = token || localStorage.getItem('auth_token') || 'dev-token-admin';
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || 'API Request failed';
    throw new Error(errorMessage);
  }

  return data.data;
}

export async function fetchCurrentUser(token: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/auth/me', { method: 'GET' }, token);
}

export async function googleLoginExchange(idToken: string): Promise<{ token: string; user: UserProfile }> {
  return apiRequest<{ token: string; user: UserProfile }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export async function fetchHealthStatus(): Promise<{ status: string }> {
  const response = await fetch('http://localhost:4000/health');
  if (!response.ok) {
    throw new Error('Failed to fetch health status');
  }
  return response.json();
}

// Device Management APIs
export async function fetchDevices(params?: { search?: string; status?: string; userId?: string }): Promise<Device[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append('search', params.search);
  if (params?.status) searchParams.append('status', params.status);
  if (params?.userId) searchParams.append('userId', params.userId);
  
  const queryString = searchParams.toString();
  const endpoint = `/devices${queryString ? `?${queryString}` : ''}`;
  return apiRequest<Device[]>(endpoint, { method: 'GET' });
}

export async function fetchDeviceById(id: string): Promise<Device> {
  return apiRequest<Device>(`/devices/${id}`, { method: 'GET' });
}

export async function registerDevice(data: {
  userId: string;
  hostname: string;
  osType: 'WINDOWS' | 'MACOS';
  osVersion?: string;
}): Promise<RegisterDeviceResponse> {
  return apiRequest<RegisterDeviceResponse>('/devices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDevice(
  id: string,
  data: { userId?: string; hostname?: string; osType?: 'WINDOWS' | 'MACOS'; osVersion?: string }
): Promise<Device> {
  return apiRequest<Device>(`/devices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function disableDevice(id: string): Promise<Device> {
  return apiRequest<Device>(`/devices/${id}/disable`, { method: 'POST' });
}

export async function enableDevice(id: string): Promise<Device> {
  return apiRequest<Device>(`/devices/${id}/enable`, { method: 'POST' });
}

export async function revokeDevice(id: string): Promise<Device> {
  return apiRequest<Device>(`/devices/${id}/revoke`, { method: 'POST' });
}

export async function rotateDeviceCredential(id: string): Promise<RegisterDeviceResponse> {
  return apiRequest<RegisterDeviceResponse>(`/devices/${id}/rotate-credential`, { method: 'POST' });
}

// Activity Reporting & Analytics APIs
function buildQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      searchParams.append(key, String(val));
    }
  });
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export async function fetchActivitySummary(params?: Record<string, any>) {
  return apiRequest<import('../types').ActivitySummary>(`/activity/summary${buildQueryString(params)}`, { method: 'GET' });
}

export async function fetchActivityApplications(params?: Record<string, any>) {
  return apiRequest<import('../types').ActivityApplicationUsage[]>(`/activity/applications${buildQueryString(params)}`, { method: 'GET' });
}

export async function fetchActivityDaily(params?: Record<string, any>) {
  return apiRequest<import('../types').DailyActivityTrend[]>(`/activity/daily${buildQueryString(params)}`, { method: 'GET' });
}

export async function fetchActivitySessions(params?: Record<string, any>) {
  const query = buildQueryString(params);
  const token = localStorage.getItem('auth_token') || 'dev-token-admin';
  const res = await fetch(`${API_BASE_URL}/activity/sessions${query}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to fetch activity sessions');
  }
  return data as { data: import('../types').ActivitySessionItem[]; pagination: import('../types').ActivityPaginatedResponse['pagination'] };
}

export function getActivityExportUrl(params?: Record<string, any>): string {
  const query = buildQueryString(params);
  return `${API_BASE_URL}/activity/export${query}`;
}
