import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Download,
  Printer,
  Share2,
  ChevronDown,
  Shield,
  CheckCircle,
  FileText,
  History,
  MessageSquare,
  Link2,
} from 'lucide-react';
import { Header, StatusBadge, DepartmentBadge } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { Document } from '@/types';
import { formatDate } from '@/lib/utils';

const TABS = ['Preview', 'Details', 'Approvals', 'Versions', 'History', 'Comments', 'Related Documents'];

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [activeTab, setActiveTab] = useState('Preview');

  useEffect(() => {
    if (id) {
      api.getDocument(id).then(setDoc).catch(console.error);
    }
  }, [id]);

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
          <Link to="/documents" className="hover:text-hoterra-steel">Documents</Link>
          {' › '}
          {doc.department.name} › {doc.category} › {doc.code}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-hoterra-navy">{doc.title}</h1>
              <StatusBadge status={doc.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">{doc.category}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">
                Version {doc.version}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-mono">
                {doc.code}
              </span>
              <DepartmentBadge name={doc.department.name} color={doc.department.color} />
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">{doc.language}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActionBtn icon={Download} label="Download" />
            <ActionBtn icon={Share2} label="Export" />
            <ActionBtn icon={Printer} label="Print" />
            <button className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white">
              Actions <ChevronDown className="h-4 w-4" />
            </button>
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
                {tab === 'Approvals' && doc.signatures && ` (${doc.signatures.length}/${doc.signatures.length})`}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
            {activeTab === 'Preview' && (
              <div className="mx-auto max-w-4xl">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                    <span className="text-xs text-gray-500">
                      {doc.code.replace(/-/g, '_')}_v{doc.version}.pdf
                    </span>
                    <span className="text-xs text-gray-400">Page 1 of 12</span>
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
                      <div className="text-right text-xs text-gray-500">
                        Version {doc.version}
                      </div>
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
                          This procedure applies to all front office staff handling guest payment
                          information at HOTERRA Hotels & Resorts properties.
                        </p>
                      </section>
                      <section>
                        <h3 className="mb-2 font-bold text-hoterra-navy">3. PROCEDURE</h3>
                        <p>Document content will appear here after upload in step 2.</p>
                      </section>
                    </div>
                  </div>
                </div>

                {doc.description && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="mb-2 text-sm font-semibold text-hoterra-navy">
                      Document Description
                    </h4>
                    <p className="text-sm text-gray-600">{doc.description}</p>
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
                        <p className="text-xs text-gray-500">
                          {h.userName} · {formatDate(h.createdAt)}
                        </p>
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

            {!['Preview', 'History', 'Approvals'].includes(activeTab) && (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
                <p className="text-sm text-gray-400">{activeTab} — coming in next release</p>
              </div>
            )}
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Document Information</h3>
            <dl className="space-y-2 text-xs">
              <InfoRow label="Document Code" value={doc.code} />
              <InfoRow label="Department" value={doc.department.name} />
              <InfoRow label="Category" value={doc.category.replace('_', ' ')} />
              <InfoRow
                label="Author"
                value={`${doc.author.firstName} ${doc.author.lastName}`}
              />
              {doc.owner && (
                <InfoRow
                  label="Owner (HOD)"
                  value={`${doc.owner.firstName} ${doc.owner.lastName}`}
                />
              )}
              <InfoRow label="Created" value={formatDate(doc.createdAt)} />
              <InfoRow label="Last Updated" value={formatDate(doc.updatedAt)} />
              <InfoRow label="Next Review" value={formatDate(doc.nextReviewDate)} />
            </dl>
          </section>

          <section className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: FileText, label: 'New Version' },
                { icon: History, label: 'Send for Review' },
                { icon: Printer, label: 'Print' },
                { icon: Link2, label: 'Copy Link' },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs font-medium text-gray-700 hover:border-hoterra-steel hover:bg-white"
                >
                  <Icon className="h-4 w-4 text-hoterra-steel" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {doc.isLocked && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Locked</span>
              </div>
              <p className="text-xs text-green-700">
                Signed Version: This document is digitally signed and cannot be edited.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
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
