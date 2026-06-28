class ApiClient {
  private token: string | null = null;

  private get baseUrl(): string {
    if (typeof window !== 'undefined' && window.__HOTERRA_API__) {
      return window.__HOTERRA_API__;
    }
    return 'http://localhost:3001/api';
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('hoterra_token', token);
    } else {
      localStorage.removeItem('hoterra_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('hoterra_token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    if (res.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }

    return res.json();
  }

  login(email: string, password: string) {
    return this.request<{ token: string; user: import('@/types').User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  getMe() {
    return this.request<import('@/types').User>('/auth/me');
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  getDepartments() {
    return this.request<import('@/types').Department[]>('/departments');
  }

  getDocuments(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{
      data: import('@/types').Document[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/documents${qs}`);
  }

  getDocument(id: string) {
    return this.request<import('@/types').Document>(`/documents/${id}`);
  }

  createDocument(data: Record<string, unknown>) {
    return this.request<import('@/types').Document>('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getDashboardStats() {
    return this.request<import('@/types').DashboardStats>('/documents/stats');
  }

  getTemplates() {
    return this.request<import('@/types').Template[]>('/templates');
  }

  getSettings() {
    return this.request<import('@/types').SystemSettings>('/settings');
  }

  updateSettings(data: Partial<import('@/types').SystemSettings>) {
    return this.request<import('@/types').SystemSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  getUsers() {
    return this.request<import('@/types').User[]>('/users');
  }

  getAuditLogs(page = 1, limit = 20) {
    return this.request<{ data: import('@/types').AuditLog[]; pagination: { page: number; limit: number; total: number } }>(
      `/audit?page=${page}&limit=${limit}`
    );
  }

  getApprovals(tab = 'pending', page = 1) {
    return this.request<{
      data: import('@/types').Document[];
      counts: { pending: number; approved: number; rejected: number; returned: number; completed: number };
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/documents/approvals?tab=${tab}&page=${page}`);
  }

  getWorkflows() {
    return this.request<import('@/types').WorkflowItem[]>('/workflows');
  }

  getWorkflow(id: string) {
    return this.request<import('@/types').WorkflowItem>(`/workflows/${id}`);
  }

  search(q: string, type = 'all') {
    return this.request<{
      documents: import('@/types').Document[];
      users: import('@/types').User[];
      departments: import('@/types').Department[];
      templates: import('@/types').Template[];
      workflows: import('@/types').WorkflowItem[];
      total: number;
    }>(`/search?q=${encodeURIComponent(q)}&type=${type}`);
  }

  getDepartment(id: string) {
    return this.request<import('@/types').Department & {
      users: import('@/types').User[];
      documents: import('@/types').Document[];
    }>(`/departments/${id}`);
  }

  getUser(id: string) {
    return this.request<import('@/types').User & {
      createdAt: string;
      counts: { documents: number; signatures: number; auditLogs: number };
      recentActivity: import('@/types').AuditLog[];
      recentDocs: import('@/types').Document[];
    }>(`/users/${id}`);
  }

  getTemplate(id: string) {
    return this.request<import('@/types').Template>(`/templates/${id}`);
  }

  getNotifications() {
    return this.request<import('@/types').Notification[]>('/notifications');
  }

  getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  markAllNotificationsRead() {
    return this.request('/notifications/mark-all-read', { method: 'POST' });
  }
}

export const api = new ApiClient();
