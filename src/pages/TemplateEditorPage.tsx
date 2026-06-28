import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Image,
  Table,
  Undo,
  Redo,
  Eye,
  Braces,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { DocumentPreviewCanvas } from '@/components/documents/DocumentPreviewCanvas';
import { api } from '@/lib/api';
import { TEMPLATE_FIELDS } from '@/data/mock';
import type { Role, SignaturePlacement, Template } from '@/types';
import { CATEGORY_LABELS, ROLE_LABELS } from '@/types';
import { SIGNATURE_ROLES } from '@/lib/signatures';

const DEFAULT_CONTENT = `# Standard Operating Procedure

**Document Code:** {{Document Code}}
**Document Title:** {{Document Title}}
**Version:** {{Version}}
**Effective Date:** {{Effective Date}}

---

## 1. PURPOSE
Describe the purpose of this procedure and why it exists.

## 2. SCOPE
This procedure applies to {{Department}} staff at {{Location}}.

## 3. RESPONSIBILITIES
- **Author:** {{Author}}
- **Reviewer:** {{Reviewer}}
- **Approver:** {{Approver}}

## 4. PROCEDURE
1. Step one of the procedure
2. Step two of the procedure
3. Step three of the procedure

## 5. REFERENCES
List related documents and policies.

---
*Prepared by {{Prepared By}} · {{Company Name}} · {{Created Date}}*`;

const TOOLBAR_GROUPS = [
  [Undo, Redo],
  [Bold, Italic, Underline],
  [AlignLeft, AlignCenter],
  [List, ListOrdered],
  [Table, Image],
  [Braces],
];

const DEFAULT_PLACEMENTS: SignaturePlacement[] = [
  { id: 'placement-hod', role: 'HOD', label: 'Head of Department', page: 'all', x: 8, y: 86, width: 24, height: 9 },
  { id: 'placement-finance', role: 'FINANCE_DIRECTOR', label: 'Finance Director', page: 'all', x: 38, y: 86, width: 24, height: 9 },
  { id: 'placement-gm', role: 'GENERAL_MANAGER', label: 'General Manager', page: 'all', x: 68, y: 86, width: 24, height: 9 },
];

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const [template, setTemplate] = useState<Template | null>(null);
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [name, setName] = useState('New SOP Template');
  const [previewMode, setPreviewMode] = useState(false);
  const [designSignatures, setDesignSignatures] = useState(false);
  const [placements, setPlacements] = useState<SignaturePlacement[]>(DEFAULT_PLACEMENTS);
  const [pageCount, setPageCount] = useState(1);
  const [placementRole, setPlacementRole] = useState<Role>('HOD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && id) {
      api.getTemplate(id).then((t) => {
        setTemplate(t);
        setName(t.name);
        if (t.content) setContent(t.content);
        if (t.pageCount) setPageCount(t.pageCount);
        if (t.signaturePlacement) {
          const raw = typeof t.signaturePlacement === 'string' ? JSON.parse(t.signaturePlacement) : t.signaturePlacement;
          if (Array.isArray(raw) && raw.length) setPlacements(raw);
        }
      }).catch(console.error);
    }
  }, [id, isNew]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const category = template?.category ?? 'SOP';
      const payload = { name, category, content, signaturePlacement: placements, pageCount };
      if (isNew) {
        await api.createTemplate(payload);
      } else if (id) {
        await api.updateTemplate(id, payload);
      }
      navigate('/templates');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <Header
        title={isNew ? 'New Template' : (template?.name ?? name)}
        subtitle={isNew ? 'Create a new document template' : 'Edit template content and fields'}
        action={
          <div className="flex items-center gap-2">
            {error && <span className="text-sm text-red-600">{error}</span>}
            <button
              onClick={() => {
                setDesignSignatures((v) => !v);
                if (!designSignatures) setPreviewMode(true);
              }}
              className={`btn-secondary ${designSignatures ? 'border-hoterra-gold bg-amber-50' : ''}`}
            >
              Signature Zones
            </button>
            <button
              onClick={() => setPreviewMode((v) => !v)}
              className={`btn-secondary ${previewMode ? 'border-hoterra-steel bg-hoterra-steel/5' : ''}`}
            >
              <Eye className="h-4 w-4" />
              {previewMode ? 'Edit' : 'Preview'}
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        }
      />

      <div className="border-b border-gray-200 bg-white px-6 pb-2 pt-2">
        <Breadcrumbs
          items={[
            { label: 'Templates', to: '/templates' },
            { label: isNew ? 'New Template' : (template?.name ?? name) },
          ]}
        />
      </div>

      <div className="flex border-b border-gray-200 bg-white px-4 py-2">
        {TOOLBAR_GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center border-r border-gray-100 pr-2 mr-2 last:border-0">
            {group.map((Icon, ii) => (
              <button
                key={ii}
                className="rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-hoterra-navy"
                title={Icon.displayName ?? 'Format'}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ))}
        {isNew && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="ml-auto max-w-xs rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-hoterra-steel focus:outline-none"
          />
        )}
      </div>

      <div className="flex flex-1 overflow-hidden bg-hoterra-page">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-hoterra-page p-6">
            <div className="mx-auto max-w-3xl">
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                  <span className="text-xs text-gray-500">Document Canvas</span>
                  {template && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {CATEGORY_LABELS[template.category]}
                    </span>
                  )}
                </div>

                <div className={`grid grid-cols-1 gap-0 ${previewMode ? '' : 'lg:grid-cols-2'}`}>
                  {!previewMode && (
                    <div className="border-b border-gray-100 p-4 lg:border-b-0 lg:border-r">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                        Editor
                      </p>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={22}
                        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-sm leading-relaxed focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
                        spellCheck={false}
                      />
                    </div>
                  )}

                  <div className="p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {designSignatures ? 'Click on the page to place signature zones' : 'Preview'}
                    </p>
                    <DocumentPreviewCanvas
                      document={{
                        title: name,
                        code: 'TEMPLATE-PREVIEW',
                        version: template?.version ?? '1.0',
                        description: template?.description ?? 'Template preview',
                        content,
                        pageCount,
                        signaturePlacement: placements,
                        status: 'DRAFT',
                      }}
                      mode={designSignatures ? 'design' : 'view'}
                      placements={placements}
                      onPlacementsChange={setPlacements}
                      onPageCountChange={setPageCount}
                      highlightRole={placementRole}
                      showThumbnails={pageCount > 1}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="card w-72 shrink-0 overflow-y-auto rounded-none border-l border-t-0 border-r-0 border-b-0 p-4 shadow-none">
          {designSignatures ? (
            <>
              <h3 className="mb-1 text-sm font-semibold text-hoterra-navy">Signature Placement</h3>
              <p className="mb-4 text-xs text-gray-500">
                Choose a role, then click on the document page. Zones marked &quot;all pages&quot; appear on every page when signing.
              </p>
              <label className="mb-1 block text-xs font-medium text-gray-600">Role for new zone</label>
              <select
                value={placementRole}
                onChange={(e) => setPlacementRole(e.target.value as Role)}
                className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {SIGNATURE_ROLES.map(({ role, label }) => (
                  <option key={role} value={role}>{label}</option>
                ))}
              </select>
              <div className="space-y-2">
                {placements.map((p) => (
                  <div key={p.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                    <div className="font-medium text-hoterra-navy">{ROLE_LABELS[p.role]}</div>
                    <div className="text-gray-500">
                      {p.page === 'all' ? 'All pages' : `Page ${p.page}`} · {Math.round(p.x)}%, {Math.round(p.y)}%
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlacements((prev) => prev.filter((item) => item.id !== p.id))}
                      className="mt-1 text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {placements.length === 0 && (
                  <p className="text-xs text-gray-400">No signature zones yet. Click the page to add one.</p>
                )}
              </div>
            </>
          ) : (
            <>
          <h3 className="mb-1 text-sm font-semibold text-hoterra-navy">Template Fields</h3>
          <p className="mb-4 text-xs text-gray-500">
            Click to insert {'{{placeholder}}'} into the editor
          </p>

          <div className="space-y-4">
            {TEMPLATE_FIELDS.map(({ group, fields }) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group}
                </p>
                <div className="space-y-1">
                  {fields.map((field) => (
                    <button
                      key={field}
                      onClick={() =>
                        setContent((prev) => `${prev}{{${field}}}`)
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-800"
                    >
                      <Braces className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span className="truncate">{field}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/templates"
            className="mt-6 inline-block text-xs text-hoterra-steel hover:underline"
          >
            ← Back to templates
          </Link>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
