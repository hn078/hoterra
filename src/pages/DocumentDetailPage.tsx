import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Download,
  Printer,
  Share2,
  ChevronDown,
  Shield,
  CheckCircle,
  FileText,
  History,
  Link2,
  Archive,
  Star,
  Pencil,
  Copy,
  Send,
} from 'lucide-react';
import { StatusBadge, DepartmentBadge } from '@/components/layout/Sidebar';
import { CategoryBadge } from '@/components/ui/Badges';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { DocumentPreviewCanvas } from '@/components/documents/DocumentPreviewCanvas';
import { api } from '@/lib/api';
import type { Document, DocumentCategory } from '@/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils';

const TABS = ['Preview', 'Details', 'Approvals', 'Versions', 'History', 'Comments', 'Related Documents'];

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadAttachment(filePath: string) {
  const base = typeof window !== 'undefined' && window.__HOTERRA_API__
    ? window.__HOTERRA_API__.replace('/api', '')
    : 'http://localhost:3001';
  window.open(`${base}${filePath}`, '_blank');
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [related, setRelated] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState('Preview');
  const [actionLoading, setActionLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '' as DocumentCategory, tags: '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const loadDoc = () => {
    if (!id) return;
    api.getDocument(id).then(setDoc).catch(console.error);
    api.checkFavorite(id).then((r) => setIsFavorite(r.isFavorite)).catch(console.error);
  };

  useEffect(() => {
    loadDoc();
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'Related Documents') {
      api.getRelatedDocuments(id).then(setRelated).catch(console.error);
    }
  }, [id, activeTab]);

  useEffect(() => {
    if (doc && editing) {
      setEditForm({
        title: doc.title,
        description: doc.description ?? '',
        category: doc.category,
        tags: (doc.tags ?? []).join(', '),
      });
    }
  }, [doc, editing]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePrint = () => window.print();

  const handleSendForReview = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await api.updateDocument(id, { status: 'IN_REVIEW' });
      setDoc(updated);
      alert('Document sent for review');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send for review');
    } finally {
      setActionLoading(false);
      setShowActions(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    const reason = prompt('Archive reason (optional):') ?? undefined;
    setActionLoading(true);
    try {
      await api.archiveDocument(id, reason);
      alert('Document archived');
      navigate('/archive');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive document');
    } finally {
      setActionLoading(false);
      setShowActions(false);
    }
  };

  const handleDuplicate = async () => {
    if (!doc) return;
    setActionLoading(true);
    try {
      const copy = await api.createDocument({
        title: `${doc.title} (Copy)`,
        description: doc.description,
        category: doc.category,
        departmentId: doc.departmentId,
        content: doc.content,
        tags: doc.tags,
      });
      navigate(`/documents/${copy.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to duplicate document');
    } finally {
      setActionLoading(false);
      setShowActions(false);
    }
  };

  const handleNewVersion = async () => {
    if (!id) return;
    const changeNote = prompt('Change note for new version (optional):') ?? undefined;
    setActionLoading(true);
    try {
      const updated = await api.createDocumentVersion(id, undefined, changeNote);
      setDoc(updated);
      alert(`New version ${updated.version} created`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!id) return;
    try {
      if (isFavorite) {
        await api.removeFavorite(id);
        setIsFavorite(false);
      } else {
        await api.addFavorite(id);
        setIsFavorite(true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update favorites');
    }
  };

  const handleSaveDetails = async () => {
    if (!id) return;
    setSavingDetails(true);
    try {
      const updated = await api.updateDocument(id, {
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setDoc(updated);
      setEditing(false);
      alert('Document updated');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleAddComment = async () => {
    if (!id || !newComment.trim()) return;
    setPostingComment(true);
    try {
      const created = await api.addDocumentComment(id, newComment.trim());
      setDoc((prev) => (prev ? { ...prev, comments: [created, ...(prev.comments ?? [])] } : prev));
      setNewComment('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleResolveComment = async (commentId: string, currentStatus: string) => {
    if (!id) return;
    const status = currentStatus === 'resolved' ? 'open' : 'resolved';
    try {
      const updated = await api.resolveDocumentComment(id, commentId, status);
      setDoc((prev) =>
        prev
          ? { ...prev, comments: (prev.comments ?? []).map((c) => (c.id === commentId ? updated : c)) }
          : prev
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update comment');
    }
  };

  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading document...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-4">
        <Breadcrumbs
          items={[
            { label: 'Documents', to: '/documents' },
            { label: doc.department.name },
            { label: doc.category.replace('_', ' ') },
            { label: doc.code },
          ]}
        />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-hoterra-navy">{doc.title}</h1>
              <StatusBadge status={doc.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <CategoryBadge category={doc.category} />
              <span className="badge-pill bg-gray-100 text-gray-700">Version {doc.version}</span>
              <span className="badge-pill bg-gray-100 font-mono text-gray-700">{doc.code}</span>
              <DepartmentBadge name={doc.department.name} color={doc.department.color} />
              <span className="badge-pill bg-gray-100 text-gray-700">{doc.language}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActionBtn
              icon={Download}
              label="Download"
              onClick={() => doc.filePath?.startsWith('/uploads') && downloadAttachment(doc.filePath)}
            />
            <ActionBtn icon={Share2} label="Export" onClick={handlePrint} />
            <ActionBtn icon={Printer} label="Print" onClick={handlePrint} />
            {doc.status !== 'ARCHIVED' && (
              <button onClick={handleArchive} disabled={actionLoading} className="btn-secondary disabled:opacity-50">
                <Archive className="h-4 w-4" />
                Archive
              </button>
            )}
            <div className="relative" ref={actionsRef}>
              <button onClick={() => setShowActions(!showActions)} className="btn-primary">
                Actions <ChevronDown className="h-4 w-4" />
              </button>
              {showActions && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <ActionMenuItem icon={Send} label="Send for Review" onClick={handleSendForReview} />
                  <ActionMenuItem icon={Archive} label="Archive" onClick={handleArchive} />
                  <ActionMenuItem icon={Printer} label="Export" onClick={handlePrint} />
                  <ActionMenuItem icon={Copy} label="Duplicate" onClick={handleDuplicate} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex border-b border-gray-200 bg-white px-6">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-hoterra-gold text-hoterra-navy'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
                {tab === 'Approvals' && doc.signatures && ` (${doc.signatures.length})`}
                {tab === 'Comments' && doc.comments && ` (${doc.comments.length})`}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-hoterra-page p-6">
            {activeTab === 'Preview' && (
              <div className="mx-auto max-w-5xl">
                <DocumentPreviewCanvas
                  document={doc}
                  signatures={doc.signatures}
                  showThumbnails={(doc.pageCount ?? 1) > 1}
                />

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {doc.description && (
                    <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
                      <h4 className="mb-2 text-sm font-semibold text-hoterra-navy">Document Description</h4>
                      <p className="text-sm text-gray-600">{doc.description}</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="mb-3 text-sm font-semibold text-hoterra-navy">Attachments ({doc.attachments?.length ?? 0})</h4>
                    <div className="space-y-2">
                      {(doc.attachments ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400">No attachments</p>
                      ) : (
                        doc.attachments!.map((a) => (
                          <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-gray-800">{a.fileName}</p>
                              <p className="text-[10px] text-gray-400">{formatFileSize(a.fileSize)}</p>
                            </div>
                            <button
                              onClick={() => a.filePath.startsWith('/uploads') && downloadAttachment(a.filePath)}
                              className="rounded p-1 text-gray-400 hover:bg-white hover:text-hoterra-steel"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Details' && (
              <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-hoterra-navy">Document Metadata</h3>
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="btn-secondary py-1.5 text-xs">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(false)} className="btn-secondary py-1.5 text-xs">Cancel</button>
                      <button onClick={handleSaveDetails} disabled={savingDetails} className="btn-primary py-1.5 text-xs disabled:opacity-50">
                        {savingDetails ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Title</label>
                      <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Description</label>
                      <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="input" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Category</label>
                      <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as DocumentCategory })} className="input">
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Tags (comma-separated)</label>
                      <input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} className="input" />
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-3 text-sm">
                    <DetailRow label="Code" value={doc.code} />
                    <DetailRow label="Status" value={STATUS_LABELS[doc.status]} />
                    <DetailRow label="Version" value={doc.version} />
                    <DetailRow label="Department" value={doc.department.name} />
                    <DetailRow label="Category" value={CATEGORY_LABELS[doc.category]} />
                    <DetailRow label="Author" value={`${doc.author.firstName} ${doc.author.lastName}`} />
                    <DetailRow label="Language" value={doc.language} />
                    <DetailRow label="Created" value={formatDate(doc.createdAt)} />
                    <DetailRow label="Last Updated" value={formatDate(doc.updatedAt)} />
                    <DetailRow label="Next Review" value={formatDate(doc.nextReviewDate)} />
                    <DetailRow label="Description" value={doc.description ?? '—'} />
                    <DetailRow label="Tags" value={(doc.tags ?? []).join(', ') || '—'} />
                  </dl>
                )}
              </div>
            )}

            {activeTab === 'Versions' && (
              <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-hoterra-navy">Version History</h3>
                  <button onClick={handleNewVersion} disabled={actionLoading} className="btn-primary py-1.5 text-xs disabled:opacity-50">
                    Create New Version
                  </button>
                </div>
                <div className="space-y-3">
                  {(doc.versions ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No version history</p>
                  ) : (
                    doc.versions!.map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">Version {v.version}</p>
                          {v.changeNote && <p className="text-xs text-gray-500">{v.changeNote}</p>}
                        </div>
                        <span className="text-xs text-gray-400">{formatDate(v.createdAt)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex items-center justify-between rounded-lg border border-hoterra-gold/30 bg-hoterra-gold/5 p-3">
                    <div>
                      <p className="text-sm font-medium text-hoterra-navy">Current · Version {doc.version}</p>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(doc.updatedAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Comments' && (
              <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 font-semibold text-hoterra-navy">Comments</h3>
                <div className="mb-4 flex gap-2">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="input flex-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  />
                  <button onClick={handleAddComment} disabled={postingComment || !newComment.trim()} className="btn-primary disabled:opacity-50">
                    Post
                  </button>
                </div>
                <div className="space-y-3">
                  {(doc.comments ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No comments yet</p>
                  ) : (
                    doc.comments!.map((c) => (
                      <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-800">{c.user.firstName} {c.user.lastName}</p>
                            <p className="text-[10px] text-gray-400">{formatDateTime(c.createdAt)}</p>
                          </div>
                          <button
                            onClick={() => handleResolveComment(c.id, c.status)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              c.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {c.status === 'resolved' ? 'Resolved' : 'Mark Resolved'}
                          </button>
                        </div>
                        <p className="text-sm text-gray-600">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Related Documents' && (
              <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 font-semibold text-hoterra-navy">Related Documents</h3>
                {related.length === 0 ? (
                  <p className="text-sm text-gray-400">No related documents found</p>
                ) : (
                  <div className="space-y-2">
                    {related.map((r) => (
                      <Link key={r.id} to={`/documents/${r.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                        <div>
                          <p className="text-sm font-medium text-hoterra-navy">{r.title}</p>
                          <p className="text-xs text-gray-500">{r.code} · {r.department.name}</p>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'History' && (
              <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 font-semibold text-hoterra-navy">Document History</h3>
                <div className="space-y-4">
                  {(doc.history ?? []).map((h) => (
                    <div key={h.id} className="flex gap-4">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-hoterra-gold" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{h.action}</p>
                        <p className="text-xs text-gray-500">{h.userName} · {formatDate(h.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Approvals' && (
              <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 font-semibold text-hoterra-navy">Approval Timeline</h3>
                <div className="space-y-4">
                  {(doc.signatures ?? []).map((sig) => (
                    <div key={sig.id} className="flex gap-3">
                      <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">{sig.position}</p>
                        <p className="text-xs text-gray-600">{sig.fullName}</p>
                        <p className="text-xs text-gray-400">{formatDate(sig.signedAt)}</p>
                      </div>
                    </div>
                  ))}
                  {doc.status === 'PUBLISHED' && (
                    <div className="flex gap-3">
                      <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">Published</p>
                        <p className="text-xs text-gray-400">{formatDate(doc.updatedAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="card w-80 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-5 shadow-none">
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-hoterra-navy">Document Information</h3>
              <button onClick={() => { setActiveTab('Details'); setEditing(true); }} className="flex items-center gap-1 text-xs text-hoterra-steel hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>
            <dl className="space-y-2 text-xs">
              <InfoRow label="Document Code" value={doc.code} />
              <InfoRow label="Department" value={doc.department.name} />
              <InfoRow label="Category" value={doc.category.replace('_', ' ')} />
              <InfoRow label="Author" value={`${doc.author.firstName} ${doc.author.lastName}`} />
              {doc.owner && <InfoRow label="Owner (HOD)" value={`${doc.owner.firstName} ${doc.owner.lastName}`} />}
              <InfoRow label="Created" value={formatDate(doc.createdAt)} />
              <InfoRow label="Last Updated" value={formatDate(doc.updatedAt)} />
              <InfoRow label="Next Review" value={formatDate(doc.nextReviewDate)} />
            </dl>
          </section>

          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-hoterra-navy">Approval Status</h3>
              <Link to="/workflows" className="text-xs text-hoterra-steel hover:underline">View Workflow →</Link>
            </div>
            <div className="space-y-3">
              {(doc.signatures ?? []).map((sig) => (
                <div key={sig.id} className="flex gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                  <div>
                    <p className="text-xs font-medium text-gray-800">{sig.position}</p>
                    <p className="text-[10px] text-gray-500">{sig.fullName} · {formatDate(sig.signedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: FileText, label: 'New Version', action: handleNewVersion },
                { icon: History, label: 'Send for Review', action: handleSendForReview },
                { icon: Printer, label: 'Print', action: handlePrint },
                { icon: Star, label: isFavorite ? 'Remove Favorite' : 'Add to Favorites', action: handleToggleFavorite },
                { icon: Link2, label: 'Copy Link', action: () => navigator.clipboard.writeText(window.location.href) },
                { icon: Archive, label: 'Archive Document', action: handleArchive, danger: true },
              ].map(({ icon: Icon, label, action, danger }) => (
                <button
                  key={label}
                  onClick={action}
                  disabled={actionLoading}
                  className={`flex flex-col items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-medium hover:border-hoterra-steel hover:bg-white disabled:opacity-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}
                >
                  <Icon className={`h-4 w-4 ${danger ? 'text-red-500' : isFavorite && label.includes('Favorite') ? 'fill-yellow-400 text-yellow-500' : 'text-hoterra-steel'}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {doc.isLocked && (
            <section>
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Signed Version · Locked</span>
                </div>
                <p className="text-xs text-green-700">This document is digitally signed and cannot be edited.</p>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ActionMenuItem({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
      <Icon className="h-4 w-4 text-gray-400" />
      {label}
    </button>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="btn-secondary py-2">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-50 pb-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
