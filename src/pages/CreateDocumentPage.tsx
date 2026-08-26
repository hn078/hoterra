import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Search, Upload, X } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { SwitchField } from '@/components/ui/Switch';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { api } from '@/lib/api';
import type { Department, Template, User, DocumentCategory, DocumentPriority, WorkflowItem } from '@/types';
import { CATEGORY_LABELS, ROLE_LABELS } from '@/types';
import {
  parseWorkflowSteps,
  stepDisplayLabel,
  stepTypeMeta,
  WORKFLOW_STATUS_LABELS,
} from '@/lib/workflows';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { hasCapability } from '@/modules/access-control/capabilities';

const STEPS = [
  'Document Details',
  'Content',
  'Review & Settings',
  'Approval Workflow',
  'Summary',
];

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const currentUser = useAuthStore((state) => state.user);
  const canReadDepartments = hasCapability(currentUser, 'departments.read');
  const canReadTemplates = hasCapability(currentUser, 'templates.read');
  const canReadUsers = hasCapability(currentUser, 'users.directory.read');
  const canReadWorkflows = hasCapability(currentUser, 'workflows.read');
  const [step, setStep] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [form, setForm] = useState({
    title: '',
    code: '',
    departmentId: '',
    category: 'SOP' as DocumentCategory,
    version: '1.0',
    description: '',
    language: 'English',
    tags: [] as string[],
    nextReviewDate: '',
    effectiveDate: '',
    ownerId: '',
    content: '',
    workflowId: '',
    priority: 'MEDIUM' as DocumentPriority,
    allowDownload: true,
    allowComments: true,
  });

  useEffect(() => {
    setLoadingOptions(true);
    setOptionsError('');
    Promise.all([
      canReadDepartments
        ? api.getDepartments()
        : Promise.resolve(currentUser?.department ? [currentUser.department] : [] as Department[]),
      canReadTemplates ? api.getTemplates() : Promise.resolve([] as Template[]),
      canReadUsers ? api.getUsers() : Promise.resolve(currentUser ? [currentUser] : [] as User[]),
      canReadWorkflows ? api.getWorkflows() : Promise.resolve([] as WorkflowItem[]),
    ]).then(([depts, tmpls, usrs, wfs]) => {
      const activeWorkflows = wfs
        .map((w) => ({ ...w, steps: parseWorkflowSteps(w.steps) }))
        .filter((w) => w.status === 'ACTIVE');
      setDepartments(depts);
      const activeTemplates = tmpls.filter((template) => template.isActive === true && template.status === 'ACTIVE');
      setTemplates(activeTemplates);
      setUsers(usrs);
      setWorkflows(activeWorkflows);
      const defaultDepartment = depts.find((d) => d.code === 'FO') || depts[0];
      const departmentOwner = usrs.find((u) => u.department?.id === defaultDepartment?.id && u.role === 'HOD')
        || usrs.find((u) => u.department?.id === defaultDepartment?.id)
        || currentUser;
      const defaultWf = activeWorkflows.find((w) => w.isDefault) || activeWorkflows[0];
      setForm((f) => ({
        ...f,
        departmentId: defaultDepartment?.id || '',
        ownerId: departmentOwner?.id || '',
        workflowId: defaultWf?.id || '',
      }));
      const initialTemplate = activeTemplates.find((template) => !template.departmentId || template.departmentId === defaultDepartment?.id);
      setSelectedTemplate(initialTemplate?.id || null);
      if (!defaultDepartment) setOptionsError('Your account has no department available for document creation.');
    }).catch((error) => {
      console.error(error);
      setOptionsError(error instanceof Error ? error.message : 'Document options could not be loaded');
    }).finally(() => setLoadingOptions(false));
  }, [canReadDepartments, canReadTemplates, canReadUsers, canReadWorkflows, currentUser?.id]);

  const availableTemplates = templates.filter((template) => (
    (!template.departmentId || template.departmentId === form.departmentId)
    && (!templateSearch.trim() || `${template.name} ${template.description ?? ''}`.toLowerCase().includes(templateSearch.trim().toLowerCase()))
  ));

  useEffect(() => {
    if (selectedTemplate && templates.some((template) => (
      template.id === selectedTemplate && (!template.departmentId || template.departmentId === form.departmentId)
    ))) return;
    const next = templates.find((template) => !template.departmentId || template.departmentId === form.departmentId);
    setSelectedTemplate(next?.id ?? null);
  }, [form.departmentId, selectedTemplate, templates]);

  const getDeptName = () => departments.find((d) => d.id === form.departmentId)?.name || '—';
  const getUserName = (id: string) => {
    const u = users.find((user) => user.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '—';
  };
  const getWorkflowName = () => workflows.find((w) => w.id === form.workflowId)?.name || '—';

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] ?? result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const createWithUpload = async () => {
    if (!form.title.trim()) throw new Error('Document title is required');
    if (!form.departmentId) throw new Error('A permitted department is required');
    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) throw new Error('File exceeds maximum size of 10 MB');
    const doc = await api.createDocument({
      title: form.title,
      code: form.code,
      departmentId: form.departmentId,
      category: form.category,
      version: form.version,
      description: form.description,
      language: form.language,
      tags: form.tags,
      nextReviewDate: form.nextReviewDate,
      effectiveDate: form.effectiveDate,
      ownerId: form.ownerId || undefined,
      content: form.content,
      workflowId: form.workflowId || undefined,
      priority: form.priority,
      allowDownload: form.allowDownload,
      allowComments: form.allowComments,
      templateId: selectedTemplate || undefined,
    });

    if (selectedFile) {
      const data = await readFileAsBase64(selectedFile);
      await api.uploadDocumentFile(doc.id, selectedFile.name, selectedFile.type, data);
    }

    return doc;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const doc = await createWithUpload();
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to save', { title: 'Draft not saved' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const doc = await createWithUpload();
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      await dialog.alert(err instanceof Error ? err.message : 'Failed to create document', { title: 'Document not created' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      void dialog.alert('File exceeds maximum size of 10 MB', { title: 'File too large' });
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag) || form.tags.length >= 50) return;
    setForm((current) => ({ ...current, tags: [...current.tags, tag.slice(0, 100)] }));
    setTagInput('');
  };

  const selectDepartment = (departmentId: string) => {
    const owner = users.find((user) => user.department?.id === departmentId && user.role === 'HOD')
      || users.find((user) => user.department?.id === departmentId)
      || currentUser;
    setForm((current) => ({ ...current, departmentId, ownerId: owner?.id || '' }));
  };

  const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title="Create Document"
        subtitle="Documents › Create Document"
        action={
          <button onClick={() => navigate('/documents')} className="btn-secondary">
            Cancel
          </button>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex items-center justify-between overflow-x-auto">
          {STEPS.map((stepName, i) => (
            <div key={stepName} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    i === step
                      ? 'bg-hoterra-gold text-white ring-4 ring-hoterra-gold/20'
                      : i < step
                        ? 'bg-hoterra-steel text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`whitespace-nowrap text-xs font-medium ${
                    i === step ? 'text-hoterra-gold' : i < step ? 'text-hoterra-steel' : 'text-gray-400'
                  }`}
                >
                  {stepName}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 mb-5 h-0.5 flex-1 ${i < step ? 'bg-hoterra-steel' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-hoterra-page lg:flex-row lg:overflow-hidden">
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="mx-auto max-w-3xl">
            {loadingOptions && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading permitted document options...</div>
            )}
            {optionsError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{optionsError}</div>
            )}
            {step === 0 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Department">
                    <select
                      value={form.departmentId}
                      onChange={(e) => selectDepartment(e.target.value)}
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Author">
                    <div className="input flex items-center bg-gray-50 text-gray-600">
                      {currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Current user'}
                    </div>
                  </Field>
                  <Field label="Document Owner (HOD)">
                    {canReadUsers ? (
                      <select
                        value={form.ownerId}
                        onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                        className="input"
                      >
                        {users.filter((user) => user.department?.id === form.departmentId).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="input flex items-center bg-gray-50 text-gray-600">
                        {getUserName(form.ownerId || currentUser?.id || '')}
                      </div>
                    )}
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
                  <div className="flex flex-wrap items-center gap-2">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-hoterra-steel/10 px-3 py-1 text-xs font-medium text-hoterra-steel"
                      >
                        {tag}
                        <button type="button" aria-label={`Remove ${tag}`} onClick={() => setForm((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <div className="flex min-w-48 flex-1 gap-2">
                      <input
                        value={tagInput}
                        maxLength={100}
                        placeholder="Add a tag"
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }}
                        className="input py-1.5 text-xs"
                      />
                      <button type="button" onClick={addTag} className="btn-secondary py-1.5 text-xs">Add</button>
                    </div>
                  </div>
                </Field>

                <Field label="Priority">
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value as DocumentPriority })
                    }
                    className="input"
                  >
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </Field>

                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={4}
                    className="input resize-none"
                  />
                </Field>

              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <Field label="Upload Document">
                  <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center transition-colors hover:border-hoterra-steel hover:bg-gray-50">
                    <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">
                      Choose a file to upload
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      PDF, DOCX, XLSX, CSV, TXT or image up to 10 MB
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp"
                      onChange={handleFileChange}
                      className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-hoterra-navy file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-hoterra-steel"
                    />
                    {selectedFile && (
                      <p className="mt-2 text-xs text-green-600">Selected: {selectedFile.name}</p>
                    )}
                  </div>
                </Field>

                <Field label="Document Content">
                  <div className="overflow-hidden rounded-xl border border-gray-200">
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
                <SwitchField
                  label="Allow Download"
                  description="Users can download a copy of this document"
                  checked={form.allowDownload}
                  onChange={(v) => setForm({ ...form, allowDownload: v })}
                />
                <SwitchField
                  label="Allow Comments"
                  description="Enable comments and feedback on this document"
                  checked={form.allowComments}
                  onChange={(v) => setForm({ ...form, allowComments: v })}
                />
                {form.nextReviewDate && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <h4 className="text-sm font-semibold text-hoterra-navy">Review Schedule</h4>
                  <p className="mt-1 text-xs text-gray-600">
                    Next review scheduled for {formatDate(form.nextReviewDate)}. You will receive
                    a reminder 30 days before the review date.
                  </p>
                </div>}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Select the approval workflow for this document. The workflow determines who must
                  review and sign before publication.
                </p>
                <div className="space-y-3">
                  {!canReadWorkflows && (
                    <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                      Your role does not manage workflow selection. The standard document approval policy will apply.
                    </p>
                  )}
                  {canReadWorkflows && workflows.length === 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      No active workflow is available. The document can be saved as draft, but a workflow must be activated before review.
                    </p>
                  )}
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
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              {WORKFLOW_STATUS_LABELS[wf.status]}
                            </span>
                          </div>
                          {wf.description && (
                            <p className="mt-1 text-xs text-gray-500">{wf.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {wf.steps.map((s, i) => (
                              <span
                                key={s.id ?? i}
                                className={`rounded px-2 py-0.5 text-[10px] ${
                                  stepTypeMeta(s.type === 'SIGN' ? 'APPROVAL' : s.type).runtimeImplemented
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                                title={
                                  stepTypeMeta(s.type === 'SIGN' ? 'APPROVAL' : s.type).runtimeImplemented
                                    ? undefined
                                    : 'Design only — not enforced at runtime yet'
                                }
                              >
                                {i + 1}. {stepDisplayLabel(s, ROLE_LABELS)}
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
                  <SummaryRow label="Author" value={currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : '—'} />
                  <SummaryRow label="Owner" value={getUserName(form.ownerId || currentUser?.id || '')} />
                  <SummaryRow label="Language" value={form.language} />
                  <SummaryRow label="Effective Date" value={formatDate(form.effectiveDate)} />
                  <SummaryRow label="Next Review" value={formatDate(form.nextReviewDate)} />
                  <SummaryRow label="Priority" value={form.priority.charAt(0) + form.priority.slice(1).toLowerCase()} />
                  <SummaryRow label="Tags" value={form.tags.join(', ') || '—'} />
                </SummarySection>

                <SummarySection title="Content">
                  <SummaryRow
                    label="File"
                    value={selectedFile ? selectedFile.name : 'No file selected'}
                  />
                  <SummaryRow
                    label="Content"
                    value={form.content ? `${form.content.slice(0, 80)}...` : 'No content added (upload or enter text)'}
                  />
                </SummarySection>

                <SummarySection title="Settings">
                  <SummaryRow label="Allow Download" value={form.allowDownload ? 'Yes' : 'No'} />
                  <SummaryRow label="Allow Comments" value={form.allowComments ? 'Yes' : 'No'} />
                </SummarySection>

                <SummarySection title="Approval Workflow">
                  <SummaryRow label="Workflow" value={getWorkflowName()} />
                </SummarySection>
              </div>
            )}
          </div>
        </div>

        {step === 0 && canReadTemplates && (
          <aside className="card order-first max-h-80 w-full shrink-0 overflow-y-auto rounded-none border-x-0 border-t-0 p-4 shadow-none lg:order-none lg:max-h-none lg:w-80 lg:border-l lg:border-b-0 lg:p-5">
            <h3 className="mb-4 font-semibold text-hoterra-navy">Choose Template</h3>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              {availableTemplates.map((t) => (
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
            <button type="button" onClick={() => navigate('/templates')} className="mt-4 text-xs font-medium text-hoterra-steel hover:underline">
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
          disabled={saving || loadingOptions || Boolean(optionsError)}
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
              disabled={loadingOptions || Boolean(optionsError)}
              className="btn-primary px-5 py-2.5 disabled:opacity-50"
            >
              Next: {STEPS[step + 1]} →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || loadingOptions || Boolean(optionsError)}
              className="btn-primary px-5 py-2.5 disabled:opacity-50"
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
