import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

// Load configuration
const config = new pulumi.Config();
const cfConfig = new pulumi.Config("cloudflare");

// Required config
const cfAccountId = cfConfig.require("accountId");
const cfZoneId = config.require("zoneId");
const baseDomain = config.require("baseDomain");

// Optional config with defaults
const enableWafHardening = config.getBoolean("enableWafHardening") ?? true;
const enableAccessForAdminApps = config.getBoolean("enableAccessForAdminApps") ?? false;
const geoAllowCountries = config.getObject<string[]>("geoAllowCountries") ?? [];
const rateLimitEnabled = config.getBoolean("rateLimitEnabled") ?? true;

// Service hostnames configuration
const services = {
  jellyfin: config.get("jellyfinHostname") ?? "jellyfin",
  jellyseerr: config.get("jellyseerrHostname") ?? "jellyseerr",
  radarr: config.get("radarrHostname") ?? "radarr",
  sonarr: config.get("sonarrHostname") ?? "sonarr",
  qbittorrent: config.get("qbittorrentHostname") ?? "qb",
  prowlarr: config.get("prowlarrHostname") ?? "prowlarr",
  sabnzbd: config.get("sabnzbdHostname") ?? "sab",
  apex: "" // apex domain
};

// Admin services (require Access if enabled)
const adminServices = ["jellyseerr", "radarr", "sonarr", "qbittorrent", "prowlarr", "sabnzbd"];

// Tunnel ID (from cloudflared config, optional - for reference only)
const tunnelId = config.get("tunnelId") ?? "";

// ============================================================================
// DNS Records
// ============================================================================

const dnsRecords: Record<string, cloudflare.Record> = {};

// Create DNS records for each service
Object.entries(services).forEach(([serviceName, hostname]) => {
  const fqdn = hostname ? `${hostname}.${baseDomain}` : baseDomain;
  const recordName = hostname || "@";

  dnsRecords[serviceName] = new cloudflare.Record(`dns-${serviceName}`, {
    zoneId: cfZoneId,
    name: recordName,
    type: "CNAME",
    value: tunnelId ? `${tunnelId}.cfargotunnel.com` : `${baseDomain}`,
    proxied: true,
    comment: `DulceJelly ${serviceName} service`,
    ttl: 1, // Auto when proxied
  });
});

// ============================================================================
// WAF / Security Rules
// ============================================================================

if (enableWafHardening) {
  // Rate limiting for Jellyfin auth endpoints (brute-force protection)
  if (rateLimitEnabled) {
    const jellyfinRateLimit = new cloudflare.Ruleset("jellyfin-rate-limit", {
      zoneId: cfZoneId,
      name: "Jellyfin Auth Rate Limiting",
      description: "Rate limit Jellyfin authentication endpoints to prevent brute force attacks",
      kind: "zone",
      phase: "http_ratelimit",
      rules: [
        {
          action: "block",
          description: "Rate limit Jellyfin auth endpoints - 10 requests per minute",
          enabled: true,
          expression: `(http.host eq "${services.jellyfin}.${baseDomain}" and http.request.uri.path contains "/Users/authenticatebyname")`,
          ratelimit: {
            characteristics: ["ip.src"],
            period: 60,
            requestsPerPeriod: 10,
            mitigationTimeout: 300, // 5 minute timeout
          },
        },
      ],
    });
  }

  // Custom WAF rules for additional protection
  const wafRuleset = new cloudflare.Ruleset("waf-custom", {
    zoneId: cfZoneId,
    name: "DulceJelly WAF Rules",
    description: "Custom WAF rules for DulceJelly media server",
    kind: "zone",
    phase: "http_request_firewall_custom",
    rules: [
      // Block known bad bots (except for Jellyfin streaming endpoints)
      {
        action: "block",
        description: "Block suspicious bots on non-streaming endpoints",
        enabled: true,
        expression: `(cf.client.bot and not cf.verified_bot_category in {"Search Engine Crawler"} and not http.request.uri.path contains "/Videos/")`,
      },
      // Geo-restriction if configured
      ...(geoAllowCountries.length > 0 ? [
        {
          action: "block",
          description: `Allow only from: ${geoAllowCountries.join(", ")}`,
          enabled: true,
          expression: `not ip.geoip.country in {${geoAllowCountries.map(c => `"${c}"`).join(" ")}}`,
        },
      ] : []),
      // Block suspicious user agents trying to exploit
      {
        action: "block",
        description: "Block common exploit scanners",
        enabled: true,
        expression: `(http.user_agent contains "sqlmap" or http.user_agent contains "nikto" or http.user_agent contains "masscan")`,
      },
    ],
  });

  // Enable Cloudflare managed rulesets (Bot Fight Mode equivalent)
  const managedRuleset = new cloudflare.Ruleset("managed-rules", {
    zoneId: cfZoneId,
    name: "DulceJelly Managed Rules",
    description: "Cloudflare managed security rules",
    kind: "zone",
    phase: "http_request_firewall_managed",
    rules: [
      {
        action: "execute",
        description: "Execute Cloudflare Managed Ruleset",
        enabled: true,
        expression: "true",
        actionParameters: {
          id: "efb7b8c949ac4650a09736fc376e9aee", // Cloudflare Managed Ruleset
        },
      },
    ],
  });
}

// ============================================================================
// Cloudflare Access (Optional - for admin services only)
// ============================================================================

if (enableAccessForAdminApps) {
  // Note: This requires Cloudflare Access to be configured in your account
  // and an identity provider (IdP) to be set up

  adminServices.forEach(serviceName => {
    const hostname = services[serviceName as keyof typeof services];
    if (!hostname) return;

    const fqdn = `${hostname}.${baseDomain}`;

    // Create Access Application
    const accessApp = new cloudflare.AccessApplication(`access-${serviceName}`, {
      zoneId: cfZoneId,
      name: `DulceJelly ${serviceName}`,
      domain: fqdn,
      type: "self_hosted",
      sessionDuration: "24h",
      autoRedirectToIdentity: false,
      allowedIdps: [], // User must configure their IdP IDs
      appLauncherVisible: true,
    });

    // Create a basic Access Policy (requires email domain or other criteria)
    // Users should customize this based on their needs
    const emailDomain = config.get("accessEmailDomain") ?? "";

    if (emailDomain) {
      new cloudflare.AccessPolicy(`access-policy-${serviceName}`, {
        applicationId: accessApp.id,
        zoneId: cfZoneId,
        name: `Allow ${emailDomain} domain`,
        precedence: 1,
        decision: "allow",
        includes: [
          {
            emailDomains: [emailDomain],
          },
        ],
      });
    }
  });

  // Export note about Access configuration
  pulumi.log.warn(
    "Cloudflare Access is enabled but requires manual IdP configuration. " +
    "Set 'accessEmailDomain' config and configure Identity Providers in Cloudflare dashboard."
  );
}

// ============================================================================
// Exports
// ============================================================================

export const zoneId = cfZoneId;
export const accountId = cfAccountId;
export const domain = baseDomain;
export const serviceUrls = Object.entries(services).reduce((acc, [key, hostname]) => {
  acc[key] = hostname ? `https://${hostname}.${baseDomain}` : `https://${baseDomain}`;
  return acc;
}, {} as Record<string, string>);
export const wafEnabled = enableWafHardening;
export const accessEnabled = enableAccessForAdminApps;
export const dnsRecordIds = Object.entries(dnsRecords).reduce((acc, [key, record]) => {
  acc[key] = record.id;
  return acc;
}, {} as Record<string, pulumi.Output<string>>);
