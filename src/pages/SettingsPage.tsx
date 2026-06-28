import { useEffect, useState } from 'react';
import {
  Building2,
  Shield,
  PenLine,
  Hash,
  Bell,
  HardDrive,
  Mail,
  Plug,
  Database,
  Monitor,
  Key,
} from 'lucide-react';
import { Header } from '@/components/layout/Sidebar';
import { api } from '@/lib/api';
import type { SystemSettings } from '@/types';

const CATEGORIES = [
  { id: 'general', icon: Building2, label: 'General', labelRu: 'Общие' },
  { id: 'security', icon: Shield, label: 'Security', labelRu: 'Безопасность' },
  { id: 'signatures', icon: PenLine, label: 'Signatures', labelRu: 'Подписи' },
  { id: 'numbering', icon: Hash, label: 'Document Numbering', labelRu: 'Нумерация документов' },
  { id: 'notifications', icon: Bell, label: 'Notifications', labelRu: 'Уведомления' },
  { id: 'storage', icon: HardDrive, label: 'File Storage', labelRu: 'Хранилище файлов' },
  { id: 'email', icon: Mail, label: 'Email Settings', labelRu: 'Email настройки' },
  { id: 'integrations', icon: Plug, label: 'Integrations', labelRu: 'Интеграции' },
  { id: 'backup', icon: Database, label: 'Backup', labelRu: 'Резервное копирование' },
  { id: 'system', icon: Monitor, label: 'System', labelRu: 'Система' },
  { id: 'license', icon: Key, label: 'License', labelRu: 'Лицензия' },
];

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  const update = (key: keyof SystemSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header
        title="Settings"
        subtitle="Manage system parameters and configurations"
        showSearch
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase text-gray-400">
            Settings Categories
          </h3>
          <nav className="space-y-0.5">
            {CATEGORIES.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeCategory === id
                    ? 'bg-hoterra-gold/10 text-hoterra-navy font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 overflow-y-auto p-6">
          {activeCategory === 'general' ? (
            <div>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-hoterra-navy">General Settings</h2>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-hoterra-navy px-5 py-2 text-sm font-medium text-white hover:bg-hoterra-steel disabled:opacity-50"
                >
                  {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
                </button>
              </div>

              <SettingsSection title="Organization Information">
                <SettingsField label="Company Name">
                  <input
                    value={settings.companyName}
                    onChange={(e) => update('companyName', e.target.value)}
                    className="input"
                  />
                </SettingsField>
                <SettingsField label="Address">
                  <input
                    value={settings.companyAddress}
                    onChange={(e) => update('companyAddress', e.target.value)}
                    className="input"
                  />
                </SettingsField>
                <SettingsField label="Timezone">
                  <select
                    value={settings.timezone}
                    onChange={(e) => update('timezone', e.target.value)}
                    className="input"
                  >
                    <option value="Asia/Baku">(UTC+04:00) Baku</option>
                    <option value="Europe/Moscow">(UTC+03:00) Moscow</option>
                    <option value="UTC">(UTC+00:00) UTC</option>
                  </select>
                </SettingsField>
                <SettingsField label="Date Format">
                  <select
                    value={settings.dateFormat}
                    onChange={(e) => update('dateFormat', e.target.value)}
                    className="input"
                  >
                    <option value="DD MMM YYYY">DD MMM YYYY (31 May 2025)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  </select>
                </SettingsField>
                <SettingsField label="System Language">
                  <select
                    value={settings.systemLanguage}
                    onChange={(e) => update('systemLanguage', e.target.value)}
                    className="input"
                  >
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                    <option value="az">Azərbaycan</option>
                  </select>
                </SettingsField>
              </SettingsSection>

              <SettingsSection title="Document Parameters">
                <Toggle
                  label="Enable versioning"
                  checked={settings.enableVersioning}
                  onChange={(v) => update('enableVersioning', v)}
                />
                <Toggle
                  label="Mandatory next review date"
                  checked={settings.mandatoryReviewDate}
                  onChange={(v) => update('mandatoryReviewDate', v)}
                />
                <Toggle
                  label="Require document description"
                  checked={settings.requireDescription}
                  onChange={(v) => update('requireDescription', v)}
                />
                <Toggle
                  label="Allow downloading"
                  checked={settings.allowDownload}
                  onChange={(v) => update('allowDownload', v)}
                />
              </SettingsSection>

              <SettingsSection title="System Parameters">
                <SettingsField label="Auto logout on inactivity">
                  <select
                    value={settings.autoLogoutMinutes}
                    onChange={(e) => update('autoLogoutMinutes', parseInt(e.target.value))}
                    className="input"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                </SettingsField>
                <SettingsField label="Records per page">
                  <select
                    value={settings.recordsPerPage}
                    onChange={(e) => update('recordsPerPage', parseInt(e.target.value))}
                    className="input"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </SettingsField>
                <Toggle
                  label="Two-factor authentication"
                  checked={settings.enable2FA}
                  onChange={(v) => update('enable2FA', v)}
                />
                <Toggle
                  label="Allow comments"
                  checked={settings.allowComments}
                  onChange={(v) => update('allowComments', v)}
                />
                <Toggle
                  label="Show tooltips"
                  checked={settings.showTooltips}
                  onChange={(v) => update('showTooltips', v)}
                />
              </SettingsSection>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300">
              <p className="text-sm text-gray-400">
                {CATEGORIES.find((c) => c.id === activeCategory)?.label} — Stage 2+
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-4 font-semibold text-hoterra-navy">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingsField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-center">
      <label className="text-sm text-gray-600">{label}</label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-hoterra-navy' : 'bg-gray-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
