import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Download,
  ChevronDown,
  X,
  CheckCircle,
  Circle,
  Lock,
  PenLine,
  Paperclip,
  Send,
  ExternalLink,
  FileText,
  Search,
  Printer,
  Archive,
  Eye,
  History,
  Workflow,
  Upload,
} from 'lucide-react';
import { DepartmentBadge } from '@/components/layout/Sidebar';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { DocumentPreviewCanvas } from '@/components/documents/DocumentPreviewCanvas';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { ChatMessageDocument, ChatMessageFileAttachment, Document } from '@/types';
import { CATEGORY_LABELS, STATUS_COLORS, STATUS_LABELS, ROLE_LABELS } from '@/types';
import { cn, fileToBase64, formatDate, formatDateTime, formatFileSize, getInitials } from '@/lib/utils';
import { parseWorkflowSteps, stepDisplayLabel } from '@/lib/workflows';
import {
  canUserActOnApproval,
  expectedSignerRole,
  hasUserSignedAtCurrentStep,
  PENDING_APPROVAL_STATUSES,
} from '@/lib/signatures';
import type { DocumentPriority } from '@/types';

const REVIEW_TABS = ['Comments', 'History', 'Workflow', 'Details'] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ARCHIVE_ROLES = ['HOD', 'GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR'] as const;

function downloadAttachment(filePath: string) {
  const base =
    typeof window !== 'undefined' && window.__HOTERRA_API__
      ? window.__HOTERRA_API__.replace('/api', '')
      : 'http://localhost:3001';
  window.open(`${base}${filePath}`, '_blank');
}

const PRIORITY_STYLE: Record<DocumentPriority, string> = {
  HIGH: 'text-red-600',
  MEDIUM: 'text-yellow-700',
  LOW: 'text-green-600',
};

type WorkflowStep = {
  id: string;
  name: string;
  role: string;
  status: 'completed' | 'current' | 'pending';
};

function buildWorkflowSteps(doc: Document): WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  if (doc.author) {
    steps.push({
      id: 'submit',
      name: `${doc.author.firstName} ${doc.author.lastName}`,
      role: 'Submitted',
      status: 'completed',
    });
  }

  for (const sig of doc.signatures ?? []) {
    steps.push({
      id: sig.id,
      name: sig.fullName,
      role: sig.position,
      status: 'completed',
    });
  }

  const pendingStatuses = ['IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM'];
  if (pendingStatuses.includes(doc.status)) {
    steps.push({
      id: 'current',
      name: 'Pending',
      role: 'Pending your action',
      status: 'current',
    });
  }

  if (doc.status !== 'PUBLISHED' && doc.status !== 'REJECTED' && doc.status !== 'ARCHIVED') {
    steps.push({
      id: 'publish',
      name: 'System',
      role: 'Publish',
      status: steps.some((s) => s.status === 'current') ? 'pending' : 'pending',
    });
  } else if (doc.status === 'PUBLISHED') {
    steps.push({
      id: 'publish',
      name: 'System',
      role: 'Published',
      status: 'completed',
    });
  }

  return steps;
}

export function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [doc, setDoc] = useState<Document | null>(null);
  const [comment, setComment] = useState('');
  const [newComment, setNewComment] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [reviewTab, setReviewTab] = useState<(typeof REVIEW_TABS)[number]>('Comments');
  const [attachedDocument, setAttachedDocument] = useState<ChatMessageDocument | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [pickerDocs, setPickerDocs] = useState<Document[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState<'download' | 'more' | null>(null);
  const [archiving, setArchiving] = useState(false);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      api.getDocument(id).then(setDoc).catch(console.error);
    }
  }, [id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (headerActionsRef.current && !headerActionsRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchDocuments = useCallback(async (query: string) => {
    setPickerLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (query.trim()) params.search = query.trim();
      const res = await api.getDocuments(params);
      setPickerDocs(res.data.filter((d) => d.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setPickerLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!showDocPicker) return;
    const timer = window.setTimeout(() => {
      searchDocuments(docSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [docSearch, showDocPicker, searchDocuments]);

  const openDocPicker = () => {
    setShowDocPicker(true);
    setDocSearch('');
    setPickerLoading(true);
    api
      .getDocuments({ limit: '50' })
      .then((res) => setPickerDocs(res.data.filter((d) => d.id !== id)))
      .catch(console.error)
      .finally(() => setPickerLoading(false));
  };

  const selectDocument = (docItem: Document) => {
    setAttachedFile(null);
    setAttachedDocument({
      id: docItem.id,
      title: docItem.title,
      code: docItem.code,
      status: docItem.status,
    });
    setShowDocPicker(false);
    setShowAttachMenu(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert('File exceeds maximum size of 10 MB');
      return;
    }
    setAttachedDocument(null);
    setAttachedFile(file);
    setShowAttachMenu(false);
  };

  const hasCommentAttachment = !!attachedDocument || !!attachedFile;

  const canAct = doc ? canUserActOnApproval(currentUser, doc.status) : false;
  const canSign = doc ? canAct && !hasUserSignedAtCurrentStep(doc, currentUser) : false;
  const expectedRole = doc ? expectedSignerRole(doc.status) : null;
  const awaitingApproval = doc ? PENDING_APPROVAL_STATUSES.includes(doc.status) : false;

  const handleSign = async () => {
    if (!id || !canSign) return;
    const me = currentUser?.signatureImage ? currentUser : await api.getMe();
    if (!me.signatureImage) {
      alert('Upload your signature image in your profile before signing.');
      navigate(`/users/${me.id}`);
      return;
    }
    const pin = prompt('Enter your signing PIN:');
    if (!pin) return;
    setLoading(true);
    try {
      await api.signDocument(id, pin);
      const updated = await api.getDocument(id);
      setDoc(updated);
      alert('Document signed successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePostComment = async () => {
    const text = newComment.trim();
    if (!id || (!text && !hasCommentAttachment) || postingComment) return;
    setPostingComment(true);
    const sentDoc = attachedDocument;
    const sentFile = attachedFile;
    try {
      let filePayload: { fileName: string; fileType: string; data: string } | undefined;
      if (sentFile) {
        const data = await fileToBase64(sentFile);
        filePayload = {
          fileName: sentFile.name,
          fileType: sentFile.type || sentFile.name.split('.').pop() || 'bin',
          data,
        };
      }

      const created = await api.addDocumentComment(id, text, {
        ...(sentDoc ? { attachedDocumentId: sentDoc.id } : {}),
        ...(filePayload ? { file: filePayload } : {}),
      });
      setDoc((prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), created] } : prev
      );
      setNewComment('');
      setAttachedDocument(null);
      setAttachedFile(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject' | 'request_changes') => {
    if (!id || loading || !canAct) return;
    setLoading(true);
    try {
      await api.approveDocument(id, action, comment || undefined);
      navigate('/approvals');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      if (message.includes('already completed') && id) {
        const updated = await api.getDocument(id);
        setDoc(updated);
      }
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const closeMenu = () => setOpenMenu(null);
  const toggleMenu = (menu: 'download' | 'more') =>
    setOpenMenu((current) => (current === menu ? null : menu));

  const handlePrint = () => {
    closeMenu();
    window.print();
  };

  const handleDownloadFile = () => {
    closeMenu();
    if (doc?.filePath?.startsWith('/uploads')) {
      downloadAttachment(doc.filePath);
    } else {
      window.print();
    }
  };

  const handleOpenDocument = () => {
    closeMenu();
    if (id) navigate(`/documents/${id}`);
  };

  const handleOpenNewTab = () => {
    closeMenu();
    if (id) window.open(`/documents/${id}`, '_blank', 'noopener,noreferrer');
  };

  const handleViewHistory = () => {
    closeMenu();
    setReviewTab('History');
  };

  const handleViewWorkflow = () => {
    closeMenu();
    setReviewTab('Workflow');
  };

  const handleViewDetails = () => {
    closeMenu();
    setReviewTab('Details');
  };

  const handleArchive = async () => {
    if (!id || !doc) return;
    closeMenu();
    const reason = prompt('Archive reason (optional):') ?? undefined;
    setArchiving(true);
    try {
      await api.archiveDocument(id, reason);
      alert('Document archived');
      navigate('/archive');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive document');
    } finally {
      setArchiving(false);
    }
  };

  const canArchive =
    !!currentUser &&
    ARCHIVE_ROLES.includes(currentUser.role as (typeof ARCHIVE_ROLES)[number]) &&
    doc?.status !== 'ARCHIVED';

  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading document...</p>
      </div>
    );
  }

  const workflowSteps = buildWorkflowSteps(doc);
  const comments = (doc.comments ?? []).filter(
    (c) => showResolved || c.status !== 'resolved'
  );
  const priority = doc.priority ?? 'MEDIUM';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mb-2 text-sm text-gray-500">
          <Link to="/approvals" className="hover:text-hoterra-steel">My Approvals</Link>
          {' › '}
          {doc.title} ({doc.code})
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-hoterra-navy">Approval (Review and Sign)</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Review document details, check content and approve or request changes
            </p>
          </div>
          <div ref={headerActionsRef} className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu('download')}
                aria-expanded={openMenu === 'download'}
                className={cn('btn-secondary', openMenu === 'download' && 'ring-2 ring-hoterra-gold/30')}
              >
                <Download className="h-4 w-4" />
                Download
                <ChevronDown className="h-3 w-3" />
              </button>
              {openMenu === 'download' && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {doc.filePath?.startsWith('/uploads') && (
                    <MenuItem icon={Download} label="Download file" onClick={handleDownloadFile} />
                  )}
                  <MenuItem icon={Printer} label="Print / Save as PDF" onClick={handlePrint} />
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu('more')}
                aria-expanded={openMenu === 'more'}
                className={cn('btn-secondary', openMenu === 'more' && 'ring-2 ring-hoterra-gold/30')}
              >
                More Actions
                <ChevronDown className="h-3 w-3" />
              </button>
              {openMenu === 'more' && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <MenuItem icon={Eye} label="View document details" onClick={handleOpenDocument} />
                  <MenuItem icon={ExternalLink} label="Open in new tab" onClick={handleOpenNewTab} />
                  <MenuItem icon={History} label="View history" onClick={handleViewHistory} />
                  <MenuItem icon={Workflow} label="View workflow" onClick={handleViewWorkflow} />
                  <MenuItem icon={FileText} label="View details tab" onClick={handleViewDetails} />
                  {canArchive && (
                    <MenuItem
                      icon={Archive}
                      label={archiving ? 'Archiving...' : 'Archive document'}
                      onClick={handleArchive}
                      disabled={archiving}
                    />
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate('/approvals')}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden bg-hoterra-page">
        <aside className="card w-80 shrink-0 overflow-y-auto rounded-none border-r border-t-0 border-l-0 border-b-0 p-5 shadow-none">
          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Approval Information</h3>
            <dl className="space-y-2.5 text-xs">
              <InfoRow label="Document Title" value={doc.title} />
              <InfoRow
                label="Code"
                value={
                  <span className="flex items-center gap-1 font-mono">
                    {doc.code}
                    {doc.isLocked && <Lock className="h-3 w-3 text-gray-400" />}
                  </span>
                }
              />
              <InfoRow label="Version" value={doc.version} />
              <InfoRow
                label="Department"
                value={<DepartmentBadge name={doc.department.name} color={doc.department.color} />}
              />
              <InfoRow
                label="Category"
                value={
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">
                    {CATEGORY_LABELS[doc.category]}
                  </span>
                }
              />
              <InfoRow
                label="Priority"
                value={
                  <span className={`font-medium ${PRIORITY_STYLE[priority]}`}>
                    {priority.charAt(0) + priority.slice(1).toLowerCase()}
                  </span>
                }
              />
              <InfoRow
                label="Submitted By"
                value={
                  <span className="flex items-center gap-1.5">
                    <UserAvatar firstName={doc.author.firstName} lastName={doc.author.lastName} size="sm" />
                    {doc.author.firstName} {doc.author.lastName}
                  </span>
                }
              />
              <InfoRow label="Submitted On" value={formatDate(doc.createdAt)} />
              <InfoRow
                label="Due Date"
                value={<span className="font-medium text-orange-600">{formatDate(doc.nextReviewDate)}</span>}
              />
              <InfoRow label="Current Step" value={canAct ? 'Your Approval' : expectedRole ? `Awaiting ${expectedRole.replace(/_/g, ' ')}` : doc.status.replace(/_/g, ' ')} />
              <InfoRow label="Next Step" value={doc.status === 'SIGNED_GM' ? 'Publish' : 'Next approver'} />
            </dl>
          </section>

          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Approval Workflow</h3>
            <div className="space-y-3">
              {workflowSteps.map((step, i) => (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {step.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : step.status === 'current' ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-50">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 text-gray-300" />
                    )}
                    {i < workflowSteps.length - 1 && (
                      <div className={`mt-1 h-6 w-px ${step.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'}`} />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-medium text-gray-800">{step.name}</p>
                    <p className={`text-xs ${step.status === 'current' ? 'font-medium text-blue-600' : 'text-gray-500'}`}>
                      {step.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Approval History</h3>
            <div className="space-y-3">
              {(doc.history ?? []).slice(0, 5).map((h) => (
                <div key={h.id} className="flex gap-2 text-xs">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-hoterra-gold" />
                  <div>
                    <p className="font-medium text-gray-800">{h.action}</p>
                    <p className="text-gray-500">
                      {h.userName} · {formatDate(h.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {(!doc.history || doc.history.length === 0) && (
                <p className="text-xs text-gray-400">No history yet</p>
              )}
            </div>
          </section>

          <div className="space-y-2">
            {!canAct && awaitingApproval && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                {expectedRole
                  ? `This step requires action from ${expectedRole.replace(/_/g, ' ').toLowerCase()}.`
                  : 'No approval action is required from you at this step.'}
              </p>
            )}
            {canAct && (
              <>
                <button
                  onClick={() => handleAction('approve')}
                  disabled={loading}
                  className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleAction('request_changes')}
                  disabled={loading}
                  className="w-full rounded-lg border border-yellow-400 py-2.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
                >
                  Request Changes
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={loading}
                  className="w-full rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {canSign && (
              <button
                onClick={handleSign}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-hoterra-navy py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel disabled:opacity-50"
              >
                <PenLine className="h-4 w-4" />
                Sign
              </button>
            )}
          </div>
        </aside>

        <div className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          <div className="flex border-b border-gray-200 px-4">
            {REVIEW_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setReviewTab(tab)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  reviewTab === tab
                    ? 'border-hoterra-gold text-hoterra-navy'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
                {tab === 'Comments' && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {doc.comments?.length ?? 0}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {reviewTab === 'Comments' && (
              <div className="space-y-4">
                {attachedDocument && (
                  <div className="flex items-start gap-2">
                    <CommentDocumentCard document={attachedDocument} compact />
                    <button
                      type="button"
                      onClick={() => setAttachedDocument(null)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {attachedFile && (
                  <div className="flex items-start gap-2">
                    <CommentFilePreview file={attachedFile} />
                    <button
                      type="button"
                      onClick={() => setAttachedFile(null)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                    className="input flex-1 text-sm"
                  />
                  <div className="relative" ref={attachMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowAttachMenu((v) => !v)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-hoterra-navy"
                      title="Attach"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    {showAttachMenu && (
                      <div className="absolute bottom-full right-0 z-10 mb-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Upload className="h-4 w-4 text-hoterra-navy" />
                          Upload from computer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAttachMenu(false);
                            openDocPicker();
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <FileText className="h-4 w-4 text-hoterra-navy" />
                          Attach system document
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handlePostComment}
                    disabled={postingComment || (!newComment.trim() && !hasCommentAttachment)}
                    className="rounded-lg bg-hoterra-navy p-2 text-white hover:bg-hoterra-steel disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)}
                    className="rounded"
                  />
                  Show resolved comments
                </label>
                {comments.length === 0 ? (
                  <p className="text-xs text-gray-400">No comments yet</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-hoterra-steel text-[10px] font-semibold text-white">
                            {getInitials(c.user.firstName, c.user.lastName)}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">
                              {c.user.firstName} {c.user.lastName}
                            </p>
                            <p className="text-[10px] text-gray-400">{formatDateTime(c.createdAt)}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          c.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {c.status === 'resolved' ? 'Resolved' : 'Open'}
                        </span>
                      </div>
                      {c.text && <p className="text-xs text-gray-600">{c.text}</p>}
                      {c.attachedDocument && (
                        <CommentDocumentCard
                          document={c.attachedDocument}
                          className={c.text ? 'mt-2' : undefined}
                        />
                      )}
                      {c.fileAttachment && id && (
                        <CommentFileCard
                          attachment={c.fileAttachment}
                          documentId={id}
                          commentId={c.id}
                          className={c.text || c.attachedDocument ? 'mt-2' : undefined}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            {reviewTab !== 'Comments' && reviewTab === 'History' && (
              <div className="space-y-3">
                {(doc.history ?? []).map((h) => (
                  <div key={h.id} className="flex gap-2 text-xs">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-hoterra-gold" />
                    <div>
                      <p className="font-medium text-gray-800">{h.action}</p>
                      <p className="text-gray-500">{h.userName} · {formatDate(h.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {(!doc.history || doc.history.length === 0) && <p className="text-xs text-gray-400">No history</p>}
              </div>
            )}
            {reviewTab === 'Workflow' && (
              <div className="space-y-3">
                {doc.workflow ? (
                  <>
                    <p className="text-sm font-medium text-hoterra-navy">{doc.workflow.name}</p>
                    {parseWorkflowSteps(doc.workflow.steps).map((step, i) => (
                      <div key={step.id ?? i} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 text-xs">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hoterra-navy text-[10px] font-bold text-white">{i + 1}</span>
                        <span className="text-gray-700">{stepDisplayLabel(step, ROLE_LABELS)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  workflowSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs">
                      {step.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : step.status === 'current' ? (
                        <div className="h-4 w-4 rounded-full border-2 border-blue-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300" />
                      )}
                      <div>
                        <p className="font-medium text-gray-800">{step.name}</p>
                        <p className="text-gray-500">{step.role}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {reviewTab === 'Details' && (
              <dl className="space-y-2 text-xs">
                <InfoRow label="Title" value={doc.title} />
                <InfoRow label="Code" value={doc.code} />
                <InfoRow label="Version" value={doc.version} />
                <InfoRow label="Department" value={doc.department.name} />
                <InfoRow label="Category" value={CATEGORY_LABELS[doc.category]} />
                <InfoRow label="Status" value={doc.status.replace(/_/g, ' ')} />
                <InfoRow label="Author" value={`${doc.author.firstName} ${doc.author.lastName}`} />
                <InfoRow label="Created" value={formatDate(doc.createdAt)} />
                <InfoRow label="Updated" value={formatDate(doc.updatedAt)} />
                <InfoRow label="Next Review" value={formatDate(doc.nextReviewDate)} />
                {doc.description && (
                  <div className="pt-2">
                    <dt className="text-gray-500">Description</dt>
                    <dd className="mt-1 text-gray-700">{doc.description}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white p-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Add a Comment for Approvers
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Enter your comment..."
              className="input resize-none text-sm"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{comment.length}/1000</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-hoterra-page">
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
            <span>Page 1 of 12</span>
            <div className="flex items-center gap-2">
              <button className="rounded px-2 py-1 hover:bg-gray-100">−</button>
              <span>100%</span>
              <button className="rounded px-2 py-1 hover:bg-gray-100">+</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {doc && (
              <DocumentPreviewCanvas
                document={doc}
                signatures={doc.signatures}
                showThumbnails={(doc.pageCount ?? 1) > 1}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 text-xs">
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-4 w-4 text-red-500" />
              <span>{doc.code.replace(/-/g, '_')}_v{doc.version}.pdf</span>
              <span className="text-gray-400">· 1.2 MB</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400">Uploaded {formatDate(doc.createdAt)} by {doc.author.firstName} {doc.author.lastName}</span>
              <button
                type="button"
                onClick={handleOpenNewTab}
                className="btn-secondary py-1.5 text-xs"
              >
                <ExternalLink className="h-3 w-3" /> Open in New Tab
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDocPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-hoterra-navy">Attach Document</h3>
              <button
                type="button"
                onClick={() => setShowDocPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-gray-200 px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Search by title or code..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {pickerLoading ? (
                <p className="py-8 text-center text-sm text-gray-400">Loading documents...</p>
              ) : pickerDocs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No documents found</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pickerDocs.map((docItem) => (
                    <li key={docItem.id}>
                      <button
                        type="button"
                        onClick={() => selectDocument(docItem)}
                        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-gray-50"
                      >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hoterra-navy/10 text-hoterra-navy">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-hoterra-navy">{docItem.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">{docItem.code}</span>
                            <span
                              className={cn(
                                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                                STATUS_COLORS[docItem.status]
                              )}
                            >
                              {STATUS_LABELS[docItem.status]}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentFilePreview({ file }: { file: File }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <Paperclip className="h-4 w-4 shrink-0 text-hoterra-navy" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-hoterra-navy">{file.name}</div>
        <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
      </div>
    </div>
  );
}

function CommentFileCard({
  attachment,
  documentId,
  commentId,
  className,
}: {
  attachment: ChatMessageFileAttachment;
  documentId: string;
  commentId: string;
  className?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await api.downloadCommentAttachment(documentId, commentId, attachment.fileName);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        'block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:border-hoterra-steel hover:bg-gray-50',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <Paperclip className="h-4 w-4 shrink-0 text-hoterra-navy" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-hoterra-navy">{attachment.fileName}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500">{formatFileSize(attachment.fileSize)}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-hoterra-steel">
              <Download className="h-3 w-3" />
              {downloading ? 'Downloading...' : 'Download'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function CommentDocumentCard({
  document,
  compact = false,
  className,
}: {
  document: ChatMessageDocument;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={`/documents/${document.id}`}
      className={cn(
        'block rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors hover:border-hoterra-steel hover:bg-gray-50',
        compact && 'flex-1',
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <FileText className="h-4 w-4 shrink-0 text-hoterra-navy" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-hoterra-navy">{document.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">{document.code}</span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] font-medium',
                STATUS_COLORS[document.status]
              )}
            >
              {STATUS_LABELS[document.status]}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <Icon className="h-4 w-4 text-gray-400" />
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
