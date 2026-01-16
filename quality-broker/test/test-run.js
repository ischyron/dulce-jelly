import { strict as assert } from 'assert';
import path from 'path';
import { loadConfig } from '../src/config.js';
const baseDir = path.resolve(new URL('..', import.meta.url).pathname);
// Basic config load test (no Radarr/OpenAI calls)
const config = loadConfig(baseDir);
assert.ok(config.batchSize > 0, 'batchSize should be positive');
assert.ok(config.radarr.url, 'radarr.url is required');
console.log('config load ok', { batchSize: config.batchSize, autoProfile: config.autoAssignProfile });
