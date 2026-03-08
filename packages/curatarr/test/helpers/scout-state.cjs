// @ts-check

/**
 * Capture + restore mutable scout state so tests stay order-independent.
 * This is intentionally narrow to scout settings/rules mutated in e2e specs.
 */

/**
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function snapshotScoutState(request) {
  const settingsRes = await request.get('/api/settings');
  if (!settingsRes.ok()) throw new Error('failed_to_snapshot_settings');
  const settings = (await settingsRes.json())?.settings ?? {};

  const rulesRes = await request.get('/api/scout/rules');
  if (!rulesRes.ok()) throw new Error('failed_to_snapshot_scout_rules');
  const grouped = (await rulesRes.json())?.rules ?? {};

  return {
    settings: {
      scoutPipelineBlockersEnabled: settings.scoutPipelineBlockersEnabled ?? 'false',
      scoutPipelineBasicRes1080: settings.scoutPipelineBasicRes1080 ?? '24',
    },
    rules: {
      scout_custom_cf: Array.isArray(grouped.scout_custom_cf) ? grouped.scout_custom_cf : [],
      scout_release_blockers: Array.isArray(grouped.scout_release_blockers) ? grouped.scout_release_blockers : [],
      scout_llm_ruleset: Array.isArray(grouped.scout_llm_ruleset) ? grouped.scout_llm_ruleset : [],
    },
  };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {Awaited<ReturnType<typeof snapshotScoutState>>} snapshot
 */
async function restoreScoutState(request, snapshot) {
  const saveSettings = await request.put('/api/settings', {
    data: {
      scoutPipelineBlockersEnabled: snapshot.settings.scoutPipelineBlockersEnabled,
      scoutPipelineBasicRes1080: snapshot.settings.scoutPipelineBasicRes1080,
    },
  });
  if (!saveSettings.ok()) throw new Error('failed_to_restore_settings');

  for (const category of ['scout_custom_cf', 'scout_release_blockers', 'scout_llm_ruleset']) {
    const src = snapshot.rules[category] ?? [];
    const payload = src.map((row) => ({
      name: row.name,
      enabled: row.enabled !== 0,
      priority: Number(row.priority ?? 0),
      config: row.config ?? {},
    }));
    const res = await request.put('/api/scout/rules/replace-category', {
      data: { category, rules: payload },
    });
    if (!res.ok()) throw new Error(`failed_to_restore_${category}`);
  }
}

module.exports = {
  snapshotScoutState,
  restoreScoutState,
};
