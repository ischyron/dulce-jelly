/**
 * Grab command
 * Send a release to SABnzbd for download
 */

import { Command } from 'commander';

import { loadConfig } from '../shared/config.js';

export function grabCommand(baseDir: string): Command {
  const cmd = new Command('grab')
    .description('Send a release to SABnzbd for download')
    .argument('<guid>', 'Release GUID from search results')
    .option('--confirm', 'Confirm the grab (required)')
    .option('--category <name>', 'SABnzbd category override')
    .action(async (guid, opts) => {
      try {
        if (!opts.confirm) {
          console.error('Error: --confirm flag is required to grab a release');
          console.error('This prevents accidental downloads.');
          console.error('');
          console.error('Usage: curatarr grab <guid> --confirm');
          process.exit(1);
        }

        const config = loadConfig(baseDir);
        const category = opts.category ?? config.sabnzbd.category;

        console.log(`Grabbing release: ${guid}`);
        console.log(`SABnzbd: ${config.sabnzbd.url}`);
        console.log(`Category: ${category}`);

        // TODO: Implement grab
        console.log('\n[Not implemented yet] Grab module pending');
        console.log('Will:');
        console.log('  1. Fetch NZB from indexer');
        console.log('  2. Send to SABnzbd API');
        console.log('  3. Log action for audit trail');
        console.log('  4. Return job ID');

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
