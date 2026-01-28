/**
 * Library scan command
 * Scans movie folders and extracts quality metrics via ffprobe
 */

import { Command } from 'commander';

import { loadConfig } from '../shared/config.js';

export function scanCommand(baseDir: string): Command {
  const cmd = new Command('scan')
    .description('Scan library and analyze file quality')
    .argument('[path]', 'Path to scan (defaults to configured library paths)')
    .option('--profile <name>', 'Compare against quality profile')
    .option('--report', 'Generate quality report')
    .option('--upgrades-only', 'Only show files that need upgrades')
    .option('--json', 'Output as JSON')
    .action(async (scanPath, opts) => {
      try {
        const config = loadConfig(baseDir);
        const paths = scanPath ? [scanPath] : config.library.moviePaths;

        if (paths.length === 0) {
          console.error('No paths to scan. Specify a path or configure library.moviePaths');
          process.exit(1);
        }

        console.log('Scanning library paths:');
        for (const p of paths) {
          console.log(`  - ${p}`);
        }

        if (opts.profile) {
          console.log(`Comparing against profile: ${opts.profile}`);
        }

        // TODO: Implement scanner
        console.log('\n[Not implemented yet] Scanner module pending');
        console.log('Will use ffprobe to analyze:');
        console.log('  - Video: resolution, bitrate, codec, HDR');
        console.log('  - Audio: codec, channels, bitrate');
        console.log('  - File: size, duration, container');

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
