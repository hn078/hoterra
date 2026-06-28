import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Search, Upload, Bold, Italic, List, Link2 } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { Department, Template, User, DocumentCategory, WorkflowItem } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

const STEPS = [
  'Document Details',
  'Content',
  'Review & Settings',
  'Approval Workflow',
  'Summary',
];

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: 'Credit Card Handling Procedure',
    code: 'FO-SOP-001',
    departmentId: '',
    category: 'SOP' as DocumentCategory,
    version: '1.0',
    description:
      'This procedure outlines the steps for securely handling guest credit card information at the front desk, including authorization, storage, and incident reporting.',
    language: 'English',
    tags: ['Credit Card', 'Payment'],
    nextReviewDate: '2026-06-12',
    effectiveDate: '2025-06-12',
    ownerId: '',
    authorId: '',
    content: '',
    workflowId: '',
    isPublic: false,
    allowDownload: true,
    allowComments: true,
    notifyOnPublish: true,
    requireAcknowledgment: false,
  });

  useEffect(() => {
    Promise.all([
      api.getDepartments(),
      api.getTemplates(),
      api.getUsers(),
      api.getWorkflows(),
    ]).then(([depts, tmpls, usrs, wfs]) => {
      setDepartments(depts);
      setTemplates(tmpls);
      setUsers(usrs);
      setWorkflows(wfs);
      const fo = depts.find((d) => d.code === 'FO');
      const nigar = usrs.find((u) => u.email === 'nigar.rustamova@hoterra.az');
      const fuad = usrs.find((u) => u.email === 'fuad.ahmadov@hoterra.az');
      const defaultWf = wfs.find((w) => w.isDefault) || wfs[0];
      setForm((f) => ({
        ...f,
        departmentId: fo?.id || depts[0]?.id || '',
        ownerId: nigar?.id || '',
        authorId: fuad?.id || '',
        workflowId: defaultWf?.id || '',
      }));
      setSelectedTemplate(tmpls[0]?.id || null);
    });
  }, []);

  const getDeptName = () => departments.find((d) => d.id === form.departmentId)?.name || '—';
  const getUserName = (id: string) => {
    const u = users.find((user) => user.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '—';
  };
  const getWorkflowName = () => workflows.find((w) => w.id === form.workflowId)?.name || '—';

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const doc = await api.createDocument({
        ...form,
        templateId: selectedTemplate,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const doc = await api.createDocument({
        ...form,
        templateId: selectedTemplate,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Create Document"
        subtitle="Documents › Create Document"
        action={
          <button
            onClick={() => navigate('/documents')}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {STEPS.map((stepName, i) => (
            <div key={stepName} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                  i === step
                    ? 'bg-hoterra-gold/20 text-hoterra-gold'
                    : i < step
                      ? 'text-hoterra-steel'
                      : 'text-gray-400'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    i === step
                      ? 'bg-hoterra-gold text-white'
                      : i < step
                        ? 'bg-hoterra-steel text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {stepName}
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            {step === 0 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Department">
                    <select
                      value={form.departmentId}
                      onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                      className="input"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm({ ...form, category: e.target.value as DocumentCategory })
                      }
                      className="input"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Document Title">
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Document Code" hint="Auto-generated if left empty">
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className="input font-mono"
                    />
                  </Field>
                  <Field label="Version">
                    <input
                      value={form.version}
                      onChange={(e) => setForm({ ...form, version: e.target.value })}
                      className="input"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Next Review Date">
                    <input
                      type="date"
                      value={form.nextReviewDate}
                      onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value })}
                      className="input"
                    />
                  </Field>
                  <Field label="Effective Date">
                    <input
                      type="date"
                      value={form.effectiveDate}
                      onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                      className="input"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Author">
                    <select
                      value={form.authorId}
                      onChange={(e) => setForm({ ...form, authorId: e.target.value })}
                      className="input"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Document Owner (HOD)">
                    <select
                      value={form.ownerId}
                      onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                      className="input"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Language">
                  <select
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="input"
                  >
                    <option>English</option>
                    <option>Russian</option>
                    <option>Azerbaijani</option>
                  </select>
                </Field>

                <Field label="Tags">
                  <div className="flex flex-wrap gap-2">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-hoterra-steel/10 px-3 py-1 text-xs font-medium text-hoterra-steel"
                      >
                        {tag}
                      </span>
                    ))}
                    <button type="button" className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500">
                      + Add Tag
                    </button>
                  </div>
                </Field>

                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    className="input resize-none"
                  />
                </Field>

                <Field label="Document Cover">
                  <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                    <p className="text-sm text-gray-500">
                      Drag and drop cover image here, or click to browse
                    </p>
                    <p className="mt-1 text-xs text-gray-400">JPG, PNG up to 5MB (optional)</p>
                  </div>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <Field label="Upload Document">
                  <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center transition-colors hover:border-hoterra-steel hover:bg-gray-50">
                    <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Drag and drop files here, or click to browse
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      PDF, DOCX, XLSX, PPTX up to 25MB
                    </p>
                    <button
                      type="button"
                      className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-white"
                    >
                      Browse Files
                    </button>
                  </div>
                </Field>

                <Field label="Document Content">
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
                      {[Bold, Italic, List, Link2].map((Icon, i) => (
                        <button
                          key={i}
                          type="button"
                          className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      ))}
                      <span className="ml-2 text-xs text-gray-400">Rich text editor — coming soon</span>
                    </div>
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      rows={12}
                      placeholder="Enter document content here, or upload a file above..."
                      className="w-full resize-none border-none p-4 text-sm focus:outline-none"
                    />
                  </div>
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <h3 className="text-sm font-semibold text-hoterra-navy">Access & Visibility</h3>
                <ToggleField
                  label="Public Document"
                  description="Make this document visible to all authenticated users"
                  checked={form.isPublic}
                  onChange={(v) => setForm({ ...form, isPublic: v })}
                />
                <ToggleField
                  label="Allow Download"
                  description="Users can download a copy of this document"
                  checked={form.allowDownload}
                  onChange={(v) => setForm({ ...form, allowDownload: v })}
                />
                <ToggleField
                  label="Allow Comments"
                  description="Enable comments and feedback on this document"
                  checked={form.allowComments}
                  onChange={(v) => setForm({ ...form, allowComments: v })}
                />
                <ToggleField
                  label="Notify on Publish"
                  description="Send notifications when document is published"
                  checked={form.notifyOnPublish}
                  onChange={(v) => setForm({ ...form, notifyOnPublish: v })}
                />
                <ToggleField
                  label="Require Acknowledgment"
                  description="Users must acknowledge reading this document"
                  checked={form.requireAcknowledgment}
                  onChange={(v) => setForm({ ...form, requireAcknowledgment: v })}
                />

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <h4 className="text-sm font-semibold text-hoterra-navy">Review Schedule</h4>
                  <p className="mt-1 text-xs text-gray-600">
                    Next review scheduled for {formatDate(form.nextReviewDate)}. You will receive
                    a reminder 30 days before the review date.
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Select the approval workflow for this document. The workflow determines who must
                  review and sign before publication.
                </p>
                <div className="space-y-3">
                  {workflows.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => setForm({ ...form, workflowId: wf.id })}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        form.workflowId === wf.id
                          ? 'border-hoterra-gold bg-hoterra-gold/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-hoterra-navy">{wf.name}</span>
                            {wf.isDefault && (
                              <span className="rounded-full bg-hoterra-steel/10 px-2 py-0.5 text-[10px] font-medium text-hoterra-steel">
                                Default
                              </span>
                            )}
                          </div>
                          {wf.description && (
                            <p className="mt-1 text-xs text-gray-500">{wf.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {wf.steps.map((s, i) => (
                              <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                                {i + 1}. {s}
                              </span>
                            ))}
                          </div>
                        </div>
                        {form.workflowId === wf.id && (
                          <Check className="h-5 w-5 shrink-0 text-hoterra-gold" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <SummarySection title="Document Details">
                  <SummaryRow label="Title" value={form.title} />
                  <SummaryRow label="Code" value={form.code} />
                  <SummaryRow label="Department" value={getDeptName()} />
                  <SummaryRow label="Category" value={CATEGORY_LABELS[form.category]} />
                  <SummaryRow label="Version" value={form.version} />
                  <SummaryRow label="Author" value={getUserName(form.authorId)} />
                  <SummaryRow label="Owner (HOD)" value={getUserName(form.ownerId)} />
                  <SummaryRow label="Language" value={form.language} />
                  <SummaryRow label="Effective Date" value={formatDate(form.effectiveDate)} />
                  <SummaryRow label="Next Review" value={formatDate(form.nextReviewDate)} />
                  <SummaryRow label="Tags" value={form.tags.join(', ') || '—'} />
                </SummarySection>

                <SummarySection title="Content">
                  <SummaryRow
                    label="Content"
                    value={form.content ? `${form.content.slice(0, 80)}...` : 'No content added (upload or enter text)'}
                  />
                </SummarySection>

                <SummarySection title="Settings">
                  <SummaryRow label="Public" value={form.isPublic ? 'Yes' : 'No'} />
                  <SummaryRow label="Allow Download" value={form.allowDownload ? 'Yes' : 'No'} />
                  <SummaryRow label="Allow Comments" value={form.allowComments ? 'Yes' : 'No'} />
                  <SummaryRow label="Notify on Publish" value={form.notifyOnPublish ? 'Yes' : 'No'} />
                  <SummaryRow label="Require Acknowledgment" value={form.requireAcknowledgment ? 'Yes' : 'No'} />
                </SummarySection>

                <SummarySection title="Approval Workflow">
                  <SummaryRow label="Workflow" value={getWorkflowName()} />
                </SummarySection>
              </div>
            )}
          </div>
        </div>

        {step === 0 && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Choose Template</h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Search templates..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selectedTemplate === t.id
                      ? 'border-hoterra-gold bg-hoterra-gold/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium text-hoterra-navy">{t.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{t.description}</div>
                    </div>
                    {selectedTemplate === t.id && (
                      <Check className="h-4 w-4 shrink-0 text-hoterra-gold" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button type="button" className="mt-4 text-xs font-medium text-hoterra-steel hover:underline">
              View all templates →
            </button>

            <div className="mt-8 rounded-xl bg-blue-50 p-4">
              <h4 className="text-sm font-semibold text-hoterra-navy">Need Help?</h4>
              <p className="mt-1 text-xs text-gray-600">
                Select a template to auto-fill document structure. You can customize the approval
                workflow in step 4.
              </p>
            </div>
          </aside>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save as Draft'}
        </button>
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-hoterra-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel"
            >
              Next: {STEPS[step + 1]} →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-hoterra-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Document'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 p-4 hover:bg-gray-50">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-hoterra-steel' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-hoterra-navy">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}
