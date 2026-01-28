/**
 * Monitor command
 * Check library health and service connectivity
 */

import { Command } from 'commander';

import { loadConfig } from '../shared/config.js';
import type { DashboardState, IssueSeverity, LibraryIssue, HealthStatus } from '../shared/types.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function severityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'error': return colors.red;
    case 'warning': return colors.yellow;
    case 'info': return colors.green;
  }
}

function severityIcon(severity: IssueSeverity): string {
  switch (severity) {
    case 'error': return '✗';
    case 'warning': return '⚠';
    case 'info': return '✓';
  }
}

function formatIssue(issue: LibraryIssue): string {
  const color = severityColor(issue.severity);
  const icon = severityIcon(issue.severity);
  return `${color}${icon} [${issue.type}]${colors.reset} ${issue.title}\n  ${colors.dim}${issue.path}${colors.reset}\n  ${issue.details}`;
}

function formatHealth(health: HealthStatus): string {
  const color = severityColor(health.status === 'healthy' ? 'info' : health.status === 'degraded' ? 'warning' : 'error');
  const icon = severityIcon(health.status === 'healthy' ? 'info' : health.status === 'degraded' ? 'warning' : 'error');
  const latency = health.latencyMs ? ` (${health.latencyMs}ms)` : '';
  const error = health.error ? `\n  ${colors.dim}${health.error}${colors.reset}` : '';
  return `${color}${icon} ${health.service}${colors.reset}${latency}${error}`;
}

export function monitorCommand(baseDir: string): Command {
  const cmd = new Command('monitor')
    .description('Monitor library health and service connectivity');

  // Main monitor command - runs both library and health checks
  cmd
    .command('run')
    .description('Run full monitoring check (library + health)')
    .option('--batch-size <n>', 'Jellyfin API batch size', '100')
    .option('--check-duplicates', 'Check for multiple video files in folders')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const config = loadConfig(baseDir);

        console.log(`${colors.bold}Curatarr Monitor${colors.reset}\n`);

        // TODO: Implement actual monitoring
        // For now, show placeholder dashboard
        const dashboard: DashboardState = {
          library: {
            info: [],
            warning: [],
            error: [],
            lastScan: null,
            totalItems: 0,
          },
          health: {
            overall: 'info',
            services: [],
            lastCheck: null,
          },
        };

        console.log(`${colors.bold}=== Health Check ===${colors.reset}\n`);
        console.log(`Jellyfin: ${config.jellyfin.url || '(not configured)'}`);
        console.log(`Indexer: ${config.indexer.url}`);
        console.log(`SABnzbd: ${config.sabnzbd.url}`);
        console.log(`TMDB: https://api.themoviedb.org`);
        console.log(`LLM: ${config.llm.provider}`);

        console.log('\n[Not implemented yet] Health check module pending');
        console.log('Will check connectivity to all services with timeout/retry\n');

        console.log(`${colors.bold}=== Library Check ===${colors.reset}\n`);
        console.log(`Batch size: ${opts.batchSize}`);
        console.log(`Check duplicates: ${opts.checkDuplicates ? 'yes' : 'no'}`);

        console.log('\n[Not implemented yet] Library monitor pending');
        console.log('Will:');
        console.log('  1. Fetch all items from Jellyfin (batched)');
        console.log('  2. Verify each path exists on filesystem');
        console.log('  3. Flag missing files/folders');
        if (opts.checkDuplicates) {
          console.log('  4. Check for multiple video files per folder');
        }

        if (opts.json) {
          console.log('\nJSON output:');
          console.log(JSON.stringify(dashboard, null, 2));
        }

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  // Health check only
  cmd
    .command('health')
    .description('Check service connectivity')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const config = loadConfig(baseDir);

        console.log(`${colors.bold}Service Health${colors.reset}\n`);

        // TODO: Implement actual health checks
        const services: HealthStatus[] = [
          { service: 'jellyfin', status: 'healthy', lastCheck: new Date().toISOString(), latencyMs: 45 },
          { service: 'indexer', status: 'healthy', lastCheck: new Date().toISOString(), latencyMs: 120 },
          { service: 'sabnzbd', status: 'healthy', lastCheck: new Date().toISOString(), latencyMs: 32 },
          { service: 'tmdb', status: 'healthy', lastCheck: new Date().toISOString(), latencyMs: 89 },
          { service: 'llm', status: 'healthy', lastCheck: new Date().toISOString(), latencyMs: 250 },
        ];

        console.log('[Not implemented yet] Using placeholder data\n');

        for (const health of services) {
          console.log(formatHealth(health));
        }

        const hasError = services.some(s => s.status === 'unreachable');
        const hasWarning = services.some(s => s.status === 'degraded');
        const overall: IssueSeverity = hasError ? 'error' : hasWarning ? 'warning' : 'info';

        console.log(`\n${colors.bold}Overall:${colors.reset} ${severityColor(overall)}${severityIcon(overall)} ${overall.toUpperCase()}${colors.reset}`);

        if (opts.json) {
          console.log('\nJSON:');
          console.log(JSON.stringify({ overall, services }, null, 2));
        }

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  // Library check only
  cmd
    .command('library')
    .description('Check library for missing files and issues')
    .option('--batch-size <n>', 'Jellyfin API batch size', '100')
    .option('--check-duplicates', 'Check for multiple video files in folders')
    .option('--severity <level>', 'Filter by severity (info, warning, error)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const config = loadConfig(baseDir);

        if (!config.jellyfin.url || !config.jellyfin.apiKey) {
          console.error('Error: Jellyfin URL and API key required for library monitoring');
          console.error('Configure jellyfin.url and jellyfin.apiKey in config.yaml');
          process.exit(1);
        }

        console.log(`${colors.bold}Library Monitor${colors.reset}\n`);
        console.log(`Jellyfin: ${config.jellyfin.url}`);
        console.log(`Batch size: ${opts.batchSize}`);

        // TODO: Implement actual library check
        const issues: LibraryIssue[] = [
          // Placeholder examples
          {
            id: '1',
            severity: 'error',
            type: 'missing_file',
            title: 'Example Movie (2024)',
            path: '/media/movies/Example Movie (2024)/Example.Movie.2024.1080p.mkv',
            details: 'File not found on filesystem',
            detectedAt: new Date().toISOString(),
            resolved: false,
          },
          {
            id: '2',
            severity: 'warning',
            type: 'multiple_video_files',
            title: 'Another Movie (2023)',
            path: '/media/movies/Another Movie (2023)/',
            details: 'Found 2 video files: movie.mkv, movie.sample.mkv',
            detectedAt: new Date().toISOString(),
            resolved: false,
          },
        ];

        console.log('\n[Not implemented yet] Using placeholder data\n');

        // Filter by severity if specified
        const filtered = opts.severity
          ? issues.filter(i => i.severity === opts.severity)
          : issues;

        // Group by severity
        const errors = filtered.filter(i => i.severity === 'error');
        const warnings = filtered.filter(i => i.severity === 'warning');
        const infos = filtered.filter(i => i.severity === 'info');

        if (errors.length > 0) {
          console.log(`${colors.red}${colors.bold}Errors (${errors.length})${colors.reset}\n`);
          for (const issue of errors) {
            console.log(formatIssue(issue));
            console.log();
          }
        }

        if (warnings.length > 0) {
          console.log(`${colors.yellow}${colors.bold}Warnings (${warnings.length})${colors.reset}\n`);
          for (const issue of warnings) {
            console.log(formatIssue(issue));
            console.log();
          }
        }

        if (infos.length > 0) {
          console.log(`${colors.green}${colors.bold}Info (${infos.length})${colors.reset}\n`);
          for (const issue of infos) {
            console.log(formatIssue(issue));
            console.log();
          }
        }

        console.log(`${colors.bold}Summary:${colors.reset} ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info`);

        if (opts.json) {
          console.log('\nJSON:');
          console.log(JSON.stringify({ issues: filtered }, null, 2));
        }

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
