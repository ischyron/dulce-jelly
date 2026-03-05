import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle, Link2, ScanLine, Settings2, X } from 'lucide-react';
import { type DragEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  BITRATE_BIAS_PROFILES,
  BITRATE_KEYS,
  type BitrateProfileId,
  CLIENT_PROFILES,
  LLM_RULESET_SAMPLES,
} from '../components/settings/content';
import { GeneralPanel } from '../components/settings/general/GeneralPanel';
import { ScoutPanel } from '../components/settings/scout/ScoutPanel';
import { Accordion } from '../components/settings/shared/Accordion';
import type {
  LibraryRootEntry,
  ScoutCustomCfDraft,
  ScoutLlmRuleDraft,
  ScoutRuleDraft,
  SettingsForm,
} from '../components/settings/types';
import { normalizeRootPath, parseLibraryRoots, toLibraryRootsJson } from '../components/settings/utils/libraryRoots';
import { parseCustomCfRule, parseLlmRule } from '../components/settings/utils/rules';
import { detectBitrateProfileFromSettings } from '../components/settings/utils/scoring';

export function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
  });

  const [form, setForm] = useState<SettingsForm>({});
  const [clientProfile, setClientProfile] = useState('android_tv');
  const [saved, setSaved] = useState(false);
  const [showScanPrompt, setShowScanPrompt] = useState(false);
  const [scoutRulesDraft, setScoutRulesDraft] = useState<ScoutRuleDraft[]>([]);
  const [customCfDraft, setCustomCfDraft] = useState<ScoutCustomCfDraft[]>([]);
  const [llmRulesDraft, setLlmRulesDraft] = useState<ScoutLlmRuleDraft[]>([]);
  const [scoutRulesSaved, setScoutRulesSaved] = useState(false);
  const [scoutRulesError, setScoutRulesError] = useState('');
  const [customCfSaved, setCustomCfSaved] = useState(false);
  const [customCfError, setCustomCfError] = useState('');
  const [llmRulesSaved, setLlmRulesSaved] = useState(false);
  const [llmRulesError, setLlmRulesError] = useState('');
  const [llmDragIndex, setLlmDragIndex] = useState<number | null>(null);
  const [refineObjective, setRefineObjective] = useState('');
  const [customCfPreviewTitle, setCustomCfPreviewTitle] = useState('');
  const [bitrateProfileId, setBitrateProfileId] = useState<BitrateProfileId>('webdl');
  const [movieRoots, setMovieRoots] = useState<string[]>(['']);
  const [seriesRoots] = useState<string[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseForIndex, setBrowseForIndex] = useState<number | null>(null);
  const [browseRoots, setBrowseRoots] = useState<string[]>([]);
  const [browsePath, setBrowsePath] = useState<string>('/');
  const [browseEntries, setBrowseEntries] = useState<Array<{ name: string; path: string }>>([]);
  const [browseParentPath, setBrowseParentPath] = useState<string | null>(null);
  const [browseRestricted, setBrowseRestricted] = useState(false);
  const [browseMode, setBrowseMode] = useState<'docker-mounted' | 'local-full'>('local-full');
  const [browseError, setBrowseError] = useState('');

  useEffect(() => {
    if (data?.settings) {
      setForm({
        jellyfinUrl: data.settings.jellyfinUrl ?? '',
        jellyfinPublicUrl: data.settings.jellyfinPublicUrl ?? '',
        jellyfinApiKey: '',
        jellyfinApiKeyMasked: data.settings.jellyfinApiKey ?? '',
        prowlarrUrl: data.settings.prowlarrUrl ?? '',
        prowlarrApiKey: '',
        prowlarrApiKeyMasked: data.settings.prowlarrApiKey ?? '',
        libraryRoots: data.settings.libraryRoots ?? '',
        llmProvider: 'openai',
        llmApiKey: '',
        llmApiKeyMasked: data.settings.llmApiKey ?? '',
        scoutMinCritic: data.settings.scoutMinCritic ?? '65',
        scoutMinCommunity: data.settings.scoutMinCommunity ?? '7.0',
        scoutSearchBatchSize: data.settings.scoutSearchBatchSize ?? '5',
        scoutAutoEnabled: data.settings.scoutAutoEnabled ?? 'false',
        scoutAutoIntervalMin: data.settings.scoutAutoIntervalMin ?? '60',
        scoutAutoCooldownMin: data.settings.scoutAutoCooldownMin ?? '240',
        scoutCfRes2160: data.settings.scoutCfRes2160 ?? '40',
        scoutCfRes1080: data.settings.scoutCfRes1080 ?? '25',
        scoutCfRes720: data.settings.scoutCfRes720 ?? '10',
        scoutCfSourceRemux: data.settings.scoutCfSourceRemux ?? '28',
        scoutCfSourceBluray: data.settings.scoutCfSourceBluray ?? '16',
        scoutCfSourceWebdl: data.settings.scoutCfSourceWebdl ?? '12',
        scoutCfCodecHevc: data.settings.scoutCfCodecHevc ?? '20',
        scoutCfCodecAv1: data.settings.scoutCfCodecAv1 ?? '16',
        scoutCfCodecH264: data.settings.scoutCfCodecH264 ?? '8',
        scoutCfLegacyPenalty: data.settings.scoutCfLegacyPenalty ?? '30',
        scoutCfBitrateMin2160Mbps: data.settings.scoutCfBitrateMin2160Mbps ?? '10',
        scoutCfBitrateMax2160Mbps: data.settings.scoutCfBitrateMax2160Mbps ?? '35',
        scoutCfBitrateMin1080Mbps: data.settings.scoutCfBitrateMin1080Mbps ?? '4',
        scoutCfBitrateMax1080Mbps: data.settings.scoutCfBitrateMax1080Mbps ?? '15',
        scoutCfBitrateMin720Mbps: data.settings.scoutCfBitrateMin720Mbps ?? '2.5',
        scoutCfBitrateMax720Mbps: data.settings.scoutCfBitrateMax720Mbps ?? '8',
        scoutCfBitrateMinOtherMbps: data.settings.scoutCfBitrateMinOtherMbps ?? '1',
        scoutCfBitrateMaxOtherMbps: data.settings.scoutCfBitrateMaxOtherMbps ?? '12',
        scoutCfSeedersDivisor: data.settings.scoutCfSeedersDivisor ?? '20',
        scoutCfSeedersBonusCap: data.settings.scoutCfSeedersBonusCap ?? '12',
        scoutCfUsenetBonus: data.settings.scoutCfUsenetBonus ?? '10',
        scoutCfTorrentBonus: data.settings.scoutCfTorrentBonus ?? '0',
        jfSyncIntervalMin: data.settings.jfSyncIntervalMin ?? '30',
        jfSyncBatchSize: data.settings.jfSyncBatchSize ?? '10',
      });

      const parsedRoots = parseLibraryRoots(data.settings.libraryRoots);
      const fallbackPath = data.settings.libraryPath ?? '';
      const movie = parsedRoots.filter((r) => r.type === 'movies').map((r) => r.path);
      if (movie.length > 0) {
        setMovieRoots(movie);
      } else if (fallbackPath) {
        setMovieRoots([fallbackPath]);
      } else {
        setMovieRoots(['']);
      }
      const savedProfile = data.settings.clientProfile ?? 'android_tv';
      setClientProfile(savedProfile);
      try {
        localStorage.setItem('clientProfile', savedProfile);
      } catch {
        /* noop */
      }
    }
  }, [data]);

  useEffect(() => {
    const match = detectBitrateProfileFromSettings(form);
    if (match) setBitrateProfileId(match);
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (k.endsWith('Masked')) continue;
        if (v !== '') payload[k] = v;
      }
      const rootsPayload: LibraryRootEntry[] = [
        ...movieRoots
          .map((p) => normalizeRootPath(p))
          .filter((p) => p.length > 0)
          .map((p) => ({ type: 'movies' as const, path: p })),
        ...seriesRoots
          .map((p) => normalizeRootPath(p))
          .filter((p) => p.length > 0)
          .map((p) => ({ type: 'series' as const, path: p })),
      ];
      payload.libraryRoots = toLibraryRootsJson(rootsPayload);
      delete payload.libraryPath;
      payload.llmProvider = 'openai';
      return api.saveSettings(payload);
    },
    onSuccess: (_result, variables) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      const prevRoots = data?.settings.libraryRoots ?? '';
      const newRoots = variables.libraryRoots ?? '';
      if (newRoots && newRoots !== prevRoots) setShowScanPrompt(true);
    },
  });

  const { data: autoStatusData, refetch: refetchAutoStatus } = useQuery({
    queryKey: ['scout-auto-status'],
    queryFn: api.scoutAutoStatus,
    refetchInterval: 10_000,
  });
  const { data: scoutRulesData, refetch: refetchScoutRules } = useQuery({
    queryKey: ['rules', 'all'],
    queryFn: () => api.rules(),
    staleTime: 60_000,
  });
  const { data: trashSyncDetailsData, refetch: refetchTrashSyncDetails } = useQuery({
    queryKey: ['scout-trash-sync-details'],
    queryFn: api.scoutTrashSyncDetails,
    staleTime: 60_000,
  });
  const { data: trashParityData, refetch: refetchTrashParity } = useQuery({
    queryKey: ['scout-trash-parity'],
    queryFn: () => api.scoutTrashParity(false),
    staleTime: 60_000,
  });

  const scoutAutoRunMutation = useMutation({
    mutationFn: () => api.scoutAutoRun(),
    onSuccess: () => {
      refetchAutoStatus();
    },
  });
  const scoutSyncTrashMutation = useMutation({
    mutationFn: () => api.scoutSyncTrashScores(),
    onSuccess: (res) => {
      setForm((prev) => ({ ...prev, ...res.applied }));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      refetchScoutRules();
      refetchTrashSyncDetails();
      refetchTrashParity();
    },
  });
  const scoutRefineDraftMutation = useMutation({
    mutationFn: (objective: string) => api.scoutRulesRefineDraft({ objective }),
  });
  const saveScoutRulesMutation = useMutation({
    mutationFn: (rules: ScoutRuleDraft[]) => {
      const payload = rules.map((r) => ({
        id: r.id,
        category: 'scout',
        name: r.name,
        enabled: r.enabled ? 1 : 0,
        priority: r.priority,
        config: JSON.parse(r.configText || '{}'),
      }));
      return api.saveRules(payload);
    },
    onSuccess: () => {
      setScoutRulesSaved(true);
      setScoutRulesError('');
      setTimeout(() => setScoutRulesSaved(false), 2500);
      refetchScoutRules();
    },
    onError: (err) => {
      setScoutRulesSaved(false);
      setScoutRulesError((err as Error).message);
    },
  });
  const saveCustomCfMutation = useMutation({
    mutationFn: (rules: ScoutCustomCfDraft[]) => {
      const payload = rules.map((r, idx) => ({
        id: r.id,
        category: 'scout_custom_cf',
        name: r.name.trim() || `Custom CF ${idx + 1}`,
        enabled: r.enabled ? 1 : 0,
        priority: idx + 1,
        config: {
          matchType: r.matchType,
          pattern: r.pattern,
          score: Number(r.score || 0),
          flags: r.flags || 'i',
          appliesTo: r.appliesTo,
        },
      }));
      return api.saveRules(payload);
    },
    onSuccess: () => {
      setCustomCfSaved(true);
      setCustomCfError('');
      setTimeout(() => setCustomCfSaved(false), 2500);
      refetchScoutRules();
    },
    onError: (err) => {
      setCustomCfSaved(false);
      setCustomCfError((err as Error).message);
    },
  });
  const saveLlmRulesMutation = useMutation({
    mutationFn: (rules: ScoutLlmRuleDraft[]) => {
      const payload = rules.map((r, idx) => ({
        id: r.id,
        category: 'scout_llm_ruleset',
        name: r.name.trim() || `LLM Rule ${idx + 1}`,
        enabled: r.enabled ? 1 : 0,
        priority: idx + 1,
        config: { sentence: r.sentence },
      }));
      return api.saveRules(payload);
    },
    onSuccess: () => {
      setLlmRulesSaved(true);
      setLlmRulesError('');
      setTimeout(() => setLlmRulesSaved(false), 2500);
      refetchScoutRules();
    },
    onError: (err) => {
      setLlmRulesSaved(false);
      setLlmRulesError((err as Error).message);
    },
  });
  const customCfPreviewMutation = useMutation({
    mutationFn: (title: string) => api.scoutCustomCfPreview({ title }),
  });

  const syncDetails = scoutSyncTrashMutation.data?.details ?? trashSyncDetailsData;
  const syncedTrashSource = syncDetails?.meta.source ?? data?.settings?.scoutTrashSyncSource ?? '';
  const syncedTrashRevision = syncDetails?.meta.revision ?? data?.settings?.scoutTrashSyncRevision ?? '';
  const syncedTrashAt = syncDetails?.meta.syncedAt ?? data?.settings?.scoutTrashSyncedAt ?? '';
  const syncedTrashRules =
    syncDetails?.meta.rulesSynced != null
      ? String(syncDetails.meta.rulesSynced)
      : (data?.settings?.scoutTrashSyncedRules ?? '');
  const syncedTrashWarning = syncDetails?.meta.warning ?? scoutSyncTrashMutation.data?.meta.warning ?? '';
  const hasTrashSyncDetails = Boolean(
    syncedTrashSource ||
      syncedTrashRevision ||
      syncedTrashAt ||
      syncedTrashRules ||
      (syncDetails?.applied.rules.length ?? 0) > 0 ||
      Object.keys(syncDetails?.applied.settings ?? {}).length > 0,
  );
  const appliedSettingsEntries = Object.entries(syncDetails?.applied.settings ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const appliedRules = syncDetails?.applied.rules ?? [];
  const upstreamSnapshot = syncDetails?.upstream ?? null;

  useEffect(() => {
    const rules = scoutRulesData?.rules?.scout ?? [];
    const mapped = rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled !== 0,
      priority: r.priority,
      configText: JSON.stringify(r.config, null, 2),
    }));
    setScoutRulesDraft(mapped);
    const customMapped = (scoutRulesData?.rules?.scout_custom_cf ?? []).map(parseCustomCfRule);
    setCustomCfDraft(customMapped);
    const llmMapped = (scoutRulesData?.rules?.scout_llm_ruleset ?? [])
      .map(parseLlmRule)
      .sort((a, b) => a.priority - b.priority || (a.id ?? 0) - (b.id ?? 0));
    setLlmRulesDraft(llmMapped);
  }, [scoutRulesData]);

  const [jellyfinHealth, setJellyfinHealth] = useState<{ ok: boolean; libraries?: number; error?: string } | null>(
    null,
  );
  const [checkingJellyfinHealth, setCheckingJellyfinHealth] = useState(false);
  const [prowlarrHealth, setProwlarrHealth] = useState<{ ok: boolean; indexers?: number; error?: string } | null>(null);
  const [checkingProwlarrHealth, setCheckingProwlarrHealth] = useState(false);

  async function checkJellyfinHealth() {
    setCheckingJellyfinHealth(true);
    setJellyfinHealth(null);
    try {
      const result = await api.health({ url: form.jellyfinUrl || undefined, apiKey: form.jellyfinApiKey || undefined });
      setJellyfinHealth(result.jellyfin);
    } catch (err) {
      setJellyfinHealth({ ok: false, error: (err as Error).message });
    } finally {
      setCheckingJellyfinHealth(false);
    }
  }

  async function checkProwlarrHealth() {
    setCheckingProwlarrHealth(true);
    setProwlarrHealth(null);
    try {
      const result = await api.health({
        prowlarrUrl: form.prowlarrUrl || undefined,
        prowlarrApiKey: form.prowlarrApiKey || undefined,
      });
      setProwlarrHealth(result.prowlarr);
    } catch (err) {
      setProwlarrHealth({ ok: false, error: (err as Error).message });
    } finally {
      setCheckingProwlarrHealth(false);
    }
  }

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function updateMovieRoot(index: number, value: string) {
    setMovieRoots((prev) => prev.map((row, i) => (i === index ? value : row)));
  }

  function addMovieRoot() {
    setMovieRoots((prev) => [...prev, '']);
  }

  function removeMovieRoot(index: number) {
    setMovieRoots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  }

  async function loadBrowse(pathValue?: string) {
    try {
      const rootsRes = await api.fsRoots();
      const target = pathValue || rootsRes.roots[0] || '/';
      const list = await api.fsBrowse({ path: target });
      setBrowseMode(list.mode);
      setBrowseRestricted(list.restricted);
      setBrowseRoots(list.roots);
      setBrowsePath(list.currentPath);
      setBrowseEntries(list.entries);
      setBrowseParentPath(list.parentPath);
      setBrowseError('');
    } catch (err) {
      setBrowseError((err as Error).message);
    }
  }

  async function openBrowse(index: number) {
    setBrowseForIndex(index);
    setBrowseOpen(true);
    await loadBrowse(normalizeRootPath(movieRoots[index]) || undefined);
  }

  function applyBrowsedPath() {
    if (browseForIndex == null) return;
    updateMovieRoot(browseForIndex, browsePath);
    setBrowseOpen(false);
    setBrowseForIndex(null);
  }

  function handleSave() {
    saveMutation.mutate({ ...form, clientProfile });
    try {
      localStorage.setItem('clientProfile', clientProfile);
    } catch {
      /* noop */
    }
  }

  function updateScoutRule(id: number, patch: Partial<ScoutRuleDraft>) {
    setScoutRulesDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addCustomCfRule() {
    setCustomCfDraft((prev) => [
      ...prev,
      {
        name: `Custom CF ${prev.length + 1}`,
        enabled: true,
        priority: prev.length + 1,
        matchType: 'regex',
        pattern: '',
        score: '0',
        flags: 'i',
        appliesTo: 'title',
      },
    ]);
  }

  function updateCustomCfRule(index: number, patch: Partial<ScoutCustomCfDraft>) {
    setCustomCfDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeCustomCfRule(index: number) {
    setCustomCfDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function addLlmRule() {
    setLlmRulesDraft((prev) => [
      ...prev,
      { name: `LLM Rule ${prev.length + 1}`, enabled: true, priority: prev.length + 1, sentence: '' },
    ]);
  }

  function addLlmSampleRules() {
    setLlmRulesDraft((prev) => {
      const seen = new Set(prev.map((r) => r.name.trim().toLowerCase()));
      const toAdd = LLM_RULESET_SAMPLES.filter((s) => !seen.has(s.name.trim().toLowerCase())).map((s, i) => ({
        name: s.name,
        enabled: false,
        priority: prev.length + i + 1,
        sentence: s.sentence,
      }));
      if (toAdd.length === 0) return prev;
      const next = [...prev, ...toAdd];
      return next.map((row, i) => ({ ...row, priority: i + 1 }));
    });
  }

  function updateLlmRule(index: number, patch: Partial<ScoutLlmRuleDraft>) {
    setLlmRulesDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function reorderLlmRules(from: number, to: number) {
    setLlmRulesDraft((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((row, i) => ({ ...row, priority: i + 1 }));
    });
  }

  function onLlmDragStart(index: number) {
    setLlmDragIndex(index);
  }

  function onLlmDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function onLlmDrop(targetIndex: number) {
    if (llmDragIndex === null) return;
    reorderLlmRules(llmDragIndex, targetIndex);
    setLlmDragIndex(null);
  }

  function onLlmDragEnd() {
    setLlmDragIndex(null);
  }

  function removeLlmRule(index: number) {
    setLlmRulesDraft((prev) => prev.filter((_, i) => i !== index).map((row, i) => ({ ...row, priority: i + 1 })));
  }

  function applyBitrateProfile(id: BitrateProfileId) {
    const profile = BITRATE_BIAS_PROFILES.find((p) => p.id === id);
    if (!profile) return;
    const v = profile.values;
    setForm((prev) => ({
      ...prev,
      [BITRATE_KEYS.min2160]: v.min2160,
      [BITRATE_KEYS.max2160]: v.max2160,
      [BITRATE_KEYS.min1080]: v.min1080,
      [BITRATE_KEYS.max1080]: v.max1080,
      [BITRATE_KEYS.min720]: v.min720,
      [BITRATE_KEYS.max720]: v.max720,
      [BITRATE_KEYS.minOther]: v.minOther,
      [BITRATE_KEYS.maxOther]: v.maxOther,
    }));
  }

  const selectedBitrateProfile =
    BITRATE_BIAS_PROFILES.find((p) => p.id === bitrateProfileId) ?? BITRATE_BIAS_PROFILES[0];
  const detectedBitrateProfile = detectBitrateProfileFromSettings(form);
  const activeProfile = CLIENT_PROFILES.find((p) => p.id === clientProfile) ?? CLIENT_PROFILES[0];

  if (isLoading)
    return (
      <div className="p-8" style={{ color: 'var(--c-muted)' }}>
        Loading settings…
      </div>
    );

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
        <Settings2 size={20} style={{ color: 'var(--c-accent)' }} />
        Settings
      </h1>

      <Accordion title="General" defaultOpen variant="general" icon={<Link2 size={15} />}>
        <GeneralPanel
          form={form}
          set={set}
          checkJellyfinHealth={checkJellyfinHealth}
          checkingJellyfinHealth={checkingJellyfinHealth}
          jellyfinHealth={jellyfinHealth}
          movieRoots={movieRoots}
          updateMovieRoot={updateMovieRoot}
          openBrowse={openBrowse}
          removeMovieRoot={removeMovieRoot}
          addMovieRoot={addMovieRoot}
          clientProfile={clientProfile}
          setClientProfile={setClientProfile}
        />
      </Accordion>

      <Accordion title="Scout" defaultOpen variant="scout" icon={<Bot size={15} />}>
        <ScoutPanel
          prowlarr={{
            form,
            set,
            checkProwlarrHealth,
            checkingProwlarrHealth,
            prowlarrHealth,
          }}
          llmProvider={{ form, set }}
          minimumQualifiers={{ form, set }}
          cfScoring={{
            form,
            set,
            activeProfileLabel: activeProfile.label,
            activeProfileAv1: activeProfile.videoCodec.av1,
            bitrateProfileId,
            setBitrateProfileId,
            applyBitrateProfile,
            selectedBitrateProfile,
            detectedBitrateProfile,
          }}
          trashSyncDetails={{
            onSyncTrash: () => scoutSyncTrashMutation.mutate(),
            syncingTrash: scoutSyncTrashMutation.isPending,
            syncTrashError: scoutSyncTrashMutation.isError
              ? (scoutSyncTrashMutation.error as Error).message
              : undefined,
            hasTrashSyncDetails,
            syncedTrashSource,
            syncedTrashRevision,
            syncedTrashAt,
            syncedTrashRules,
            syncedTrashWarning,
            appliedSettingsEntries,
            appliedRules,
            upstreamSnapshot,
          }}
          trashBaseline={{
            trashParityData,
            onRefreshBaseline: () => {
              void refetchTrashParity();
              void api.scoutTrashParity(true).then(() => refetchTrashParity());
            },
          }}
          customOverrides={{
            customCfDraft,
            updateCustomCfRule,
            removeCustomCfRule,
            addCustomCfRule,
            saveCustomCf: () => saveCustomCfMutation.mutate(customCfDraft),
            savePending: saveCustomCfMutation.isPending,
            customCfSaved,
            customCfError,
            customCfPreviewTitle,
            setCustomCfPreviewTitle,
            runCustomCfPreview: () => customCfPreviewMutation.mutate(customCfPreviewTitle),
            customCfPreviewPending: customCfPreviewMutation.isPending,
            customCfPreviewData: customCfPreviewMutation.data,
          }}
          rules={{
            scoutRulesDraft,
            updateScoutRule,
            saveScoutRules: () => saveScoutRulesMutation.mutate(scoutRulesDraft),
            savePending: saveScoutRulesMutation.isPending,
            scoutRulesSaved,
            scoutRulesError,
          }}
          extendedLlmRuleset={{
            llmRulesDraft,
            llmDragIndex,
            onLlmDragStart,
            onLlmDragOver,
            onLlmDrop,
            onLlmDragEnd,
            updateLlmRule,
            removeLlmRule,
            addLlmRule,
            addLlmSampleRules,
            saveLlmRules: () => saveLlmRulesMutation.mutate(llmRulesDraft),
            savePending: saveLlmRulesMutation.isPending,
            llmRulesSaved,
            llmRulesError,
            refineObjective,
            setRefineObjective,
            generateDraft: () => scoutRefineDraftMutation.mutate(refineObjective),
            draftPending: scoutRefineDraftMutation.isPending,
            draftData: scoutRefineDraftMutation.data,
          }}
          automation={{
            form,
            set,
            autoStatusData,
            runAutoScout: () => scoutAutoRunMutation.mutate(),
            runPending: scoutAutoRunMutation.isPending,
          }}
        />
      </Accordion>

      {showScanPrompt && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border"
          style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}
        >
          <ScanLine size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--c-accent)' }} />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
              Library root folders updated — start a scan?
            </div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              An initial scan reads every file with ffprobe to extract resolution, codec, HDR, audio, and size metadata.
              It runs in batches and may take a few minutes depending on library size.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowScanPrompt(false);
                  navigate('/scan');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--c-accent)' }}
              >
                <ScanLine size={12} /> Go to Scan
              </button>
              <button
                onClick={() => setShowScanPrompt(false)}
                className="text-xs underline"
                style={{ color: 'var(--c-muted)' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {browseOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            className="w-full max-w-2xl rounded-xl border p-4 space-y-3"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold" style={{ color: '#d4cfff' }}>
                  Browse Folder
                </div>
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {browseRestricted
                    ? 'Browsing limited to mounted volumes in Docker mode.'
                    : 'Local mode: full-disk browsing enabled.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBrowseOpen(false);
                  setBrowseForIndex(null);
                }}
                className="p-2 rounded-lg"
                style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Mode: <span style={{ color: 'var(--c-text)' }}>{browseMode}</span>
              {' · '}Current: <span style={{ color: '#c4b5fd' }}>{browsePath}</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {browseRoots.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    void loadBrowse(r);
                  }}
                  className="px-2 py-1 rounded text-xs"
                  style={{ border: '1px solid var(--c-border)', color: '#c4b5fd' }}
                >
                  {r}
                </button>
              ))}
              {browseParentPath && (
                <button
                  type="button"
                  onClick={() => {
                    void loadBrowse(browseParentPath);
                  }}
                  className="px-2 py-1 rounded text-xs"
                  style={{ border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                >
                  Parent
                </button>
              )}
            </div>

            <div className="rounded border overflow-auto max-h-72" style={{ borderColor: 'var(--c-border)' }}>
              {browseError ? (
                <div className="p-3 text-sm text-red-400">{browseError}</div>
              ) : browseEntries.length === 0 ? (
                <div className="p-3 text-sm" style={{ color: 'var(--c-muted)' }}>
                  No subfolders found.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
                  {browseEntries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => {
                        void loadBrowse(entry.path);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                      style={{ color: 'var(--c-text)' }}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBrowseOpen(false);
                  setBrowseForIndex(null);
                }}
                className="px-3 py-1.5 rounded text-sm"
                style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBrowsedPath}
                className="px-3 py-1.5 rounded text-sm text-white"
                style={{ background: 'var(--c-accent)' }}
              >
                Use This Folder
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--c-accent)' }}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <CheckCircle size={14} /> Saved
          </span>
        )}
        {saveMutation.isError && <span className="text-sm text-red-400">Save failed</span>}
      </div>
    </div>
  );
}
