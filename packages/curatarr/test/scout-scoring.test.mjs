import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScoutRuleConfig } from '../src/server/dist/server/routes/scout/rulesDomain.js';
import { applyBlockerRules, applyCustomCfRules } from '../src/server/dist/server/routes/scout/scoring.js';

function mockRelease(overrides = {}) {
  return {
    title: 'Example.Movie.2026.1080p.WEB-DL.x265',
    indexer: 'IndexerA',
    protocol: 'torrent',
    size: 10_000_000_000,
    publishDate: '2026-03-08T00:00:00Z',
    guid: 'guid-001',
    downloadUrl: 'https://example.invalid/download/001',
    seeders: 100,
    peers: 200,
    ...overrides,
  };
}

test('custom CF appliesTo=full can match metadata outside title; appliesTo=title cannot', () => {
  const release = mockRelease({ indexer: 'TrustedIndexer', title: 'Example.Movie.2026.1080p.WEB-DL.x265' });

  const titleOnly = applyCustomCfRules(release, [
    {
      id: 1,
      name: 'Trusted indexer',
      pattern: 'trustedindexer',
      score: 12,
      matchType: 'string',
      flags: 'i',
      appliesTo: 'title',
    },
  ]);
  assert.equal(titleOnly.delta, 0);

  const full = applyCustomCfRules(release, [
    {
      id: 2,
      name: 'Trusted indexer',
      pattern: 'trustedindexer',
      score: 12,
      matchType: 'string',
      flags: 'i',
      appliesTo: 'full',
    },
  ]);
  assert.equal(full.delta, 12);
  assert.deepEqual(full.matchedRuleIds, [2]);
});

test('blocker regex flags are honored (multiline anchors only match with m flag)', () => {
  const releases = [
    {
      ...mockRelease({ indexer: 'CAM' }),
      score: 42,
      reasons: ['basic:resolution:1080p'],
    },
  ];

  const withoutMultiline = applyBlockerRules(releases, [
    {
      id: 1,
      name: 'No CAM',
      enabled: true,
      priority: 1,
      matchType: 'regex',
      pattern: '^CAM$',
      flags: '',
      appliesTo: 'full',
      reason: 'CAM releases are blocked',
    },
  ]);
  assert.equal(withoutMultiline.finals.length, 1);
  assert.equal(withoutMultiline.dropped.length, 0);

  const withMultiline = applyBlockerRules(releases, [
    {
      id: 2,
      name: 'No CAM',
      enabled: true,
      priority: 1,
      matchType: 'regex',
      pattern: '^CAM$',
      flags: 'm',
      appliesTo: 'full',
      reason: 'CAM releases are blocked',
    },
  ]);
  assert.equal(withMultiline.finals.length, 0);
  assert.equal(withMultiline.dropped.length, 1);
  assert.match(withMultiline.dropped[0].droppedReason, /CAM releases are blocked/);
});

test('rule config validation accepts normalized regex flags and rejects invalid appliesTo', () => {
  const blockerValid = validateScoutRuleConfig('scout_release_blockers', {
    matchType: 'regex',
    pattern: '^cam$',
    flags: 'miZZ',
    appliesTo: 'full',
    reason: 'block cam',
  });
  assert.equal(blockerValid, null);

  const customInvalidScope = validateScoutRuleConfig('scout_custom_cf', {
    matchType: 'string',
    pattern: 'trusted',
    score: 10,
    appliesTo: 'metadata',
  });
  assert.match(String(customInvalidScope), /appliesTo must be title\|full/);
});
