export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | string;
  isActive: boolean;
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface Device {
  id: string;
  userId: string;
  hostname: string;
  osType: 'WINDOWS' | 'MACOS' | string;
  osVersion?: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'REVOKED';
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string | null;
  user?: {
    id: string;
    fullName: string;
    email: string;
    department?: string | null;
  };
}

export interface RegisterDeviceResponse {
  device: Device;
  rawCredential: string;
}

export interface ActivitySummary {
  activeSeconds: number;
  idleSeconds: number;
  totalTrackedSeconds: number;
  sessionCount: number;
}

export interface ActivityApplicationUsage {
  appName: string;
  activeSeconds: number;
  idleSeconds: number;
  sessionCount: number;
}

export interface DailyActivityTrend {
  date: string;
  activeSeconds: number;
  idleSeconds: number;
  totalTrackedSeconds: number;
}

export interface ActivitySessionItem {
  id: string;
  deviceId: string;
  userId: string;
  appName: string;
  windowTitle?: string | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  isIdle: boolean;
  createdAt: string;
  device?: {
    id: string;
    hostname: string;
    osType: string;
  };
  user?: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface ActivityPaginatedResponse {
  data: ActivitySessionItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ActivityFilterOptions {
  employeeId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  appName?: string;
  isIdle?: boolean;
  page?: number;
  limit?: number;
}
