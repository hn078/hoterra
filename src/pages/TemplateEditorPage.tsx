import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { api } from '@/lib/api';
import { TEMPLATE_FIELDS } from '@/data/mock';
import type { Template } from '@/types';
import { CATEGORY_LABELS } from '@/types';

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

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const [template, setTemplate] = useState<Template | null>(null);
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [name, setName] = useState('New SOP Template');

  useEffect(() => {
    if (!isNew && id) {
      api.getTemplate(id).then((t) => {
        setTemplate(t);
        setName(t.name);
        if (t.content) setContent(t.content);
      }).catch(console.error);
    }
  }, [id, isNew]);

  const displayContent = content.replace(
    /\{\{([^}]+)\}\}/g,
    '<span class="rounded bg-amber-100 px-1 text-amber-800">{{$1}}</span>'
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title={isNew ? 'New Template' : (template?.name ?? name)}
        subtitle={isNew ? 'Create a new document template' : 'Edit template content and fields'}
        action={
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-hoterra-navy px-4 py-2 text-sm font-medium text-white hover:bg-hoterra-steel">
              <Save className="h-4 w-4" />
              Save Template
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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
            <div className="mx-auto max-w-3xl">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                  <span className="text-xs text-gray-500">Document Canvas</span>
                  {template && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {CATEGORY_LABELS[template.category]}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
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

                  <div className="p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Preview
                    </p>
                    <div
                      className="prose prose-sm max-w-none rounded-lg border border-gray-100 bg-white p-4 text-sm leading-relaxed text-gray-700"
                      dangerouslySetInnerHTML={{
                        __html: displayContent
                          .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-hoterra-navy mb-4">$1</h1>')
                          .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-hoterra-navy mt-4 mb-2">$1</h2>')
                          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                          .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
                          .replace(/^(\d+\. .+)$/gm, '<li class="ml-4">$1</li>')
                          .replace(/^- \*\*(.+?)\*\*: (.+)$/gm, '<li class="ml-4"><strong>$1:</strong> $2</li>')
                          .replace(/\n\n/g, '<br /><br />')
                          .replace(/\n/g, '<br />'),
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="w-64 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4">
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
        </aside>
      </div>
    </div>
  );
}
