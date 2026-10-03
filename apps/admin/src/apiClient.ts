const API_BASE = 'http://localhost:4000/api/v1';

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

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error?.message || errorBody?.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Admin Endpoints
  static async login(email: string, password: string, totpCode?: string) {
    return this.request('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode }),
    });
  }

  static async getEmployees() {
    return this.request('/org/employees');
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
    return this.request('/org/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
