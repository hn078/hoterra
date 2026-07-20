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

  getAuditLogs(params?: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    entityType?: string;
    userId?: string;
    departmentId?: string;
    category?: string;
    templateId?: string;
    module?: string;
    severity?: string;
    from?: string;
    to?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.action) qs.set('action', params.action);
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.departmentId) qs.set('departmentId', params.departmentId);
    if (params?.category) qs.set('category', params.category);
    if (params?.templateId) qs.set('templateId', params.templateId);
    if (params?.module) qs.set('module', params.module);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    return this.request<{
      data: import('@/types').AuditLog[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
      summary: { today: number; highSeverity: number; activeUsers: number };
    }>(`/audit?${qs}`);
  }

  exportAuditLogs(params?: {
    search?: string;
    action?: string;
    entityType?: string;
    userId?: string;
    departmentId?: string;
    category?: string;
    templateId?: string;
    module?: string;
    severity?: string;
    from?: string;
    to?: string;
  }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.action) qs.set('action', params.action);
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.departmentId) qs.set('departmentId', params.departmentId);
    if (params?.category) qs.set('category', params.category);
    if (params?.templateId) qs.set('templateId', params.templateId);
    if (params?.module) qs.set('module', params.module);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    const suffix = qs.toString();
    return this.download(`/audit/export${suffix ? `?${suffix}` : ''}`, 'audit-log.csv');
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

  createWorkflow(data: { name: string; description?: string; steps?: import('@/lib/workflows').WorkflowStep[] }) {
    return this.request<import('@/types').WorkflowItem>('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateWorkflow(
    id: string,
    data: {
      name?: string;
      description?: string;
      steps?: import('@/lib/workflows').WorkflowStep[];
      isDefault?: boolean;
      status?: import('@/lib/workflows').WorkflowStatus;
    }
  ) {
    return this.request<import('@/types').WorkflowItem>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  activateWorkflow(id: string) {
    return this.request<import('@/types').WorkflowItem>(`/workflows/${id}/activate`, {
      method: 'PATCH',
    });
  }

  setWorkflowDefault(id: string, isDefault = true) {
    return this.request<import('@/types').WorkflowItem>(`/workflows/${id}/default`, {
      method: 'PATCH',
      body: JSON.stringify({ isDefault }),
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

  addDocumentComment(
    documentId: string,
    text: string,
    options?: { attachedDocumentId?: string; file?: { fileName: string; fileType: string; data: string } }
  ) {
    return this.request<import('@/types').DocumentComment>(`/documents/${documentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        ...(options?.attachedDocumentId ? { attachedDocumentId: options.attachedDocumentId } : {}),
        ...(options?.file ? { file: options.file } : {}),
      }),
    });
  }

  downloadCommentAttachment(documentId: string, commentId: string, fileName: string) {
    return this.download(`/documents/${documentId}/comments/${commentId}/attachment`, fileName);
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

  getConversations() {
    return this.request<import('@/types').Conversation[]>('/conversations');
  }

  getConversationMessages(conversationId: string, params?: { before?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.before) qs.set('before', params.before);
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return this.request<{
      data: import('@/types').ChatMessage[];
      hasMore: boolean;
    }>(`/conversations/${conversationId}/messages${query ? `?${query}` : ''}`);
  }

  sendMessage(
    conversationId: string,
    content: string,
    options?: { documentId?: string; file?: { fileName: string; fileType: string; data: string } }
  ) {
    return this.request<import('@/types').ChatMessage>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        ...(options?.documentId ? { documentId: options.documentId } : {}),
        ...(options?.file ? { file: options.file } : {}),
      }),
    });
  }

  downloadMessageAttachment(conversationId: string, messageId: string, fileName: string) {
    return this.download(`/conversations/${conversationId}/messages/${messageId}/attachment`, fileName);
  }

  startDirectConversation(userId: string) {
    return this.request<import('@/types').Conversation>('/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  markConversationRead(conversationId: string) {
    return this.request(`/conversations/${conversationId}/read`, { method: 'POST' });
  }

  getMessagesUnreadCount() {
    return this.request<{ count: number }>('/conversations/unread-count');
  }

  getWorkforceMeta() {
    return this.request<import('@/types').WorkforceMeta>('/workforce/meta');
  }

  updateWorkforceSettings(data: Record<string, unknown>) {
    return this.request('/workforce/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  getWorkforceRequests(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{
      data: import('@/types').WorkforceRequest[];
      counts: Record<string, number>;
    }>(`/workforce/requests${qs}`);
  }

  getWorkforceRequest(id: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}`);
  }

  createWorkforceRequest(data: Record<string, unknown>) {
    return this.request<import('@/types').WorkforceRequest>('/workforce/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  approveWorkforceRequest(id: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/approve`, {
      method: 'POST',
    });
  }

  rejectWorkforceRequest(id: string, reason?: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  vendorAcceptWorkforceRequest(id: string, vendorId?: string) {
    return this.request<import('@/types').WorkforceRequest>(
      `/workforce/requests/${id}/vendor-accept`,
      { method: 'POST', body: JSON.stringify({ vendorId }) }
    );
  }

  vendorDeclineWorkforceRequest(id: string, reason?: string) {
    return this.request<import('@/types').WorkforceRequest>(
      `/workforce/requests/${id}/vendor-decline`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
  }

  submitWorkforceCompletion(
    id: string,
    data: { actualQuantity: number; actualHours: number; actualCost: number }
  ) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/completion`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  confirmWorkforceHod(id: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/confirm-hod`, {
      method: 'POST',
    });
  }

  confirmWorkforceFinance(id: string) {
    return this.request<import('@/types').WorkforceRequest>(
      `/workforce/requests/${id}/confirm-finance`,
      { method: 'POST' }
    );
  }

  cancelWorkforceRequest(id: string, reason?: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  createWorkforcePosition(name: string) {
    return this.request('/workforce/positions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  createWorkforceVendor(data: { name: string; contactEmail?: string; phone?: string }) {
    return this.request('/workforce/vendors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  upsertWorkforceRoute(departmentId: string, data: { name?: string; steps: unknown[] }) {
    return this.request(`/workforce/routes/${departmentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  upsertWorkforceBudget(data: {
    departmentId: string;
    year: number;
    month: number;
    budgetAmount: number;
  }) {
    return this.request('/workforce/budgets', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  createWorkforceTemplate(data: Record<string, unknown>) {
    return this.request('/workforce/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  deleteWorkforceTemplate(id: string) {
    return this.request(`/workforce/templates/${id}`, { method: 'DELETE' });
  }

  getWorkforceReport(params?: { year?: number; month?: number }) {
    const qs = new URLSearchParams();
    if (params?.year) qs.set('year', String(params.year));
    if (params?.month) qs.set('month', String(params.month));
    const query = qs.toString();
    return this.request<import('@/types').WorkforceReport>(
      `/workforce/reports${query ? `?${query}` : ''}`
    );
  }

  downloadWorkforceReportCsv(params?: { year?: number; month?: number }) {
    const qs = new URLSearchParams();
    if (params?.year) qs.set('year', String(params.year));
    if (params?.month) qs.set('month', String(params.month));
    const query = qs.toString();
    const name = `workforce-${params?.year || 'export'}-${params?.month || 'all'}.csv`;
    return this.download(`/workforce/reports/export.csv${query ? `?${query}` : ''}`, name);
  }

  updateWorkforceTemplate(id: string, data: Record<string, unknown>) {
    return this.request(`/workforce/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  getWorkforcePayroll(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<import('@/types').VendorInvoice[]>(`/workforce/payroll${qs}`);
  }

  createWorkforceInvoice(data: {
    requestId: string;
    invoiceNumber: string;
    invoiceHours: number;
    invoiceAmount: number;
    invoiceDate?: string;
  }) {
    return this.request('/workforce/payroll/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  matchWorkforceInvoice(id: string) {
    return this.request(`/workforce/payroll/invoices/${id}/match`, { method: 'POST' });
  }

  markWorkforceInvoicePaid(id: string) {
    return this.request(`/workforce/payroll/invoices/${id}/paid`, { method: 'POST' });
  }

  resendWorkforceVendor(id: string) {
    return this.request<import('@/types').WorkforceRequest>(`/workforce/requests/${id}/resend-vendor`, {
      method: 'POST',
    });
  }

  runWorkforceRecurring() {
    return this.request<{ created: string[] }>('/workforce/recurring/run', { method: 'POST' });
  }

  getWorkforceOutbox() {
    return this.request<
      {
        id: string;
        toEmail: string;
        subject: string;
        body: string;
        status: string;
        createdAt: string;
      }[]
    >('/workforce/outbox');
  }

  getVendorOrder(token: string) {
    return this.request<{
      token: string;
      inviteStatus: string;
      expiresAt: string;
      canRespond: boolean;
      vendor: { id: string; name: string };
      order: {
        code: string;
        hotelName: string;
        department: string;
        position: string;
        workDate: string;
        shift: string;
        startTime?: string | null;
        endTime?: string | null;
        quantity: number;
        comment?: string | null;
        status: string;
      };
    }>(`/vendor/order/${token}`);
  }

  acceptVendorOrder(token: string) {
    return this.request(`/vendor/order/${token}/accept`, { method: 'POST' });
  }

  declineVendorOrder(token: string, reason?: string) {
    return this.request(`/vendor/order/${token}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}

export const api = new ApiClient();
