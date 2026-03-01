import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Settings2, CheckCircle, AlertCircle, Loader2, Info, Tv2, ScanLine } from 'lucide-react';
import { api } from '../api/client.js';

// ── Client profile definitions ────────────────────────────────────────

const CLIENT_PROFILES = [
  {
    id: 'android_tv',
    label: 'Android TV / Google TV (default)',
    av1: 'none',
    dv: 'app-level (P5/P8 via Jellyfin)',
    hint: 'Chromecast HD, older Android TV sticks. No AV1 hardware decode. Use H264/HEVC.',
  },
  {
    id: 'chromecast_4k',
    label: 'Chromecast with Google TV 4K (2022+)',
    av1: 'full',
    dv: 'P5, P8',
    hint: 'Full AV1 hardware decode. DV Profile 5 and 8 supported.',
  },
  {
    id: 'apple_tv',
    label: 'Apple TV 4K (3rd gen)',
    av1: 'full',
    dv: 'P5, P8',
    hint: 'Full AV1 hardware decode. DV P5/P8 only. No HDR10+.',
  },
  {
    id: 'shield',
    label: 'NVIDIA SHIELD',
    av1: 'full',
    dv: 'P5, P7, P8',
    hint: 'Most capable TV client. Full AV1. DV including P7 FEL.',
  },
  {
    id: 'fire_tv',
    label: 'Fire TV Stick 4K Max',
    av1: 'limited',
    dv: 'P8 (Dolby MAL)',
    hint: 'Limited AV1 — software decode only on most models. HEVC is preferred.',
  },
];

// ── Scoring tooltip content ────────────────────────────────────────────

const CODEC_SCORING_TOOLTIP = `Codec quality scores:
  AV1   = 100 — best compression but TV client compat varies
  HEVC  = 90  — preferred for 4K/HDR
  H264  = 70  — universal compatibility
  MPEG4 = 40  — legacy, replace recommended
  MPEG2 = 20  — very old, avoid

⚠ AV1 warning is shown on Scout Queue and Library
  when your client profile lacks hardware AV1 decode.`;

// ── Field component ────────────────────────────────────────────────────

function Field({
  label, name, value, onChange, type = 'text', placeholder = '', disabled = false, hint = '',
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>{label}</label>
      <input
        type={type} name={name} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none disabled:opacity-50"
        style={{
          background: 'var(--c-bg)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
      />
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>{hint}</p>}
    </div>
  );
}

// ── Tooltip wrapper ────────────────────────────────────────────────────

function InfoTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center"
        style={{ color: 'var(--c-muted)' }}
      >
        <Info size={14} />
      </button>
      {open && (
        <div
          className="absolute left-6 top-0 z-50 text-xs font-mono whitespace-pre rounded-lg p-3 shadow-xl"
          style={{
            background: '#1e1e2e',
            border: '1px solid var(--c-border)',
            color: 'var(--c-muted)',
            width: '320px',
            lineHeight: '1.6',
          }}
          onClick={() => setOpen(false)}
        >
          {content}
        </div>
      )}
    </span>
  );
}

// ── Main Settings page ─────────────────────────────────────────────────

export function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [clientProfile, setClientProfile] = useState('android_tv');
  const [saved, setSaved] = useState(false);
  const [showScanPrompt, setShowScanPrompt] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setForm({
        jellyfinUrl: data.settings.jellyfinUrl ?? '',
        jellyfinApiKey: '',           // always blank — user types a new key to replace
        jellyfinApiKeyMasked: data.settings.jellyfinApiKey ?? '',  // shows ****xxxx from server
        libraryPath: data.settings.libraryPath ?? '',
        llmProvider: data.settings.llmProvider ?? '',
        llmApiKey: '',
        llmApiKeyMasked: data.settings.llmApiKey ?? '',
        scoutMinCritic:    data.settings.scoutMinCritic    ?? '65',
        scoutMinCommunity: data.settings.scoutMinCommunity ?? '7.0',
        scoutMaxResolution: data.settings.scoutMaxResolution ?? '1080p',
      });
      const savedProfile = data.settings.clientProfile ?? 'android_tv';
      setClientProfile(savedProfile);
      try { localStorage.setItem('clientProfile', savedProfile); } catch { /* */ }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        // Skip the masked display-only fields — they're never saved back
        if (k.endsWith('Masked')) continue;
        if (v !== '') payload[k] = v;
      }
      return api.saveSettings(payload);
    },
    onSuccess: (_result, variables) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Prompt for scan if library path was newly set or changed
      const prevPath = data?.settings.libraryPath ?? '';
      const newPath = variables.libraryPath ?? '';
      if (newPath && newPath !== prevPath) setShowScanPrompt(true);
    },
  });

  const { data: healthData, refetch: checkHealth, isFetching: checkingHealth } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    enabled: false,
  });

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    saveMutation.mutate({ ...form, clientProfile });
    try { localStorage.setItem('clientProfile', clientProfile); } catch { /* */ }
  }

  const activeProfile = CLIENT_PROFILES.find(p => p.id === clientProfile) ?? CLIENT_PROFILES[0];

  if (isLoading) return <div className="p-8" style={{ color: 'var(--c-muted)' }}>Loading settings…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
        <Settings2 size={20} style={{ color: 'var(--c-accent)' }} />
        Settings
      </h1>

      {/* Jellyfin */}
      <section className="rounded-xl p-5 space-y-4 border"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>Jellyfin Connection</h2>
        <Field label="Jellyfin URL" name="jellyfinUrl" value={form.jellyfinUrl ?? ''}
          onChange={v => set('jellyfinUrl', v)} placeholder="http://localhost:3278"
          hint="Also read from JELLYFIN_URL env var" />
        <Field label="API Key" name="jellyfinApiKey" value={form.jellyfinApiKey ?? ''}
          onChange={v => set('jellyfinApiKey', v)} type="password"
          placeholder="Leave blank to keep existing key"
          hint={form.jellyfinApiKeyMasked
            ? `Currently set: ${form.jellyfinApiKeyMasked} — leave blank to keep, or type a new key`
            : 'Jellyfin Dashboard → API Keys — paste new key to update'} />
        <div className="flex items-center gap-3">
          <button onClick={() => checkHealth()} disabled={checkingHealth}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}>
            {checkingHealth ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
          {healthData && (
            healthData.jellyfin.ok ? (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle size={14} /> Connected — {healthData.jellyfin.libraries} libraries
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {healthData.jellyfin.error}
              </span>
            )
          )}
        </div>
      </section>

      {/* Library */}
      <section className="rounded-xl p-5 space-y-4 border"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>Library</h2>
        <Field label="Library Path" name="libraryPath" value={form.libraryPath ?? ''}
          onChange={v => set('libraryPath', v)} placeholder="/media/Movies"
          hint="Default path used by the Scan command. Seeded from defaults on first start." />
      </section>

      {/* Client Profile */}
      <section className="rounded-xl p-5 space-y-4 border"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          <Tv2 size={16} style={{ color: 'var(--c-accent)' }} />
          Primary Playback Client
        </h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Drives AV1 compatibility warnings, DV profile badges, and codec scoring in Scout Queue and Library.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {CLIENT_PROFILES.map(p => (
            <label
              key={p.id}
              className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors"
              style={{
                borderColor: clientProfile === p.id ? 'var(--c-accent)' : 'var(--c-border)',
                background: clientProfile === p.id ? 'rgba(124,58,237,0.1)' : 'var(--c-bg)',
              }}
            >
              <input
                type="radio"
                name="clientProfile"
                value={p.id}
                checked={clientProfile === p.id}
                onChange={() => setClientProfile(p.id)}
                className="mt-0.5 accent-violet-600"
              />
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{p.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>{p.hint}</div>
                <div className="text-xs mt-1 flex gap-3">
                  <span style={{ color: p.av1 === 'full' ? '#4ade80' : p.av1 === 'limited' ? '#fbbf24' : '#f87171' }}>
                    AV1: {p.av1}
                  </span>
                  <span style={{ color: 'var(--c-muted)' }}>DV: {p.dv}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Scout Defaults */}
      <section className="rounded-xl p-5 space-y-4 border"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          Scout Defaults
          <InfoTooltip content={CODEC_SCORING_TOOLTIP} />
        </h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          These defaults pre-fill the Scout Queue filters. Override per-session in Scout Queue.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min MC (Metacritic)" name="scoutMinCritic"
            value={form.scoutMinCritic ?? '65'}
            onChange={v => set('scoutMinCritic', v)}
            placeholder="65" />
          <Field label="Min IMDb" name="scoutMinCommunity"
            value={form.scoutMinCommunity ?? '7.0'}
            onChange={v => set('scoutMinCommunity', v)}
            placeholder="7.0" />
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>Max Resolution</label>
            <select
              value={form.scoutMaxResolution ?? '1080p'}
              onChange={e => set('scoutMaxResolution', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
        </div>

        {/* AV1 scoring tooltip callout */}
        <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>
            <strong>AV1 scoring note:</strong> AV1 files score highest (100) for compression efficiency,
            but your active client profile (<em>{activeProfile.label}</em>) has AV1 support:{' '}
            <strong>{activeProfile.av1}</strong>.{' '}
            {activeProfile.av1 === 'none'
              ? 'AV1 files will be flagged with a warning ⚠ in Scout Queue and Library.'
              : 'AV1 files will play without issues on this client.'}
          </span>
        </div>
      </section>

      {/* LLM */}
      <section className="rounded-xl p-5 space-y-4 border"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>LLM Provider</h2>
        <Field label="Provider" name="llmProvider" value={form.llmProvider ?? ''}
          onChange={v => set('llmProvider', v)} placeholder="openai / anthropic / ollama" />
        <Field label="API Key" name="llmApiKey" value={form.llmApiKey ?? ''}
          onChange={v => set('llmApiKey', v)} type="password"
          placeholder="Leave blank to keep existing key"
          hint={form.llmApiKeyMasked
            ? `Currently set: ${form.llmApiKeyMasked} — leave blank to keep, or type a new key`
            : ''} />
      </section>

      {/* Coming soon — Prowlarr */}
      <section className="rounded-xl p-5 space-y-4 border opacity-50 pointer-events-none"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>
          Prowlarr <span className="text-xs ml-2" style={{ color: 'var(--c-muted)' }}>coming soon</span>
        </h2>
        <Field label="Prowlarr URL" name="prowlarrUrl" value="" onChange={() => {}}
          placeholder="http://localhost:9696" disabled />
        <Field label="API Key" name="prowlarrApiKey" value="" onChange={() => {}}
          type="password" placeholder="—" disabled />
      </section>

      {/* Scan prompt — shown after library path is saved */}
      {showScanPrompt && (
        <div className="flex items-start gap-3 p-4 rounded-xl border"
          style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}>
          <ScanLine size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--c-accent)' }} />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
              Library path updated — start a scan?
            </div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              An initial scan reads every file with ffprobe to extract resolution, codec, HDR, audio, and size metadata.
              It runs in batches and may take a few minutes depending on library size.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowScanPrompt(false); navigate('/scan'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--c-accent)' }}>
                <ScanLine size={12} /> Go to Scan
              </button>
              <button
                onClick={() => setShowScanPrompt(false)}
                className="text-xs underline" style={{ color: 'var(--c-muted)' }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saveMutation.isPending}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--c-accent)' }}>
          {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <CheckCircle size={14} /> Saved
          </span>
        )}
        {saveMutation.isError && (
          <span className="text-sm text-red-400">Save failed</span>
        )}
      </div>
    </div>
  );
}
