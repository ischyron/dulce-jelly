import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ScanLine, Settings2, X } from 'lucide-react';
import { type DragEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { LLM_RULESET_SAMPLES } from '../components/settings/content';
import { GeneralPanel } from '../components/settings/general/GeneralPanel';
import { ScoutPanel } from '../components/settings/scout/ScoutPanel';
import type {
  LibraryRootEntry,
  ScoutBlockerDraft,
  ScoutCustomCfDraft,
  ScoutLlmRuleDraft,
  SettingsForm,
} from '../components/settings/types';
import { normalizeRootPath, parseLibraryRoots, toLibraryRootsJson } from '../components/settings/utils/libraryRoots';
import { parseBlockerRule, parseCustomCfRule, parseLlmRule } from '../components/settings/utils/rules';
import { SETTINGS_DEFAULTS, type SettingsDefaultKey } from '../config/defaultSettings';

const GENERAL_SETTING_KEYS = new Set([
  'jellyfinUrl',
  'jellyfinPublicUrl',
  'jellyfinApiKey',
  'jfSyncIntervalMin',
  'jfSyncBatchSize',
]);

const SCOUT_SETTING_EXACT_KEYS = new Set([
  'prowlarrUrl',
  'prowlarrApiKey',
  'sabUrl',
  'sabApiKey',
  'llmProvider',
  'llmApiKey',
]);

export function Settings() {
  const { t } = useTranslation('settings');
  const { section } = useParams();
  const sectionMode: 'general' | 'scout' = section === 'scout' ? 'scout' : 'general';
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
  const [customCfDraft, setCustomCfDraft] = useState<ScoutCustomCfDraft[]>([]);
  const [llmRulesDraft, setLlmRulesDraft] = useState<ScoutLlmRuleDraft[]>([]);
  const [customCfSaved, setCustomCfSaved] = useState(false);
  const [customCfError, setCustomCfError] = useState('');
  const [blockersSaved, setBlockersSaved] = useState(false);
  const [blockersError, setBlockersError] = useState('');
  const [llmRulesSaved, setLlmRulesSaved] = useState(false);
  const [llmRulesError, setLlmRulesError] = useState('');
  const [llmDragIndex, setLlmDragIndex] = useState<number | null>(null);
  const [refineObjective, setRefineObjective] = useState('');
  const [customCfPreviewTitle, setCustomCfPreviewTitle] = useState('');
  const [blockerDraft, setBlockerDraft] = useState<ScoutBlockerDraft[]>([]);
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
      const withDefault = (key: SettingsDefaultKey): string => data.settings[key] ?? SETTINGS_DEFAULTS[key];
      setForm({
        jellyfinUrl: data.settings.jellyfinUrl ?? '',
        jellyfinPublicUrl: data.settings.jellyfinPublicUrl ?? '',
        jellyfinApiKey: '',
        jellyfinApiKeyMasked: data.settings.jellyfinApiKey ?? '',
        prowlarrUrl: data.settings.prowlarrUrl ?? '',
        prowlarrApiKey: '',
        prowlarrApiKeyMasked: data.settings.prowlarrApiKey ?? '',
        sabUrl: data.settings.sabUrl ?? '',
        sabApiKey: '',
        sabApiKeyMasked: data.settings.sabApiKey ?? '',
        libraryRoots: data.settings.libraryRoots ?? '',
        llmProvider: withDefault('llmProvider'),
        llmApiKey: '',
        llmApiKeyMasked: data.settings.llmApiKey ?? '',
        scoutPipelineMinCritic: withDefault('scoutPipelineMinCritic'),
        scoutPipelineMinImdb: withDefault('scoutPipelineMinImdb'),
        scoutPipelineBatchSize: withDefault('scoutPipelineBatchSize'),
        scoutPipelineAutoEnabled: withDefault('scoutPipelineAutoEnabled'),
        scoutPipelineAutoIntervalMin: withDefault('scoutPipelineAutoIntervalMin'),
        scoutPipelineAutoCooldownMin: withDefault('scoutPipelineAutoCooldownMin'),
        scoutPipelineBasicRes2160: withDefault('scoutPipelineBasicRes2160'),
        scoutPipelineBasicRes1080: withDefault('scoutPipelineBasicRes1080'),
        scoutPipelineBasicRes720: withDefault('scoutPipelineBasicRes720'),
        scoutPipelineBasicSourceRemux: withDefault('scoutPipelineBasicSourceRemux'),
        scoutPipelineBasicSourceBluray: withDefault('scoutPipelineBasicSourceBluray'),
        scoutPipelineBasicSourceWebdl: withDefault('scoutPipelineBasicSourceWebdl'),
        scoutPipelineBasicVideoHevc: withDefault('scoutPipelineBasicVideoHevc'),
        scoutPipelineBasicVideoAv1: withDefault('scoutPipelineBasicVideoAv1'),
        scoutPipelineBasicVideoH264: withDefault('scoutPipelineBasicVideoH264'),
        scoutPipelineBasicAudioAtmos: withDefault('scoutPipelineBasicAudioAtmos'),
        scoutPipelineBasicAudioTruehd: withDefault('scoutPipelineBasicAudioTruehd'),
        scoutPipelineBasicAudioDts: withDefault('scoutPipelineBasicAudioDts'),
        scoutPipelineBasicAudioDdp: withDefault('scoutPipelineBasicAudioDdp'),
        scoutPipelineBasicAudioAc3: withDefault('scoutPipelineBasicAudioAc3'),
        scoutPipelineBasicAudioAac: withDefault('scoutPipelineBasicAudioAac'),
        scoutPipelineBitrateTargetMbps: withDefault('scoutPipelineBitrateTargetMbps'),
        scoutPipelineBitrateTolerancePct: withDefault('scoutPipelineBitrateTolerancePct'),
        scoutPipelineBitrateMaxScore: withDefault('scoutPipelineBitrateMaxScore'),
        scoutPipelineBasicLegacyPenalty: withDefault('scoutPipelineBasicLegacyPenalty'),
        scoutPipelineBasicSeedersDivisor: withDefault('scoutPipelineBasicSeedersDivisor'),
        scoutPipelineBasicSeedersBonusCap: withDefault('scoutPipelineBasicSeedersBonusCap'),
        scoutPipelineBasicUsenetBonus: withDefault('scoutPipelineBasicUsenetBonus'),
        scoutPipelineBasicTorrentBonus: withDefault('scoutPipelineBasicTorrentBonus'),
        scoutPipelineBlockersEnabled: withDefault('scoutPipelineBlockersEnabled'),
        scoutPipelineLlmTieDelta: withDefault('scoutPipelineLlmTieDelta'),
        scoutPipelineLlmWeakDropDelta: withDefault('scoutPipelineLlmWeakDropDelta'),
        jfSyncIntervalMin: withDefault('jfSyncIntervalMin'),
        jfSyncBatchSize: withDefault('jfSyncBatchSize'),
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

  const saveMutation = useMutation({
    mutationFn: ({ settings, scope }: { settings: Record<string, string>; scope: 'general' | 'scout' }) => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (k.endsWith('Masked')) continue;
        if (v === '') continue;
        if (scope === 'general' && GENERAL_SETTING_KEYS.has(k)) {
          payload[k] = v;
        }
        if (scope === 'scout' && (k.startsWith('scout') || SCOUT_SETTING_EXACT_KEYS.has(k))) {
          payload[k] = v;
        }
      }
      if (scope === 'general') {
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
        payload.clientProfile = clientProfile;
      }
      if (scope === 'scout') {
        payload.llmProvider = 'openai';
      }
      return api.saveSettings(payload);
    },
    onSuccess: (_result, variables) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (variables.scope === 'general') {
        const prevRoots = data?.settings.libraryRoots ?? '';
        const newRoots = toLibraryRootsJson(
          movieRoots
            .map((p) => normalizeRootPath(p))
            .filter((p) => p.length > 0)
            .map((p) => ({ type: 'movies' as const, path: p })),
        );
        if (newRoots && newRoots !== prevRoots) setShowScanPrompt(true);
      }
    },
  });

  const { data: autoStatusData, refetch: refetchAutoStatus } = useQuery({
    queryKey: ['scout-auto-status'],
    queryFn: api.scoutAutoStatus,
    refetchInterval: 10_000,
  });
  const { data: scoutRulesData, refetch: refetchScoutRules } = useQuery({
    queryKey: ['scout-rules', 'all'],
    queryFn: () => api.scoutRules(),
    staleTime: 60_000,
  });
  const { data: trashSyncDetailsData, refetch: refetchTrashSyncDetails } = useQuery({
    queryKey: ['scout-trash-sync-details'],
    queryFn: api.scoutTrashSyncDetails,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      refetchTrashSyncDetails();
    },
  });
  const scoutRefineDraftMutation = useMutation({
    mutationFn: (objective: string) => api.scoutRulesRefineDraft({ objective }),
  });
  const saveCustomCfMutation = useMutation({
    mutationFn: (rules: ScoutCustomCfDraft[]) => {
      const payload = rules.map((r, idx) => ({
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
      return api.scoutReplaceRulesCategory('scout_custom_cf', payload);
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
  const saveBlockersMutation = useMutation({
    mutationFn: (rules: ScoutBlockerDraft[]) => {
      const payload = rules.map((r, idx) => ({
        category: 'scout_release_blockers',
        name: r.name.trim() || `Blocker ${idx + 1}`,
        enabled: r.enabled ? 1 : 0,
        priority: idx + 1,
        config: {
          matchType: r.matchType,
          pattern: r.pattern,
          flags: r.flags || 'i',
          appliesTo: r.appliesTo,
          reason: r.reason || 'Blocked by custom rule',
        },
      }));
      return api.scoutReplaceRulesCategory('scout_release_blockers', payload);
    },
    onSuccess: () => {
      setBlockersSaved(true);
      setBlockersError('');
      setTimeout(() => setBlockersSaved(false), 2500);
      refetchScoutRules();
    },
    onError: (err) => {
      setBlockersSaved(false);
      setBlockersError((err as Error).message);
    },
  });
  const saveLlmRulesMutation = useMutation({
    mutationFn: (rules: ScoutLlmRuleDraft[]) => {
      const payload = rules.map((r, idx) => ({
        category: 'scout_llm_ruleset',
        name: r.name.trim() || `LLM Rule ${idx + 1}`,
        enabled: r.enabled ? 1 : 0,
        priority: idx + 1,
        config: { sentence: r.sentence },
      }));
      return api.scoutReplaceRulesCategory('scout_llm_ruleset', payload);
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
  const syncedTrashModelVersion =
    syncDetails?.meta.modelVersion ?? data?.settings?.scoutTrashSyncModelVersion ?? 'unknown';
  const syncedTrashMappingRevision =
    syncDetails?.meta.mappingRevision ?? data?.settings?.scoutTrashMappingRevision ?? 'unknown';
  const syncedTrashAt = syncDetails?.meta.syncedAt ?? data?.settings?.scoutTrashSyncedAt ?? '';
  const syncedTrashRules =
    syncDetails?.meta.rulesSynced != null
      ? String(syncDetails.meta.rulesSynced)
      : (data?.settings?.scoutTrashSyncedRules ?? '');
  const syncedTrashWarning = syncDetails?.meta.warning ?? scoutSyncTrashMutation.data?.meta.warning ?? '';
  const hasTrashSyncDetails = Boolean(syncedTrashSource || syncedTrashRevision || syncedTrashAt || syncedTrashRules);
  const upstreamSnapshot = syncDetails?.upstream ?? null;

  useEffect(() => {
    const customMapped = (scoutRulesData?.rules?.scout_custom_cf ?? []).map(parseCustomCfRule);
    setCustomCfDraft(customMapped);
    const blockerMapped = (scoutRulesData?.rules?.scout_release_blockers ?? []).map(parseBlockerRule);
    setBlockerDraft(blockerMapped);
    const llmMapped = (scoutRulesData?.rules?.scout_llm_ruleset ?? [])
      .map(parseLlmRule)
      .sort((a, b) => a.priority - b.priority || (a.id ?? 0) - (b.id ?? 0));
    if (llmMapped.length > 0) {
      setLlmRulesDraft(llmMapped);
      return;
    }
    setLlmRulesDraft(
      LLM_RULESET_SAMPLES.map((sample, idx) => ({
        name: sample.name,
        sentence: sample.sentence,
        enabled: false,
        priority: idx + 1,
      })),
    );
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

  function handleSave(scope: 'general' | 'scout') {
    saveMutation.mutate({ settings: form, scope });
    try {
      localStorage.setItem('clientProfile', clientProfile);
    } catch {
      /* noop */
    }
  }

  function addCustomCfRule() {
    setCustomCfDraft((prev) => [
      ...(prev.length >= 1
        ? prev
        : [
            {
              name: 'Custom CF 1',
              enabled: true,
              priority: 1,
              matchType: 'regex' as const,
              pattern: '',
              score: '0',
              flags: 'i',
              appliesTo: 'title' as const,
            },
          ]),
    ]);
  }

  function updateCustomCfRule(index: number, patch: Partial<ScoutCustomCfDraft>) {
    setCustomCfDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeCustomCfRule(index: number) {
    setCustomCfDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlockerRule() {
    setBlockerDraft((prev) => [
      ...prev,
      {
        name: `Blocker ${prev.length + 1}`,
        enabled: true,
        priority: prev.length + 1,
        matchType: 'regex',
        pattern: '',
        flags: 'i',
        appliesTo: 'title',
        reason: 'Blocked by custom rule',
      },
    ]);
  }

  function updateBlockerRule(index: number, patch: Partial<ScoutBlockerDraft>) {
    setBlockerDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeBlockerRule(index: number) {
    setBlockerDraft((prev) => prev.filter((_, i) => i !== index));
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

  if (isLoading)
    return (
      <div className="p-8" style={{ color: 'var(--c-muted)' }}>
        Loading settings…
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Settings2}
        title={`${t('title')} › ${sectionMode === 'general' ? t('section.general') : t('section.scout')}`}
      />
      <div className="px-6 py-6 space-y-6 max-w-2xl">
        {sectionMode === 'general' ? (
          <section aria-label={t('section.general')}>
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
          </section>
        ) : (
          <section aria-label={t('section.scout')}>
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
                syncedTrashModelVersion,
                syncedTrashMappingRevision,
                syncedTrashAt,
                syncedTrashRules,
                syncedTrashWarning,
                upstreamSnapshot,
              }}
              customOverrides={{
                form,
                set,
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
                blockerDraft,
                updateBlockerRule,
                removeBlockerRule,
                addBlockerRule,
                saveBlockers: () => saveBlockersMutation.mutate(blockerDraft),
                blockersSavePending: saveBlockersMutation.isPending,
                blockersSaved,
                blockersError,
              }}
              extendedLlmRuleset={{
                form,
                set,
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
          </section>
        )}

        {showScanPrompt && (
          <div
            className="flex items-start gap-3 p-4 rounded-xl border"
            style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}
          >
            <ScanLine size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--c-accent)' }} />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                {t('scanPrompt.title')}
              </div>
              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                {t('scanPrompt.body')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowScanPrompt(false);
                    navigate('/scan');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--c-accent)' }}
                >
                  <ScanLine size={12} /> {t('scanPrompt.goToScan')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowScanPrompt(false)}
                  className="text-xs underline"
                  style={{ color: 'var(--c-muted)' }}
                >
                  {t('scanPrompt.dismiss')}
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
                    {t('browseModal.title')}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    {browseRestricted ? t('browseModal.restricted') : t('browseModal.local')}
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
                {t('browseModal.mode')}: <span style={{ color: 'var(--c-text)' }}>{browseMode}</span>
                {' · '}
                {t('browseModal.current')}: <span style={{ color: '#c4b5fd' }}>{browsePath}</span>
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
                    {t('browseModal.parent')}
                  </button>
                )}
              </div>

              <div className="rounded border overflow-auto max-h-72" style={{ borderColor: 'var(--c-border)' }}>
                {browseError ? (
                  <div className="p-3 text-sm text-red-400">{browseError}</div>
                ) : browseEntries.length === 0 ? (
                  <div className="p-3 text-sm" style={{ color: 'var(--c-muted)' }}>
                    {t('browseModal.empty')}
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
                  {t('browseModal.cancel')}
                </button>
                <button
                  type="button"
                  onClick={applyBrowsedPath}
                  className="px-3 py-1.5 rounded text-sm text-white"
                  style={{ background: 'var(--c-accent)' }}
                >
                  {t('browseModal.useFolder')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSave(sectionMode)}
            disabled={saveMutation.isPending}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--c-accent)' }}
          >
            {saveMutation.isPending ? t('save.saving') : t('save.label')}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <CheckCircle size={14} /> {t('save.saved')}
            </span>
          )}
          {saveMutation.isError && <span className="text-sm text-red-400">{t('save.failed')}</span>}
        </div>
      </div>
    </div>
  );
}
