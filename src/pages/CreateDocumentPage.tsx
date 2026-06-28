import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Search } from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { Department, Template, User, DocumentCategory } from '@/types';
import { CATEGORY_LABELS } from '@/types';

const STEPS = [
  'Document Details',
  'Content',
  'Review & Settings',
  'Approval Workflow',
  'Summary',
];

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
  });

  useEffect(() => {
    Promise.all([api.getDepartments(), api.getTemplates(), api.getUsers()]).then(
      ([depts, tmpls, usrs]) => {
        setDepartments(depts);
        setTemplates(tmpls);
        setUsers(usrs);
        const fo = depts.find((d) => d.code === 'FO');
        const nigar = usrs.find((u) => u.email === 'nigar.rustamova@hoterra.az');
        const fuad = usrs.find((u) => u.email === 'fuad.ahmadov@hoterra.az');
        setForm((f) => ({
          ...f,
          departmentId: fo?.id || depts[0]?.id || '',
          ownerId: nigar?.id || '',
          authorId: fuad?.id || '',
        }));
        setSelectedTemplate(tmpls[0]?.id || null);
      }
    );
  }, []);

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Create Document"
        subtitle="Documents › Create Document"
      />

      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  i === 0
                    ? 'bg-hoterra-gold/20 text-hoterra-gold'
                    : 'text-gray-400'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                    i === 0 ? 'bg-hoterra-gold text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i + 1}
                </span>
                {step}
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-5">
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
                <button className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500">
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
        </div>

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
          <button className="mt-4 text-xs font-medium text-hoterra-steel hover:underline">
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
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save as Draft'}
        </button>
        <button className="rounded-lg bg-hoterra-navy px-5 py-2.5 text-sm font-medium text-white hover:bg-hoterra-steel">
          Next: Content →
        </button>
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
