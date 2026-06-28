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
} from 'lucide-react';
import { DepartmentBadge, StatusBadge } from '@/components/layout/Sidebar';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/api';
import type { Document } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

const WORKFLOW_STEPS = [
  { id: '1', name: 'Nigar Rustamova', role: 'Submitted', status: 'completed' as const },
  { id: '2', name: 'Elnur Mahmudov', role: 'Approved', status: 'completed' as const },
  { id: '3', name: 'Fuad Ahmadov', role: 'Pending your action', status: 'current' as const },
  { id: '4', name: 'System', role: 'Publish', status: 'pending' as const },
];

export function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (id) {
      api.getDocument(id).then(setDoc).catch(console.error);
    }
  }, [id]);

  const handleSign = () => {
    alert('Electronic signature will be implemented in the next phase');
  };

  const handleAction = (action: string) => {
    alert(`${action} action recorded (demo)`);
  };

  if (!doc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading document...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
              Review document content and take approval action
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              <Download className="h-4 w-4" />
              Download
              <ChevronDown className="h-3 w-3" />
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
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

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-5">
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
                value={<span className="font-medium text-red-600">High</span>}
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
              {WORKFLOW_STEPS.map((step, i) => (
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
                    {i < WORKFLOW_STEPS.length - 1 && (
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
              onClick={() => handleAction('Approve')}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => handleAction('Request Changes')}
              className="w-full rounded-lg border border-yellow-400 py-2.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50"
            >
              Request Changes
            </button>
            <button
              onClick={() => handleAction('Reject')}
              className="w-full rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Reject
            </button>
            <button
              onClick={handleSign}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-hoterra-navy py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel"
            >
              <PenLine className="h-4 w-4" />
              Sign
            </button>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden bg-gray-100">
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-500">
            <span>Page 1 of 12</span>
            <div className="flex items-center gap-2">
              <button className="rounded px-2 py-1 hover:bg-gray-100">−</button>
              <span>100%</span>
              <button className="rounded px-2 py-1 hover:bg-gray-100">+</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                  <span className="text-xs text-gray-500">
                    {doc.code.replace(/-/g, '_')}_v{doc.version}.pdf
                  </span>
                  <StatusBadge status={doc.status} />
                </div>
                <div className="aspect-[8.5/11] bg-white p-12">
                  <div className="mb-8 flex items-center justify-between border-b-2 border-hoterra-navy pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hoterra-navy text-lg font-bold text-hoterra-gold">
                        H
                      </div>
                      <div>
                        <div className="font-bold text-hoterra-navy">HOTERRA Hotels & Resorts</div>
                        <div className="text-xs text-gray-500">{doc.code}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">Version {doc.version}</div>
                  </div>
                  <h2 className="mb-6 text-xl font-bold text-hoterra-navy">{doc.title}</h2>
                  <div className="space-y-4 text-sm text-gray-700">
                    <section>
                      <h3 className="mb-2 font-bold text-hoterra-navy">1. PURPOSE</h3>
                      <p>{doc.description}</p>
                    </section>
                    <section>
                      <h3 className="mb-2 font-bold text-hoterra-navy">2. SCOPE</h3>
                      <p>
                        This procedure applies to all staff handling related operations at HOTERRA
                        Hotels & Resorts properties.
                      </p>
                    </section>
                    <section>
                      <h3 className="mb-2 font-bold text-hoterra-navy">3. PROCEDURE</h3>
                      <p>Full document content appears here for review before approval.</p>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-white px-6 py-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Add a Comment for Approvers
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Enter your comment..."
              className="input resize-none text-sm"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{comment.length}/1000</p>
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
