import { strict as assert } from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from '../dist/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, '..');

// Basic config load test (no Radarr/OpenAI calls)
const config = loadConfig(baseDir);
assert.ok(config.batchSize > 0, 'batchSize should be positive');
assert.ok(config.radarr.url, 'radarr.url is required');
console.log('config load ok', { batchSize: config.batchSize, autoProfile: config.autoAssignProfile });
