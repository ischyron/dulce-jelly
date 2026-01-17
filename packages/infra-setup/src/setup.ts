#!/usr/bin/env node
/**
 * DulceJelly Setup Script
 *
 * Generates local configuration files for DulceJelly media server:
 * - cloudflared/config.yml (tunnel ingress rules)
 * - Caddyfile (reverse proxy routing)
 * - .env template additions
 *
 * This script does NOT modify Cloudflare-side resources.
 * Run `pulumi up` in infra/cloudflare for that.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// =============================================================================
// Configuration Types
// =============================================================================

interface ServiceConfig {
  name: string;
  hostname: string;
  port: number;
  requireAuth: boolean;
}

interface SetupConfig {
  baseDomain: string;
  tunnelId: string;
  tunnelCredentialsFile: string;
  services: ServiceConfig[];
  enableCaddyAuth: boolean;
  enableJellyfinAuth: boolean;
}

// =============================================================================
// Prompts
// =============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

async function confirm(query: string, defaultYes: boolean = true): Promise<boolean> {
  const defaultStr = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await question(`${query} ${defaultStr}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

// =============================================================================
// Main Setup Flow
// =============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('DulceJelly Setup - Local Configuration Generator');
  console.log('='.repeat(70));
  console.log();
  console.log('This script generates local configuration files for your media server.');
  console.log('It does NOT modify Cloudflare resources (use Pulumi for that).');
  console.log();

  // Get project root
  const projectRoot = path.resolve(__dirname, '..');
  const mediaServerDir = path.join(projectRoot, 'media-server');
  const cloudflaredDir = path.join(mediaServerDir, 'cloudflared');
  const caddyDir = path.join(mediaServerDir, 'caddy');

  // Check if media-server directory exists
  if (!fs.existsSync(mediaServerDir)) {
    console.error(`Error: media-server directory not found at ${mediaServerDir}`);
    console.error('Please run this script from the repository root.');
    process.exit(1);
  }

  const config: SetupConfig = {
    baseDomain: '',
    tunnelId: '',
    tunnelCredentialsFile: '',
    services: [],
    enableCaddyAuth: true,
    enableJellyfinAuth: false
  };

  // Step 1: Domain Configuration
  console.log('Step 1: Domain Configuration');
  console.log('-'.repeat(70));
  config.baseDomain = await question('Enter your domain (e.g., mymedialibrary.example): ');

  if (!config.baseDomain) {
    console.error('Error: Domain is required');
    process.exit(1);
  }

  console.log();

  // Step 2: Cloudflare Tunnel Configuration
  console.log('Step 2: Cloudflare Tunnel Configuration');
  console.log('-'.repeat(70));
  console.log('You need a Cloudflare Tunnel created in your account.');
  console.log('If you don\'t have one, create it at: https://one.dash.cloudflare.com/');
  console.log('Navigate to: Networks > Tunnels > Create a tunnel');
  console.log();

  config.tunnelId = await question('Enter your Cloudflare Tunnel ID: ');

  if (!config.tunnelId) {
    console.error('Error: Tunnel ID is required');
    process.exit(1);
  }

  const defaultCredsFile = `${config.tunnelId}.json`;
  const credsFile = await question(`Tunnel credentials filename [${defaultCredsFile}]: `);
  config.tunnelCredentialsFile = credsFile || defaultCredsFile;

  console.log();

  // Step 3: Service Configuration
  console.log('Step 3: Service Configuration');
  console.log('-'.repeat(70));
  console.log('Configure hostnames for each service (subdomain only, no domain)');
  console.log(`Example: "jellyfin" will create jellyfin.${config.baseDomain}`);
  console.log();

  const defaultServices = [
    { name: 'jellyfin', defaultHostname: 'jellyfin', port: 8096, description: 'Media streaming' },
    { name: 'jellyseerr', defaultHostname: 'jellyseerr', port: 5055, description: 'Content requests' },
    { name: 'radarr', defaultHostname: 'radarr', port: 7878, description: 'Movie management' },
    { name: 'sonarr', defaultHostname: 'sonarr', port: 8989, description: 'TV show management' },
    { name: 'qbittorrent', defaultHostname: 'qb', port: 8080, description: 'Torrent downloads' },
    { name: 'prowlarr', defaultHostname: 'prowlarr', port: 9696, description: 'Indexer management' },
    { name: 'sabnzbd', defaultHostname: 'sab', port: 8080, description: 'Usenet downloads' },
    { name: 'apex', defaultHostname: '', port: 80, description: 'Landing page' }
  ];

  for (const svc of defaultServices) {
    const hostname = await question(`  ${svc.name} (${svc.description}) [${svc.defaultHostname || 'apex'}]: `);
    config.services.push({
      name: svc.name,
      hostname: hostname || svc.defaultHostname,
      port: svc.port,
      requireAuth: svc.name !== 'jellyfin' && svc.name !== 'apex'
    });
  }

  console.log();

  // Step 4: Security Configuration
  console.log('Step 4: Security Configuration');
  console.log('-'.repeat(70));

  config.enableCaddyAuth = await confirm(
    'Enable Caddy basic auth for admin services (Jellyseerr, Radarr, etc.)?',
    true
  );

  config.enableJellyfinAuth = await confirm(
    'Enable Caddy basic auth for Jellyfin? (May break TV client apps)',
    false
  );

  console.log();

  // Step 5: Generate Configurations
  console.log('Step 5: Generating Configuration Files');
  console.log('-'.repeat(70));

  // Generate cloudflared config
  const cloudflaredConfig = generateCloudflaredConfig(config);
  const cloudflaredPath = path.join(cloudflaredDir, 'config.yml');

  if (fs.existsSync(cloudflaredPath)) {
    const overwrite = await confirm(`${cloudflaredPath} exists. Overwrite?`, false);
    if (!overwrite) {
      console.log('Skipping cloudflared config generation.');
    } else {
      fs.writeFileSync(cloudflaredPath, cloudflaredConfig);
      console.log(`✓ Generated: ${cloudflaredPath}`);
    }
  } else {
    fs.writeFileSync(cloudflaredPath, cloudflaredConfig);
    console.log(`✓ Generated: ${cloudflaredPath}`);
  }

  // Generate Caddyfile
  const caddyfile = generateCaddyfile(config);
  const caddyfilePath = path.join(caddyDir, 'Caddyfile.generated');
  fs.writeFileSync(caddyfilePath, caddyfile);
  console.log(`✓ Generated: ${caddyfilePath}`);
  console.log(`  Note: Review and replace ${path.join(caddyDir, 'Caddyfile')} if satisfied`);

  // Generate .env additions
  const envAdditions = generateEnvAdditions(config);
  const envPath = path.join(mediaServerDir, '.env.additions');
  fs.writeFileSync(envPath, envAdditions);
  console.log(`✓ Generated: ${envPath}`);
  console.log(`  Note: Merge these into your .env file`);

  // Generate Pulumi config snippet
  const pulumiConfigSnippet = generatePulumiConfigSnippet(config);
  const pulumiSnippetPath = path.join(projectRoot, 'infra', 'cloudflare', 'Pulumi.config-snippet.yaml');
  fs.writeFileSync(pulumiSnippetPath, pulumiConfigSnippet);
  console.log(`✓ Generated: ${pulumiSnippetPath}`);
  console.log(`  Note: Merge these settings into your Pulumi stack config`);

  console.log();
  console.log('='.repeat(70));
  console.log('Setup Complete!');
  console.log('='.repeat(70));
  console.log();
  console.log('Next Steps:');
  console.log();
  console.log('1. Copy your tunnel credentials file to:');
  console.log(`   ${cloudflaredDir}/${config.tunnelCredentialsFile}`);
  console.log();
  console.log('2. Review and merge generated configurations:');
  console.log(`   - ${cloudflaredPath}`);
  console.log(`   - ${caddyfilePath} → ${path.join(caddyDir, 'Caddyfile')}`);
  console.log(`   - ${envPath} → ${path.join(mediaServerDir, '.env')}`);
  console.log();
  console.log('3. Configure and deploy Cloudflare infrastructure:');
  console.log('   cd infra/cloudflare');
  console.log('   npm install');
  console.log('   pulumi login');
  console.log('   pulumi stack init prod  # or your stack name');
  console.log('   # Merge Pulumi.config-snippet.yaml into your stack config');
  console.log('   pulumi config set --secret cloudflare:apiToken YOUR_TOKEN');
  console.log('   pulumi preview');
  console.log('   pulumi up');
  console.log();
  console.log('4. Start your media server:');
  console.log('   cd media-server');
  console.log('   docker compose up -d');
  console.log();
  console.log('5. Run smoke tests:');
  console.log('   cd media-server');
  console.log('   export TEST_AUTH_USER=your_user TEST_AUTH_PASS=your_pass');
  console.log('   node --test test/test-services.test.mjs');
  console.log();

  rl.close();
}

// =============================================================================
// Config Generators
// =============================================================================

function generateCloudflaredConfig(config: SetupConfig): string {
  const lines = [
    '# DulceJelly Cloudflare Tunnel Configuration',
    '# Generated by setup-dulcejelly.ts',
    `# Domain: ${config.baseDomain}`,
    '',
    `tunnel: ${config.tunnelId}`,
    `credentials-file: /etc/cloudflared/${config.tunnelCredentialsFile}`,
    '',
    'ingress:'
  ];

  // Add service ingress rules (all pointing to Caddy)
  for (const service of config.services) {
    if (!service.hostname && service.name !== 'apex') continue;

    const fqdn = service.hostname
      ? `${service.hostname}.${config.baseDomain}`
      : config.baseDomain;

    lines.push(`  - hostname: ${fqdn}`);
    lines.push('    service: http://caddy:80');
  }

  // Catch-all 404
  lines.push('  - service: http_status:404');
  lines.push('');

  return lines.join('\n');
}

function generateCaddyfile(config: SetupConfig): string {
  const lines = [
    '{',
    '  # Keep TLS termination at Cloudflare',
    '  auto_https off',
    '  admin off',
    '}',
    '',
    '# Shared basic auth snippet',
    '(auth_common) {',
    '  @auth_enabled expression {env.CADDY_AUTH_ENABLED} != "false"',
    '  basic_auth @auth_enabled {',
    '    {$BASIC_AUTH_USER} {$BASIC_AUTH_HASH}',
    '  }',
    '}',
    '',
    '# Enforce HTTPS for public domains',
    '(require_https_public) {',
    '  @insecure not header X-Forwarded-Proto https',
    '  redir @insecure https://{host}{uri} 308',
    '}',
    '',
  ];

  // Generate apex domain config
  const apexService = config.services.find(s => s.name === 'apex');
  if (apexService) {
    lines.push(`# Landing page`);
    lines.push(`http://${config.baseDomain} {`);
    lines.push('  import require_https_public');
    if (config.enableCaddyAuth) {
      lines.push('  import auth_common');
    }
    lines.push('  header {');
    lines.push('    Cache-Control "no-store, no-cache, must-revalidate, max-age=0"');
    lines.push('    Pragma "no-cache"');
    lines.push('    Expires "0"');
    lines.push('  }');
    lines.push('');
    lines.push('  handle /logos* {');
    lines.push('    root * /srv');
    lines.push('    file_server');
    lines.push('  }');
    lines.push('');
    lines.push('  handle_path / {');
    lines.push('    root * /srv');
    lines.push('    try_files {path} index.html');
    lines.push('    file_server');
    lines.push('  }');
    lines.push('');
    lines.push('  respond 404');
    lines.push('}');
    lines.push('');
  }

  // Service-to-container mapping
  const serviceMap: Record<string, { container: string; port: number }> = {
    jellyfin: { container: 'jellyfin', port: 8096 },
    jellyseerr: { container: 'jellyseerr', port: 5055 },
    radarr: { container: 'radarr', port: 7878 },
    sonarr: { container: 'sonarr', port: 8989 },
    qbittorrent: { container: 'qbittorrent', port: 8080 },
    prowlarr: { container: 'prowlarr', port: 9696 },
    sabnzbd: { container: 'sabnzbd', port: 8080 }
  };

  // Generate service subdomains
  for (const service of config.services) {
    if (service.name === 'apex' || !service.hostname) continue;

    const mapping = serviceMap[service.name];
    if (!mapping) continue;

    const fqdn = `${service.hostname}.${config.baseDomain}`;

    lines.push(`# ${service.name}`);
    lines.push(`http://${fqdn} {`);
    lines.push('  import require_https_public');

    // Auth configuration
    if (service.name === 'jellyfin') {
      if (config.enableJellyfinAuth) {
        lines.push('  @auth_enabled expression {$JELLYFIN_AUTH_ENABLED}');
        lines.push('  basic_auth @auth_enabled {');
        lines.push('    {$BASIC_AUTH_USER} {$BASIC_AUTH_HASH}');
        lines.push('  }');
      } else {
        lines.push('  # No auth - Jellyfin has built-in authentication');
      }
    } else if (config.enableCaddyAuth) {
      lines.push('  import auth_common');
    }

    // Reverse proxy
    lines.push(`  reverse_proxy ${mapping.container}:${mapping.port} {`);
    lines.push('    header_up Host {host}');
    lines.push('    header_up X-Real-IP {remote}');
    lines.push('    header_up X-Forwarded-For {remote}');
    lines.push('    header_up X-Forwarded-Port {server_port}');
    lines.push('    header_up X-Forwarded-Proto {scheme}');
    lines.push('  }');
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

function generateEnvAdditions(config: SetupConfig): string {
  const lines = [
    '# DulceJelly Configuration Additions',
    '# Generated by setup-dulcejelly.ts',
    '# Merge these into your .env file',
    '',
    '# Domain Configuration',
    `BASE_DOMAIN=${config.baseDomain}`,
    '',
    '# Caddy Auth Configuration',
    `CADDY_AUTH_ENABLED=${config.enableCaddyAuth ? 'true' : 'false'}`,
    `JELLYFIN_AUTH_ENABLED=${config.enableJellyfinAuth ? 'true' : 'false'}`,
    '',
    '# Service Hostnames (for reference)',
  ];

  for (const service of config.services) {
    if (service.hostname) {
      lines.push(`# ${service.name.toUpperCase()}_HOSTNAME=${service.hostname}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

function generatePulumiConfigSnippet(config: SetupConfig): string {
  const lines = [
    '# Pulumi Configuration Snippet',
    '# Generated by setup-dulcejelly.ts',
    '# Merge these into your Pulumi.<stack>.yaml file',
    '',
    'config:',
    `  dulcejelly-cloudflare:baseDomain: "${config.baseDomain}"`,
    `  dulcejelly-cloudflare:tunnelId: "${config.tunnelId}"`,
    '',
    '  # Service hostnames',
  ];

  for (const service of config.services) {
    if (service.name !== 'apex' && service.hostname) {
      const configKey = `${service.name}Hostname`;
      lines.push(`  dulcejelly-cloudflare:${configKey}: "${service.hostname}"`);
    }
  }

  lines.push('');
  lines.push('  # Security settings (customize as needed)');
  lines.push('  dulcejelly-cloudflare:enableWafHardening: true');
  lines.push('  dulcejelly-cloudflare:rateLimitEnabled: true');
  lines.push('  dulcejelly-cloudflare:enableAccessForAdminApps: false');
  lines.push('');
  lines.push('  # Remember to also set:');
  lines.push('  # cloudflare:accountId: "YOUR_ACCOUNT_ID"');
  lines.push('  # cloudflare:apiToken: "YOUR_API_TOKEN" (use: pulumi config set --secret)');
  lines.push('  # dulcejelly-cloudflare:zoneId: "YOUR_ZONE_ID"');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Entry Point
// =============================================================================

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
