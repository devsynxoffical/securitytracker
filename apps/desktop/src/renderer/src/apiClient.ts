const API_BASE = 'http://localhost:4000/api/v1';

export class ApiClient {
  private static token: string | null = null;

  static setAuth(token: string, companyId?: string, employeeId?: string) {
    this.token = token;
    localStorage.setItem('companyos_desktop_token', token);
    if (companyId) localStorage.setItem('companyos_company_id', companyId);
    if (employeeId) localStorage.setItem('companyos_employee_id', employeeId);
  }

  static getAuthToken() {
    if (!this.token) {
      this.token = localStorage.getItem('companyos_desktop_token');
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

  // Live Desktop Workstation Endpoints
  static async login(identifier: string, password: string, deviceName = 'PC-014') {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier,
        password,
        device: {
          publicKey: 'ecdsa-p256:04a1b2c3d4e5f6',
          name: deviceName,
          os: 'macOS 15.1.1',
          hardwareHash: 'hash-mac-9821-b4',
          appVersion: '1.0.0',
        },
        timestamp: new Date().toISOString(),
        signature: 'simulated_ed25519_sig',
      }),
    });
  }

  static async getLeads() {
    return this.request('/leads');
  }

  static async logCall(data: { leadId: string; outcome: string; durationSeconds: number; notes: string }) {
    return this.request('/calls', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getTasks() {
    return this.request('/tasks');
  }

  static async createTask(data: { title: string; priority?: string; dueAt?: string; leadId?: string }) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async getTargets() {
    return this.request('/targets/me');
  }

  static async startShift(deviceId: string) {
    return this.request('/shifts/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId, clientEventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }),
    });
  }

  static async startBreak(shiftId: string, breakType: string) {
    return this.request('/shifts/break/start', {
      method: 'POST',
      body: JSON.stringify({ shiftId, breakType, clientEventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }),
    });
  }

  static async endBreak(shiftId: string) {
    return this.request('/shifts/break/end', {
      method: 'POST',
      body: JSON.stringify({ shiftId, clientEventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }),
    });
  }

  static async endShift(shiftId: string) {
    return this.request('/shifts/end', {
      method: 'POST',
      body: JSON.stringify({ shiftId, clientEventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }),
    });
  }

  static async sendActivityEvents(events: any[]) {
    return this.request('/tracking/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
  }
}
