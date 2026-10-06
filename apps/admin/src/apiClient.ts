export const DEFAULT_PROD_API_URL = 'https://roofingclients.us/api/v1';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('companyos_api_url');
    if (customUrl) return customUrl;
    if (window.location.hostname !== 'localhost') {
      return DEFAULT_PROD_API_URL;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_PROD_API_URL;
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('companyos_api_url', url);
  }
}

export class AdminApiClient {
  private static token: string | null = null;

  static setAuth(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('companyos_admin_token', token);
    }
  }

  static getAuthToken() {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('companyos_admin_token');
    }
    return this.token;
  }

  static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}${endpoint}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      if (contentType.includes('application/json')) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error?.message || errorBody?.message || `HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}: API route unavailable`);
    }

    if (contentType.includes('application/json')) {
      return response.json();
    }

    return {} as T;
  }

  // Auto-authenticate as Admin if not already authenticated
  static async ensureAuth() {
    if (!this.getAuthToken()) {
      try {
        const res = await this.login('admin@devsynx.com', 'SuperAdmin123!');
        if (res?.tokens?.accessToken) {
          this.setAuth(res.tokens.accessToken);
        }
      } catch (e) {
        // API backend is offline or running on separate instance
      }
    }
  }

  // Admin Endpoints
  static async login(email: string, password: string, totpCode?: string) {
    const res = await this.request('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode }),
    });
    if (res?.tokens?.accessToken) {
      this.setAuth(res.tokens.accessToken);
    }
    return res;
  }

  static async getEmployees() {
    return this.request('/employees').catch(() => this.request('/org/employees'));
  }

  static async createEmployee(data: {
    firstName: string;
    lastName: string;
    email: string;
    code: string;
    roleId?: string;
    departmentId?: string;
    temporaryPassword?: string;
  }) {
    return this.request('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    }).catch(() =>
      this.request('/org/employees', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    );
  }

  static async getDepartments() {
    return this.request('/departments');
  }

  static async getRoles() {
    return this.request('/roles');
  }

  static async getDevices() {
    return this.request('/devices');
  }

  static async approveDevice(id: string) {
    return this.request(`/devices/${id}/approve`, {
      method: 'POST',
    });
  }

  static async revokeDevice(id: string) {
    return this.request(`/devices/${id}/revoke`, {
      method: 'POST',
    });
  }

  static async getLeads() {
    return this.request('/leads');
  }

  static async createLead(data: {
    name: string;
    companyName?: string;
    pipelineId: string;
    stageId: string;
    value?: number;
    ownerId?: string;
    phones?: { phone: string; label?: string; isPrimary?: boolean }[];
    emails?: { email: string; label?: string; isPrimary?: boolean }[];
    tags?: string[];
  }) {
    return this.request('/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async updateLeadStage(id: string, stageId: string) {
    return this.request(`/leads/${id}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stageId }),
    });
  }

  static async logCall(data: {
    leadId: string;
    direction: 'OUTBOUND' | 'INBOUND';
    outcome: string;
    durationSeconds: number;
    notes?: string;
  }) {
    return this.request('/calls', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getPipelines() {
    return this.request('/pipelines');
  }

  static async getAttendanceLive() {
    return this.request('/attendance/live');
  }

  static async getMonthlyAttendance(yearMonth: string) {
    return this.request(`/reports/attendance?month=${yearMonth}`);
  }

  static async getAuditLogs() {
    return this.request('/security/audit-logs');
  }

  static async getSecurityAlerts() {
    return this.request('/security/alerts');
  }

  static async getTargets() {
    return this.request('/targets');
  }

  static async getSettings() {
    return this.request('/settings');
  }
}
