#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'docs', 'api');
const outputDir = path.join(projectRoot, 'docs', 'site', 'docs', 'api');
const validateOnly = process.argv.includes('--validate-only');

function ensureFile(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${p}`);
  }
}

function validateSpec(specPath) {
  ensureFile(specPath);
  const raw = fs.readFileSync(specPath, 'utf8');
  const parsed = YAML.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAPI spec is not a valid object.');
  }
  if (typeof parsed.openapi !== 'string' || !parsed.openapi.startsWith('3.')) {
    throw new Error('`openapi` must be present and begin with "3.".');
  }
  if (!parsed.info || typeof parsed.info !== 'object') {
    throw new Error('`info` section is required.');
  }
  if (!parsed.info.title || !parsed.info.version) {
    throw new Error('`info.title` and `info.version` are required.');
  }
  if (!parsed.paths || typeof parsed.paths !== 'object' || Object.keys(parsed.paths).length === 0) {
    throw new Error('`paths` must contain at least one endpoint.');
  }
}

function buildDocs() {
  const specPath = path.join(sourceDir, 'openapi.yaml');
  const indexPath = path.join(sourceDir, 'index.html');
  validateSpec(specPath);
  ensureFile(indexPath);

  if (validateOnly) {
    console.log('OpenAPI spec validation passed.');
    return;
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  fs.copyFileSync(indexPath, path.join(outputDir, 'index.html'));
  fs.copyFileSync(specPath, path.join(outputDir, 'openapi.yaml'));

  console.log(`Built Curatarr API docs: ${path.relative(projectRoot, outputDir)}`);
}

try {
  buildDocs();
} catch (err) {
  console.error(`Failed to build API docs: ${err.message}`);
  process.exit(1);
}
