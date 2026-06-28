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

  updateDocument(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Document>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  approveDocument(id: string, action: 'approve' | 'reject' | 'request_changes', comment?: string) {
    return this.request<import('@/types').Document>(`/documents/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, comment }),
    });
  }

  restoreDocument(id: string) {
    return this.request<import('@/types').Document>(`/documents/${id}/restore`, {
      method: 'POST',
    });
  }

  getDashboardStats() {
    return this.request<import('@/types').DashboardStats>('/documents/stats');
  }

  getTemplates() {
    return this.request<import('@/types').Template[]>('/templates');
  }

  getTemplate(id: string) {
    return this.request<import('@/types').Template>(`/templates/${id}`);
  }

  createTemplate(data: {
    name: string;
    description?: string;
    category: string;
    content?: string;
    signaturePlacement?: unknown;
    pageCount?: number;
  }) {
    return this.request<import('@/types').Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateTemplate(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
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

  getUser(id: string) {
    return this.request<import('@/types').User & {
      signatureImage?: string | null;
      createdAt: string;
      counts: { documents: number; signatures: number; auditLogs: number };
      recentActivity: import('@/types').AuditLog[];
      recentDocs: import('@/types').Document[];
    }>(`/users/${id}`);
  }

  uploadUserSignature(userId: string, fileName: string, data: string) {
    return this.request<import('@/types').User>(`/users/${userId}/signature`, {
      method: 'POST',
      body: JSON.stringify({ fileName, data }),
    });
  }

  getAuditLogs(params?: { page?: number; limit?: number; search?: string; action?: string; entityType?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.action) qs.set('action', params.action);
    if (params?.entityType) qs.set('entityType', params.entityType);
    return this.request<{ data: import('@/types').AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/audit?${qs}`
    );
  }

  exportAuditLogs() {
    return this.download('/audit/export', 'audit-log.csv');
  }

  private async download(path: string, filename: string) {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportDocuments(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.download(`/documents/export/csv${qs}`, 'documents.csv');
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

  createWorkflow(data: { name: string; description?: string; steps?: string[] }) {
    return this.request<import('@/types').WorkflowItem>('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateWorkflow(id: string, data: { name?: string; description?: string; steps?: string[] }) {
    return this.request<import('@/types').WorkflowItem>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  getDepartment(id: string) {
    return this.request<import('@/types').Department & {
      users: import('@/types').User[];
      documents: import('@/types').Document[];
      workflowList: import('@/types').WorkflowItem[];
      templateList: import('@/types').Template[];
    }>(`/departments/${id}`);
  }

  search(q: string, type = 'all', filters?: Record<string, string>) {
    const params = new URLSearchParams({ q, type, ...filters });
    return this.request<{
      documents: import('@/types').Document[];
      users: import('@/types').User[];
      departments: import('@/types').Department[];
      templates: import('@/types').Template[];
      workflows: import('@/types').WorkflowItem[];
      total: number;
    }>(`/search?${params}`);
  }

  getReports() {
    return this.request<{
      kpis: {
        totalDocuments: number;
        newDocuments: number;
        completedApprovals: number;
        activeUsers: number;
        storageGb: number;
        pendingApprovals: number;
        archived: number;
        published: number;
      };
      byDepartment: { name: string; count: number; color?: string }[];
      trend: { month: string; created: number; published: number }[];
      byCategory: { category: string; count: number }[];
      activityTimeline: import('@/types').AuditLog[];
    }>('/reports');
  }

  getRoles() {
    return this.request<{
      roles: Array<{
        id: string;
        name: string;
        description: string;
        userCount: number;
        isSystem: boolean;
        permissions: Record<string, boolean[]>;
      }>;
      columns: string[];
    }>('/roles');
  }

  createUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    departmentId?: string;
  }) {
    return this.request<import('@/types').User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateUser(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  createDepartment(data: { name: string; code: string; color?: string; location?: string; description?: string }) {
    return this.request<import('@/types').Department>('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  addDocumentComment(documentId: string, text: string) {
    return this.request<import('@/types').DocumentComment>(`/documents/${documentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  resolveDocumentComment(documentId: string, commentId: string, status: 'open' | 'resolved') {
    return this.request<import('@/types').DocumentComment>(`/documents/${documentId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  uploadDocumentFile(documentId: string, fileName: string, fileType: string, data: string, isAttachment = false) {
    return this.request(`/documents/${documentId}/upload`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, data, isAttachment }),
    });
  }

  createDocumentVersion(documentId: string, version?: string, changeNote?: string) {
    return this.request<import('@/types').Document>(`/documents/${documentId}/version`, {
      method: 'POST',
      body: JSON.stringify({ version, changeNote }),
    });
  }

  deleteDocument(documentId: string) {
    return this.request(`/documents/${documentId}`, { method: 'DELETE' });
  }

  markNotificationRead(id: string) {
    return this.request(`/notifications/${id}/read`, { method: 'PATCH' });
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

  archiveDocument(id: string, reason?: string) {
    return this.request(`/documents/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  getSettingsStats() {
    return this.request<{
      systemVersion: string;
      storageGb: number;
      storageTotalGb: number;
      storagePercent: number;
      activeUsers: number;
      licenseSeats: number;
      uptime: string;
      licenseTier: string;
      licenseValidUntil: string;
    }>('/settings/stats');
  }

  clearSystemCache() {
    return this.request<{ ok: boolean; clearedAt: string }>('/settings/maintenance/clear-cache', { method: 'POST' });
  }

  reindexSearch() {
    return this.request<{ ok: boolean; reindexedAt: string; version: number }>('/settings/maintenance/reindex', { method: 'POST' });
  }

  getMaintenanceLogs() {
    return this.request<import('@/types').AuditLog[]>('/settings/maintenance/logs');
  }

  getRelatedDocuments(id: string) {
    return this.request<import('@/types').Document[]>(`/documents/${id}/related`);
  }

  signDocument(id: string, pin: string) {
    return this.request(`/documents/${id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  bulkArchiveDocuments(ids: string[], reason?: string) {
    return this.request<{ ok: boolean; count: number }>('/documents/bulk/archive', {
      method: 'POST',
      body: JSON.stringify({ ids, reason }),
    });
  }

  updateDepartment(id: string, data: Record<string, unknown>) {
    return this.request<import('@/types').Department>(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  deleteTemplate(id: string) {
    return this.request(`/templates/${id}`, { method: 'DELETE' });
  }

  deleteWorkflow(id: string) {
    return this.request(`/workflows/${id}`, { method: 'DELETE' });
  }

  checkFavorite(documentId: string) {
    return this.request<{ isFavorite: boolean }>(`/favorites/check/${documentId}`);
  }

  addFavorite(documentId: string) {
    return this.request(`/favorites/${documentId}`, { method: 'POST' });
  }

  removeFavorite(documentId: string) {
    return this.request(`/favorites/${documentId}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
