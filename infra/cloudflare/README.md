# DulceJelly Cloudflare Infrastructure

This directory contains Pulumi TypeScript code to provision Cloudflare resources for the DulceJelly media server:

- **DNS records** for all service subdomains
- **WAF rules** and rate limiting (brute-force protection for Jellyfin auth)
- **Optional Cloudflare Access** policies for admin services (Jellyseerr, Radarr, Sonarr, qBittorrent, Prowlarr, SABnzbd)

## Important Notes

- **Tunnel ingress rules remain local**: This IaC manages only Cloudflare-side resources. Your cloudflared tunnel ingress configuration stays in `media-server/cloudflared/config.yml`.
- **Jellyfin stays public**: Cloudflare Access is NOT applied to Jellyfin because TV clients cannot complete Zero Trust login pages.
- **LAN access unaffected**: Direct IP:port access on your local network continues to work regardless of these cloud settings.

## Prerequisites

1. **Pulumi CLI** installed ([Install Guide](https://www.pulumi.com/docs/get-started/install/))
2. **Node.js** (v18+) and npm
3. **Cloudflare account** with a domain/zone configured
4. **Cloudflare API token** with permissions:
   - Zone:DNS:Edit
   - Zone:Zone:Read
   - Account:Cloudflare Tunnel:Read (if using tunnels)
   - Account:Access:Edit (if using Cloudflare Access)

## Setup

1. **Install dependencies:**

   ```bash
   cd infra/cloudflare
   npm install
   ```

2. **Initialize Pulumi stack:**

   ```bash
   pulumi login  # Use Pulumi Cloud or local backend
   pulumi stack init dev  # Or your preferred stack name
   ```

3. **Configure Cloudflare credentials:**

   ```bash
   # Set your Cloudflare API token (secret)
   pulumi config set --secret cloudflare:apiToken YOUR_CLOUDFLARE_API_TOKEN

   # Set your Cloudflare account ID
   pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID
   ```

4. **Configure DulceJelly settings:**

   Copy `Pulumi.dev.yaml` and customize:

   ```bash
   # Edit the file with your zone ID and domain
   # Required settings:
   pulumi config set zoneId YOUR_ZONE_ID
   pulumi config set baseDomain mymedialibrary.example  # Your domain

   # Optional: customize hostnames, security settings
   # See Pulumi.dev.yaml for all options
   ```

5. **Preview and deploy:**

   ```bash
   # Preview changes
   pulumi preview

   # Deploy infrastructure
   pulumi up
   ```

## Configuration Reference

### Required

- `cloudflare:apiToken` (secret): Your Cloudflare API token
- `cloudflare:accountId`: Your Cloudflare account ID
- `zoneId`: Your Cloudflare zone ID
- `baseDomain`: Your domain (e.g., `mymedialibrary.example`)

### Optional

- `enableWafHardening` (default: `true`): Enable WAF rules and bot protection
- `rateLimitEnabled` (default: `true`): Enable rate limiting on Jellyfin auth endpoints
- `enableAccessForAdminApps` (default: `false`): Enable Cloudflare Access for admin services
- `accessEmailDomain`: Email domain for Access allow policy (required if Access enabled)
- `geoAllowCountries`: Array of country codes to allow (e.g., `["US", "GB"]`), empty = allow all
- `tunnelId`: Your cloudflared tunnel ID (optional, used for DNS CNAME targets)
- Service hostname overrides: `jellyfinHostname`, `jellyseerrHostname`, etc.

## Security Features

### Rate Limiting

When enabled, protects Jellyfin authentication endpoints:
- Max 10 requests per minute per IP
- 5-minute timeout on violation
- Targets `/Users/authenticatebyname` endpoint

### WAF Rules

When enabled:
- Blocks suspicious bots (except verified search engines)
- Blocks common exploit scanners (sqlmap, nikto, etc.)
- Optional geo-restriction
- Cloudflare managed ruleset (OWASP protection)

### Streaming Protection

WAF rules are designed to NOT break:
- Jellyfin media streaming (`/Videos/*` endpoints)
- WebSocket connections
- Server-Sent Events (SSE)

## Cloudflare Access (Optional)

If `enableAccessForAdminApps` is `true`:

1. **Configure an Identity Provider** in Cloudflare dashboard (Zero Trust > Settings > Authentication)
2. Set `accessEmailDomain` config for the default email-based policy
3. Customize policies in `index.ts` or via Cloudflare dashboard

**Note:** Jellyfin is explicitly excluded from Access because TV clients cannot complete Zero Trust login flows.

## Finding Your IDs

### Cloudflare Zone ID and Account ID

1. Log in to Cloudflare Dashboard
2. Select your domain
3. Scroll down on the Overview page - Zone ID is shown in the right sidebar
4. Account ID is in the URL: `dash.cloudflare.com/{account_id}/...`

### Cloudflare API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Create Token > Custom Token
3. Permissions needed:
   - Zone > DNS > Edit
   - Zone > Zone Settings > Read
   - Zone > Zone > Read
   - Account > Cloudflare Tunnel > Read (optional)
   - Account > Access: Organizations, Identity Providers, and Groups > Edit (if using Access)

## Updating Infrastructure

After making changes:

```bash
pulumi preview  # See what will change
pulumi up       # Apply changes
```

To destroy all resources:

```bash
pulumi destroy
```

## Troubleshooting

**"Error: could not validate provider credentials"**
- Check your API token has correct permissions
- Ensure token is set: `pulumi config get --secret cloudflare:apiToken`

**"Zone not found"**
- Verify `zoneId` is correct: `pulumi config get zoneId`
- Ensure your API token has access to the zone

**DNS records not resolving**
- Check records are proxied (orange cloud) in Cloudflare dashboard
- Verify tunnel is running: `docker compose logs cloudflared`
- Confirm CNAME target matches your tunnel ID

**Access not working**
- Ensure you've configured an IdP in Cloudflare Zero Trust dashboard
- Check Access policy rules allow your email/group
- Remember: Jellyfin is intentionally excluded from Access

## Architecture

This infrastructure provisions:

```
Internet → Cloudflare Edge (WAF/Rate Limit/Access)
  → Cloudflare Tunnel (cloudflared)
    → Caddy Reverse Proxy
      → Media Services (Jellyfin, Radarr, etc.)
```

- **Cloudflare Edge**: DNS, DDoS protection, WAF, optional Access
- **Tunnel**: Encrypted connection from Cloudflare to your server (no port forwarding)
- **Caddy**: HTTP routing and optional basic auth (for services not using Access)
- **Services**: Your media stack containers

For detailed architecture documentation, see [../../media-server/docs/Architecture.md](../../media-server/docs/Architecture.md) (once created).
