import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

interface SettingRow {
  key: string;
  label: string;
  value: string;
  masked?: boolean;
}

const SETTINGS: SettingRow[] = [
  { key: 'stationName', label: 'STATION NAME', value: '' },
  { key: 'accentColor', label: 'ACCENT COLOR', value: '' },
  { key: 'theme', label: 'THEME', value: '' },
  { key: 'DEEPSEEK_API_KEY', label: 'AI API KEY', value: '', masked: true },
  { key: 'NCM_APPID', label: 'NCM APP ID', value: '', masked: true },
  { key: 'MIMO_API_KEY', label: 'TTS API KEY', value: '', masked: true },
  { key: 'HEFENG_API_KEY', label: 'WEATHER API KEY', value: '', masked: true },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    apiClient.getSettings().then(setSettings);
  }, []);

  const startEdit = (key: string) => {
    setEditing(key);
    setEditValue(prompt(`Enter value for ${key}:`, settings[key] || '') || '');
  };

  const saveEdit = async () => {
    if (!editing || !editValue.trim()) { setEditing(null); return; }
    await apiClient.updateSetting(editing, editValue.trim());
    const updated = await apiClient.getSettings();
    setSettings(updated);
    setEditing(null);
  };

  useEffect(() => {
    if (editing && editValue) saveEdit();
  }, [editing, editValue]);

  return (
    <>
      <div className="section-title">SETTINGS</div>
      <div className="settings-list">
        {SETTINGS.map((item) => (
          <div key={item.key} className="settings-row" onClick={() => startEdit(item.key)} style={{ cursor: 'pointer' }}>
            <span className="settings-row-label">{item.label}</span>
            <span className="settings-row-value">
              {item.masked
                ? (settings[item.key]?.includes('****') || settings[item.key] === '****'
                    ? settings[item.key]
                    : settings[item.key] ? 'Configured' : 'Not set')
                : (settings[item.key] || item.value || '—')}
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <button
          onClick={() => {
            if (confirm('Restore all settings to defaults?')) {
              Object.keys(settings).forEach((k) => apiClient.updateSetting(k, ''));
            }
          }}
          style={{
            fontFamily: 'var(--font-nav)', fontSize: 10, letterSpacing: '0.1em',
            color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          [RESTORE DEFAULTS]
        </button>
        <div style={{ marginTop: 12, fontFamily: 'var(--font-nav)', fontSize: 10, color: 'var(--text-disabled)' }}>
          Claudio FM · v1.0.0
        </div>
      </div>
    </>
  );
}
