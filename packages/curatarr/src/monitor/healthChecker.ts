/**
 * Health checker for external services
 * Checks connectivity with timeout and retry
 */

import type { CuratarrConfig, HealthStatus, ServiceName } from '../shared/types.js';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 2;

interface CheckOptions {
  timeoutMs?: number;
  retries?: number;
}

export class HealthChecker {
  constructor(private config: CuratarrConfig) {}

  /**
   * Check all configured services
   */
  async checkAll(options: CheckOptions = {}): Promise<HealthStatus[]> {
    const checks: Promise<HealthStatus>[] = [
      this.checkJellyfin(options),
      this.checkIndexer(options),
      this.checkSabnzbd(options),
      this.checkTmdb(options),
      this.checkLlm(options),
    ];

    return Promise.all(checks);
  }

  /**
   * Check Jellyfin connectivity
   */
  async checkJellyfin(options: CheckOptions = {}): Promise<HealthStatus> {
    const service: ServiceName = 'jellyfin';
    const { url, apiKey } = this.config.jellyfin;

    if (!url || !apiKey) {
      return {
        service,
        status: 'degraded',
        lastCheck: new Date().toISOString(),
        error: 'Not configured',
      };
    }

    return this.checkEndpoint(service, `${url}/System/Info`, {
      headers: { 'X-Emby-Token': apiKey },
      ...options,
    });
  }

  /**
   * Check Newznab indexer connectivity
   */
  async checkIndexer(options: CheckOptions = {}): Promise<HealthStatus> {
    const service: ServiceName = 'indexer';
    const { url, apiKey } = this.config.indexer;

    // Newznab caps endpoint
    const capsUrl = `${url}/api?t=caps&apikey=${apiKey}`;

    return this.checkEndpoint(service, capsUrl, options);
  }

  /**
   * Check SABnzbd connectivity
   */
  async checkSabnzbd(options: CheckOptions = {}): Promise<HealthStatus> {
    const service: ServiceName = 'sabnzbd';
    const { url, apiKey } = this.config.sabnzbd;

    // SABnzbd version endpoint
    const versionUrl = `${url}/api?mode=version&apikey=${apiKey}&output=json`;

    return this.checkEndpoint(service, versionUrl, options);
  }

  /**
   * Check TMDB connectivity
   */
  async checkTmdb(options: CheckOptions = {}): Promise<HealthStatus> {
    const service: ServiceName = 'tmdb';
    const { apiKey } = this.config.tmdb;

    // TMDB configuration endpoint (lightweight)
    const configUrl = 'https://api.themoviedb.org/3/configuration';

    return this.checkEndpoint(service, configUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      ...options,
    });
  }

  /**
   * Check LLM provider connectivity
   */
  async checkLlm(options: CheckOptions = {}): Promise<HealthStatus> {
    const service: ServiceName = 'llm';
    const { provider, apiKey } = this.config.llm;

    let url: string;
    let headers: Record<string, string>;

    if (provider === 'openai') {
      url = 'https://api.openai.com/v1/models';
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    } else {
      return {
        service,
        status: 'degraded',
        lastCheck: new Date().toISOString(),
        error: `Unknown provider: ${provider}`,
      };
    }

    return this.checkEndpoint(service, url, { headers, ...options });
  }

  /**
   * Generic endpoint check with timeout and retry
   */
  private async checkEndpoint(
    service: ServiceName,
    url: string,
    options: CheckOptions & { headers?: Record<string, string> } = {}
  ): Promise<HealthStatus> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = options.retries ?? DEFAULT_RETRIES;
    const headers = options.headers ?? {};

    let lastError: string | undefined;
    let latencyMs: number | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        latencyMs = Date.now() - startTime;

        if (response.ok || response.status === 401 || response.status === 403) {
          // 401/403 means service is reachable but auth issue
          return {
            service,
            status: response.ok ? 'healthy' : 'degraded',
            lastCheck: new Date().toISOString(),
            latencyMs,
            error: response.ok ? undefined : `HTTP ${response.status}`,
          };
        }

        lastError = `HTTP ${response.status}`;
      } catch (err) {
        latencyMs = Date.now() - startTime;

        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            lastError = `Timeout after ${timeoutMs}ms`;
          } else {
            lastError = err.message;
          }
        } else {
          lastError = String(err);
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    return {
      service,
      status: 'unreachable',
      lastCheck: new Date().toISOString(),
      latencyMs,
      error: lastError,
    };
  }
}
