import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { DocumentPreviewCanvas } from '@/components/documents/DocumentPreviewCanvas';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Document } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate, formatDateTime, getInitials } from '@/lib/utils';
import type { DocumentPriority } from '@/types';

const REVIEW_TABS = ['Comments', 'History', 'Workflow', 'Details'] as const;

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

  useEffect(() => {
    if (id) {
      api.getDocument(id).then(setDoc).catch(console.error);
    }
  }, [id]);

  const handleSign = async () => {
    if (!id) return;
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
    if (!id || !newComment.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const created = await api.addDocumentComment(id, newComment.trim());
      setDoc((prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), created] } : prev
      );
      setNewComment('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject' | 'request_changes') => {
    if (!id || loading) return;
    setLoading(true);
    try {
      await api.approveDocument(id, action, comment || undefined);
      navigate('/approvals');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (typeof window.print === 'function') {
      window.print();
    } else {
      alert(`Download: ${doc?.title ?? 'Document'}`);
    }
  };

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
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="btn-secondary">
              <Download className="h-4 w-4" />
              Download
              <ChevronDown className="h-3 w-3" />
            </button>
            <button className="btn-secondary">
              More Actions
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
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
              <InfoRow label="Current Step" value="Your Approval" />
              <InfoRow label="Next Step" value="Publish" />
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
            <button
              onClick={handleSign}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-hoterra-navy py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel disabled:opacity-50"
            >
              <PenLine className="h-4 w-4" />
              Sign
            </button>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                    className="input flex-1 text-sm"
                  />
                  <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handlePostComment}
                    disabled={postingComment || !newComment.trim()}
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
                      <p className="text-xs text-gray-600">{c.text}</p>
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
                    {doc.workflow.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 text-xs">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hoterra-navy text-[10px] font-bold text-white">{i + 1}</span>
                        <span className="text-gray-700">{step}</span>
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
              <button className="btn-secondary py-1.5 text-xs">
                <ExternalLink className="h-3 w-3" /> Open in New Tab
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
