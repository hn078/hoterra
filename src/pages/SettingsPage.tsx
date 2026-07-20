import { useEffect, useMemo, useState } from 'react';
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
  Activity,
  Users,
  Server,
  Search,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';
import { DashStatCard } from '@/components/ui/DashStatCard';
import { SwitchRow } from '@/components/ui/Switch';
import { api } from '@/lib/api';
import type { AuditLog, SystemSettings } from '@/types';
import { formatDateTime } from '@/lib/utils';

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

type Ext = Record<string, Record<string, unknown>>;

function getExt(settings: SystemSettings): Ext {
  return (settings.extended ?? {}) as Ext;
}

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState('general');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.getSettingsStats>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [maintenanceLoading, setMaintenanceLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
    api.getSettingsStats().then(setStats).catch(console.error);
  }, []);

  const visibleCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.labelRu.toLowerCase().includes(q) ||
        c.id.includes(q)
    );
  }, [searchQuery]);

  const update = (key: keyof SystemSettings, value: unknown) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const updateExt = (section: string, key: string, value: unknown) => {
    if (!settings) return;
    const ext = getExt(settings);
    setSettings({
      ...settings,
      extended: {
        ...ext,
        [section]: { ...ext[section], [key]: value },
      },
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      api.getSettingsStats().then(setStats).catch(console.error);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    setMaintenanceLoading('cache');
    try {
      await api.clearSystemCache();
      alert('System cache cleared');
      api.getSettings().then(setSettings).catch(console.error);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear cache');
    } finally {
      setMaintenanceLoading(null);
    }
  };

  const handleReindex = async () => {
    setMaintenanceLoading('reindex');
    try {
      const res = await api.reindexSearch();
      alert(`Search reindexed (v${res.version})`);
      api.getSettings().then(setSettings).catch(console.error);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reindex');
    } finally {
      setMaintenanceLoading(null);
    }
  };

  const handleViewLogs = async () => {
    setMaintenanceLoading('logs');
    try {
      const data = await api.getMaintenanceLogs();
      setLogs(data);
      setShowLogs(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setMaintenanceLoading(null);
    }
  };

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  const ext = getExt(settings);
  const security = ext.security ?? {};
  const signatures = ext.signatures ?? {};
  const numbering = ext.numbering ?? {};
  const storage = ext.storage ?? {};
  const emailCfg = ext.email ?? {};
  const integrations = ext.integrations ?? {};
  const backup = ext.backup ?? {};
  const system = ext.system ?? {};
  const license = ext.license ?? {};

  const categoryTitle = CATEGORIES.find((c) => c.id === activeCategory)?.label ?? 'Settings';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-hoterra-page">
      <header className="border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-hoterra-navy">Settings (Admin)</h1>
            <p className="mt-0.5 text-sm text-gray-500">Manage system settings and preferences</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-hoterra-steel focus:outline-none focus:ring-1 focus:ring-hoterra-steel"
              />
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              System Health
            </span>
          </div>
        </div>
      </header>

      <div className="page-stats">
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashStatCard
            label="System Version"
            value={stats?.systemVersion ?? 'v1.0.3'}
            sub="Up to date"
            icon={Server}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <DashStatCard
            label="Storage Used"
            value={stats ? `${stats.storageGb} GB` : '—'}
            sub={stats ? `${stats.storagePercent}% of ${stats.storageTotalGb} GB` : ''}
            icon={HardDrive}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
          <DashStatCard
            label="Active Users"
            value={stats?.activeUsers ?? '—'}
            sub={stats ? `Out of ${stats.licenseSeats} seats` : ''}
            icon={Users}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
          <DashStatCard
            label="System Uptime"
            value={stats?.uptime ?? '99.9%'}
            sub="Last 30 days"
            icon={Activity}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-50"
          />
          <DashStatCard
            label="Licensing"
            value={stats?.licenseTier ?? 'Enterprise'}
            sub={stats ? `Valid until ${stats.licenseValidUntil}` : ''}
            icon={Key}
            iconColor="text-orange-600"
            iconBg="bg-orange-50"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden bg-white">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-200 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase text-gray-400">Settings Categories</h3>
          <nav className="space-y-0.5">
            {visibleCategories.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeCategory === id ? 'settings-nav-active' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
            {visibleCategories.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No matching categories</p>
            )}
          </nav>
        </aside>

        <div className="flex-1 overflow-y-auto bg-hoterra-page p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-hoterra-navy">{categoryTitle}</h2>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
            </button>
          </div>

          {activeCategory === 'general' && (
            <>
              <SettingsSection title="Organization Information">
                <SettingsField label="Company Name">
                  <input value={settings.companyName} onChange={(e) => update('companyName', e.target.value)} className="input" />
                </SettingsField>
                <SettingsField label="Address">
                  <input value={settings.companyAddress} onChange={(e) => update('companyAddress', e.target.value)} className="input" />
                </SettingsField>
                <SettingsField label="Timezone">
                  <select value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} className="input">
                    <option value="Asia/Baku">(UTC+04:00) Baku</option>
                    <option value="Europe/Moscow">(UTC+03:00) Moscow</option>
                    <option value="UTC">(UTC+00:00) UTC</option>
                  </select>
                </SettingsField>
                <SettingsField label="Date Format">
                  <select value={settings.dateFormat} onChange={(e) => update('dateFormat', e.target.value)} className="input">
                    <option value="DD MMM YYYY">DD MMM YYYY (31 May 2025)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  </select>
                </SettingsField>
                <SettingsField label="System Language">
                  <select value={settings.systemLanguage} onChange={(e) => update('systemLanguage', e.target.value)} className="input">
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                    <option value="az">Azərbaycan</option>
                  </select>
                </SettingsField>
              </SettingsSection>
              <SettingsSection title="Document Parameters">
                <SwitchRow label="Enable versioning" checked={settings.enableVersioning} onChange={(v) => update('enableVersioning', v)} />
                <SwitchRow label="Mandatory next review date" checked={settings.mandatoryReviewDate} onChange={(v) => update('mandatoryReviewDate', v)} />
                <SwitchRow label="Require document description" checked={settings.requireDescription} onChange={(v) => update('requireDescription', v)} />
                <SwitchRow label="Allow downloading" checked={settings.allowDownload} onChange={(v) => update('allowDownload', v)} />
              </SettingsSection>
              <SettingsSection title="System Parameters">
                <SettingsField label="Auto logout on inactivity">
                  <select value={settings.autoLogoutMinutes} onChange={(e) => update('autoLogoutMinutes', parseInt(e.target.value))} className="input">
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                </SettingsField>
                <SettingsField label="Records per page">
                  <select value={settings.recordsPerPage} onChange={(e) => update('recordsPerPage', parseInt(e.target.value))} className="input">
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </SettingsField>
                <SwitchRow label="Two-factor authentication" checked={settings.enable2FA} onChange={(v) => update('enable2FA', v)} />
                <SwitchRow label="Allow comments" checked={settings.allowComments} onChange={(v) => update('allowComments', v)} />
                <SwitchRow label="Show tooltips" checked={settings.showTooltips} onChange={(v) => update('showTooltips', v)} />
              </SettingsSection>
            </>
          )}

          {activeCategory === 'security' && (
            <SettingsSection title="Security Policy">
              <SettingsField label="Password Policy">
                <select value={String(security.passwordPolicy ?? 'Strong')} onChange={(e) => updateExt('security', 'passwordPolicy', e.target.value)} className="input">
                  <option value="Basic">Basic</option>
                  <option value="Strong">Strong</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </SettingsField>
              <SettingsField label="Minimum Password Length">
                <input type="number" value={Number(security.minPasswordLength ?? 8)} onChange={(e) => updateExt('security', 'minPasswordLength', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SettingsField label="Session Timeout (minutes)">
                <input type="number" value={Number(security.sessionTimeoutMinutes ?? 30)} onChange={(e) => updateExt('security', 'sessionTimeoutMinutes', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SwitchRow label="Enable 2FA" checked={Boolean(security.enable2FA ?? settings.enable2FA)} onChange={(v) => updateExt('security', 'enable2FA', v)} />
              <SwitchRow label="Allow user self-registration" checked={Boolean(security.allowUserRegistration ?? false)} onChange={(v) => updateExt('security', 'allowUserRegistration', v)} />
              <SettingsField label="IP Restrictions">
                <textarea
                  value={Array.isArray(security.ipRestrictions) ? (security.ipRestrictions as string[]).join('\n') : ''}
                  onChange={(e) => updateExt('security', 'ipRestrictions', e.target.value.split('\n').filter(Boolean))}
                  rows={3}
                  className="input font-mono text-xs"
                  placeholder="One CIDR per line"
                />
              </SettingsField>
            </SettingsSection>
          )}

          {activeCategory === 'signatures' && (
            <SettingsSection title="Digital Signatures">
              <SwitchRow label="Require PIN for signing" checked={Boolean(signatures.requirePin ?? true)} onChange={(v) => updateExt('signatures', 'requirePin', v)} />
              <SettingsField label="Hash Algorithm">
                <select value={String(signatures.hashAlgorithm ?? 'SHA-256')} onChange={(e) => updateExt('signatures', 'hashAlgorithm', e.target.value)} className="input">
                  <option value="SHA-256">SHA-256</option>
                  <option value="SHA-512">SHA-512</option>
                </select>
              </SettingsField>
              <SwitchRow label="Require witness" checked={Boolean(signatures.requireWitness ?? false)} onChange={(v) => updateExt('signatures', 'requireWitness', v)} />
              <SwitchRow label="Auto timestamp" checked={Boolean(signatures.autoTimestamp ?? true)} onChange={(v) => updateExt('signatures', 'autoTimestamp', v)} />
            </SettingsSection>
          )}

          {activeCategory === 'numbering' && (
            <SettingsSection title="Document Numbering">
              <SwitchRow label="Auto-generate document codes" checked={Boolean(numbering.autoGenerate ?? true)} onChange={(v) => updateExt('numbering', 'autoGenerate', v)} />
              <SettingsField label="Prefix Pattern">
                <input value={String(numbering.prefixPattern ?? '{DEPT}-{CAT}')} onChange={(e) => updateExt('numbering', 'prefixPattern', e.target.value)} className="input font-mono" />
              </SettingsField>
              <SettingsField label="Separator">
                <input value={String(numbering.separator ?? '-')} onChange={(e) => updateExt('numbering', 'separator', e.target.value)} className="input w-20" />
              </SettingsField>
              <SettingsField label="Sequence Padding">
                <input type="number" value={Number(numbering.padding ?? 3)} onChange={(e) => updateExt('numbering', 'padding', parseInt(e.target.value))} className="input w-24" />
              </SettingsField>
              <SwitchRow label="Reset sequence yearly" checked={Boolean(numbering.resetYearly ?? false)} onChange={(v) => updateExt('numbering', 'resetYearly', v)} />
            </SettingsSection>
          )}

          {activeCategory === 'notifications' && (
            <SettingsSection title="Notification Preferences">
              <SwitchRow label="Email notifications" checked={settings.notifyEmail ?? true} onChange={(v) => update('notifyEmail', v)} />
              <SwitchRow label="Push notifications" checked={settings.notifyPush ?? true} onChange={(v) => update('notifyPush', v)} />
              <SwitchRow label="In-app notifications" checked={settings.notifyInApp ?? true} onChange={(v) => update('notifyInApp', v)} />
            </SettingsSection>
          )}

          {activeCategory === 'storage' && (
            <SettingsSection title="File Storage">
              <SettingsField label="Total Storage (GB)">
                <input type="number" value={Number(storage.totalGb ?? 1024)} onChange={(e) => updateExt('storage', 'totalGb', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SettingsField label="Max File Size (MB)">
                <input type="number" value={Number(storage.maxFileSizeMb ?? 50)} onChange={(e) => updateExt('storage', 'maxFileSizeMb', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SettingsField label="Allowed File Types">
                <input
                  value={Array.isArray(storage.allowedTypes) ? (storage.allowedTypes as string[]).join(', ') : 'pdf, docx, xlsx, pptx'}
                  onChange={(e) => updateExt('storage', 'allowedTypes', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  className="input"
                />
              </SettingsField>
              <SettingsField label="Backup Frequency">
                <select value={String(storage.backupFrequency ?? 'Daily')} onChange={(e) => updateExt('storage', 'backupFrequency', e.target.value)} className="input">
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </SettingsField>
              <SettingsField label="Backup Retention (days)">
                <input type="number" value={Number(storage.backupRetentionDays ?? 30)} onChange={(e) => updateExt('storage', 'backupRetentionDays', parseInt(e.target.value))} className="input" />
              </SettingsField>
            </SettingsSection>
          )}

          {activeCategory === 'email' && (
            <SettingsSection title="SMTP Configuration">
              <SwitchRow label="Enable email delivery" checked={Boolean(emailCfg.enabled ?? false)} onChange={(v) => updateExt('email', 'enabled', v)} />
              <SettingsField label="SMTP Host">
                <input value={String(emailCfg.smtpHost ?? '')} onChange={(e) => updateExt('email', 'smtpHost', e.target.value)} className="input" />
              </SettingsField>
              <SettingsField label="SMTP Port">
                <input type="number" value={Number(emailCfg.smtpPort ?? 587)} onChange={(e) => updateExt('email', 'smtpPort', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SettingsField label="From Address">
                <input value={String(emailCfg.fromAddress ?? '')} onChange={(e) => updateExt('email', 'fromAddress', e.target.value)} className="input" />
              </SettingsField>
              <SettingsField label="From Name">
                <input value={String(emailCfg.fromName ?? '')} onChange={(e) => updateExt('email', 'fromName', e.target.value)} className="input" />
              </SettingsField>
              <SwitchRow label="Use TLS" checked={Boolean(emailCfg.useTls ?? true)} onChange={(v) => updateExt('email', 'useTls', v)} />
            </SettingsSection>
          )}

          {activeCategory === 'integrations' && (
            <SettingsSection title="Third-Party Integrations">
              {(['operaPms', 'microsoft365', 'activeDirectory'] as const).map((key) => {
                const cfg = (integrations[key] ?? {}) as Record<string, unknown>;
                const labels: Record<string, string> = {
                  operaPms: 'Opera PMS',
                  microsoft365: 'Microsoft 365',
                  activeDirectory: 'Active Directory',
                };
                return (
                  <div key={key} className="rounded-lg border border-gray-100 p-4">
                    <SwitchRow
                      label={labels[key]}
                      checked={Boolean(cfg.enabled ?? false)}
                      onChange={(v) => updateExt('integrations', key, { ...cfg, enabled: v })}
                    />
                    {Boolean(cfg.enabled) && (
                      <p className="mt-2 text-xs text-gray-400">Connection settings saved — configure credentials in admin portal.</p>
                    )}
                  </div>
                );
              })}
            </SettingsSection>
          )}

          {activeCategory === 'backup' && (
            <SettingsSection title="Backup Configuration">
              <SwitchRow label="Enable automated backups" checked={Boolean(backup.enabled ?? true)} onChange={(v) => updateExt('backup', 'enabled', v)} />
              <SettingsField label="Schedule (cron)">
                <input value={String(backup.schedule ?? '0 2 * * *')} onChange={(e) => updateExt('backup', 'schedule', e.target.value)} className="input font-mono" />
              </SettingsField>
              <SettingsField label="Retention (days)">
                <input type="number" value={Number(backup.retentionDays ?? 30)} onChange={(e) => updateExt('backup', 'retentionDays', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SwitchRow label="Include attachments" checked={Boolean(backup.includeAttachments ?? true)} onChange={(v) => updateExt('backup', 'includeAttachments', v)} />
              <SettingsField label="Last Backup Status">
                <span className="text-sm text-gray-600">{String(backup.lastBackupStatus ?? 'success')}</span>
              </SettingsField>
            </SettingsSection>
          )}

          {activeCategory === 'system' && (
            <SettingsSection title="System Configuration">
              <SwitchRow label="Maintenance mode" checked={Boolean(system.maintenanceMode ?? false)} onChange={(v) => updateExt('system', 'maintenanceMode', v)} />
              <SwitchRow label="Enable reCAPTCHA" checked={Boolean(system.enableRecaptcha ?? false)} onChange={(v) => updateExt('system', 'enableRecaptcha', v)} />
              <SwitchRow label="Cache enabled" checked={Boolean(system.cacheEnabled ?? true)} onChange={(v) => updateExt('system', 'cacheEnabled', v)} />
              <SettingsField label="Search Index Version">
                <span className="text-sm text-gray-600">{String(system.searchIndexVersion ?? 1)}</span>
              </SettingsField>
              {system.lastCacheClear && (
                <SettingsField label="Last Cache Clear">
                  <span className="text-sm text-gray-600">{formatDateTime(String(system.lastCacheClear))}</span>
                </SettingsField>
              )}
              {system.lastReindex && (
                <SettingsField label="Last Reindex">
                  <span className="text-sm text-gray-600">{formatDateTime(String(system.lastReindex))}</span>
                </SettingsField>
              )}
            </SettingsSection>
          )}

          {activeCategory === 'license' && (
            <SettingsSection title="License Information">
              <SettingsField label="License Tier">
                <input value={String(license.tier ?? 'Enterprise')} onChange={(e) => updateExt('license', 'tier', e.target.value)} className="input" />
              </SettingsField>
              <SettingsField label="Valid Until">
                <input type="date" value={String(license.validUntil ?? '2025-12-31')} onChange={(e) => updateExt('license', 'validUntil', e.target.value)} className="input" />
              </SettingsField>
              <SettingsField label="Licensed Seats">
                <input type="number" value={Number(license.seats ?? 200)} onChange={(e) => updateExt('license', 'seats', parseInt(e.target.value))} className="input" />
              </SettingsField>
              <SettingsField label="Organization ID">
                <input value={String(license.organizationId ?? '')} onChange={(e) => updateExt('license', 'organizationId', e.target.value)} className="input font-mono text-sm" readOnly />
              </SettingsField>
            </SettingsSection>
          )}
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-hoterra-page p-5">
          <SettingsSideCard title="Security Settings" action="Manage" onAction={() => setActiveCategory('security')}>
            {[
              { label: 'Password Policy', value: String(security.passwordPolicy ?? 'Strong') },
              { label: 'Session Timeout', value: `${security.sessionTimeoutMinutes ?? 30} min` },
              { label: '2FA', value: (security.enable2FA ?? settings.enable2FA) ? 'Enabled' : 'Disabled' },
              { label: 'IP Restrictions', value: `${Array.isArray(security.ipRestrictions) ? (security.ipRestrictions as string[]).length : 0} allowed` },
            ].map((row) => (
              <SideRow key={row.label} label={row.label} value={row.value} onClick={() => setActiveCategory('security')} />
            ))}
          </SettingsSideCard>

          <SettingsSideCard title="Storage & Backup" action="Manage" className="mt-4" onAction={() => setActiveCategory('storage')}>
            {[
              { label: 'Total Storage', value: `${storage.totalGb ?? 1024} GB` },
              { label: 'Used Storage', value: stats ? `${stats.storageGb} GB` : '—' },
              { label: 'Backup Frequency', value: String(storage.backupFrequency ?? 'Daily') },
              { label: 'Backup Retention', value: `${storage.backupRetentionDays ?? 30} days` },
            ].map((row) => (
              <SideRow key={row.label} label={row.label} value={row.value} onClick={() => setActiveCategory('backup')} />
            ))}
          </SettingsSideCard>

          <SettingsSideCard title="System Maintenance" action="Manage" className="mt-4" onAction={() => setActiveCategory('system')}>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Clear System Cache</span>
                <button onClick={handleClearCache} disabled={maintenanceLoading === 'cache'} className="btn-secondary py-1 text-xs disabled:opacity-50">
                  {maintenanceLoading === 'cache' ? 'Clearing...' : 'Clear Cache'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Reindex Search</span>
                <button onClick={handleReindex} disabled={maintenanceLoading === 'reindex'} className="btn-secondary py-1 text-xs disabled:opacity-50">
                  {maintenanceLoading === 'reindex' ? 'Reindexing...' : 'Reindex'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">System Logs</span>
                <button onClick={handleViewLogs} disabled={maintenanceLoading === 'logs'} className="btn-secondary py-1 text-xs disabled:opacity-50">
                  {maintenanceLoading === 'logs' ? 'Loading...' : 'View Logs'}
                </button>
              </div>
            </div>
          </SettingsSideCard>
        </aside>
      </div>

      <div className="flex items-start gap-3 border-t border-blue-100 bg-blue-50 px-6 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Settings are applied system-wide and may affect all users. Please be careful when making changes.</p>
      </div>

      {showLogs && logs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-hoterra-navy">Maintenance Logs</h2>
              <button onClick={() => setShowLogs(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-400">No logs found</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                      <p className="font-medium text-gray-800">{log.action} · {log.entityType}</p>
                      <p className="text-gray-500">{log.userName} · {formatDateTime(log.createdAt)}</p>
                      {log.details && <p className="mt-1 text-gray-600">{log.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsSideCard({
  title,
  action,
  children,
  className,
  onAction,
}: {
  title: string;
  action: string;
  children: React.ReactNode;
  className?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`card p-4 ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-hoterra-navy">{title}</h3>
        <button onClick={onAction} className="text-xs font-medium text-hoterra-steel hover:underline">
          {action}
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SideRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs hover:bg-gray-50">
      <span className="text-gray-600">{label}</span>
      <span className="flex items-center gap-1 font-medium text-gray-800">
        {value}
        <ChevronRight className="h-3 w-3 text-gray-400" />
      </span>
    </button>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card mb-8 p-6">
      <h3 className="mb-4 font-semibold text-hoterra-navy">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-center">
      <label className="text-sm text-gray-600">{label}</label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

