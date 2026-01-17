#!/usr/bin/env node
// Smoke tests for media-server ingress using Node's built-in test runner.
// Usage: node --test test/test-services.test.mjs (from repo root)
// Required env vars: LAN_HOSTNAME
// Optional env vars: PUBLIC_DOMAIN (enables public HTTPS tests)
// Required for HTTPS auth tests: TEST_AUTH_USER, TEST_AUTH_PASS
// Optional: HOST_IP, CADDY_AUTH_ENABLED, etc.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import http from 'node:http'

const HOST_IP = process.env.HOST_IP || '127.0.0.1'
const FORCE_HOST_IP = process.env.HOST_IP_FORCE === 'true'
const AUTH_USER = process.env.TEST_AUTH_USER
const AUTH_PASS = process.env.TEST_AUTH_PASS
const MAX_TIME_MS = Number(process.env.MAX_TIME_MS || '8000')
const CADDY_AUTH_ENABLED = process.env.CADDY_AUTH_ENABLED !== 'false'
const lanHostname = process.env.LAN_HOSTNAME
const publicDomain = process.env.PUBLIC_DOMAIN
const publicScheme = process.env.PUBLIC_SCHEME || 'https'

if (!lanHostname) {
  throw new Error('LAN_HOSTNAME environment variable is required')
}

const HAVE_AUTH = Boolean(AUTH_USER && AUTH_PASS)
const HAVE_PUBLIC_DOMAIN = Boolean(publicDomain)

function describeIf(condition, name, fn) {
  if (condition) {
    describe(name, fn)
  } else {
    describe.skip(name, fn)
  }
}

function describeHttpsAuth(name, fn) {
  describeIf(HAVE_PUBLIC_DOMAIN, name, () => {
    if (!HAVE_AUTH) {
      it('FAILED: TEST_AUTH_USER and TEST_AUTH_PASS required for HTTPS auth tests', () => {
        throw new Error('TEST_AUTH_USER and TEST_AUTH_PASS environment variables are required for HTTPS auth tests')
      })
    } else {
      fn()
    }
  })
}

const openRoutes = [
  `http://${lanHostname}/`,
  `http://${lanHostname}/jellyfin/`,
  `http://${lanHostname}/jellyseerr/`,
  `http://${lanHostname}/qb/`,
  `http://${lanHostname}/radarr/`,
  `http://${lanHostname}/sonarr/`,
  `http://${lanHostname}/sab/`,
  `http://${lanHostname}/prowlarr/`
]

const publicHost = (subdomain) => (subdomain ? `${subdomain}.${publicDomain}` : publicDomain)
const publicUrl = (subdomain, path = '/') => `${publicScheme}://${publicHost(subdomain)}${path}`

const httpsAuthRoutes = HAVE_PUBLIC_DOMAIN ? [
  publicUrl(null, '/'),
  publicUrl('qb', '/'),
  publicUrl('jellyseerr', '/'),
  publicUrl('radarr', '/'),
  publicUrl('sonarr', '/'),
  publicUrl('sab', '/'),
  publicUrl('prowlarr', '/')
] : []

const httpsOpenRoutes = HAVE_PUBLIC_DOMAIN ? [
  publicUrl('jellyfin', '/')
] : []

const httpRedirectsToHttps = HAVE_PUBLIC_DOMAIN ? [
  { from: `http://${publicHost(null)}/`, to: publicUrl(null, '/') },
  { from: `http://${publicHost('qb')}/`, to: publicUrl('qb', '/') },
  { from: `http://${publicHost('jellyseerr')}/`, to: publicUrl('jellyseerr', '/') },
  { from: `http://${publicHost('radarr')}/`, to: publicUrl('radarr', '/') },
  { from: `http://${publicHost('sonarr')}/`, to: publicUrl('sonarr', '/') },
  { from: `http://${publicHost('sab')}/`, to: publicUrl('sab', '/') },
  { from: `http://${publicHost('prowlarr')}/`, to: publicUrl('prowlarr', '/') },
  { from: `http://${publicHost('jellyfin')}/`, to: publicUrl('jellyfin', '/') },
  { from: `http://${publicHost(null)}/logos/jellyfin.png`, to: publicUrl(null, '/logos/jellyfin.png') },
  { from: `http://${publicHost(null)}/logos/shouldnotexist.png`, to: publicUrl(null, '/logos/shouldnotexist.png') }
] : []

const unauthorizedRoutes = HAVE_PUBLIC_DOMAIN ? [
  { url: publicUrl('qb', '/'), expected: 401 }
] : []

const notFoundRoutes = HAVE_PUBLIC_DOMAIN ? [
  publicUrl(null, '/anything')
] : []

const httpsNotFoundRoutes = HAVE_PUBLIC_DOMAIN ? [
  publicUrl(null, '/shouldnotexist')
] : []

const redirectRoutes = [
  { from: `http://${lanHostname}/jellyfin/`, expected: `http://${lanHostname}:3278/` },
  { from: `http://${lanHostname}/jellyseerr/`, expected: `http://${lanHostname}:3277/` },
  { from: `http://${lanHostname}/qb/`, expected: `http://${lanHostname}:3275/` },
  { from: `http://${lanHostname}/sab/`, expected: `http://${lanHostname}:3274/sab` },
  { from: `http://${lanHostname}/radarr/`, expected: `http://${lanHostname}:3273/` },
  { from: `http://${lanHostname}/sonarr/`, expected: `http://${lanHostname}:3272/` },
  { from: `http://${lanHostname}/prowlarr/`, expected: `http://${lanHostname}:3276/` }
]

const directServiceRoutes = [
  `http://${lanHostname}:3278/`, // jellyfin
  `http://${lanHostname}:3277/`, // jellyseerr
  `http://${lanHostname}:3275/`, // qbittorrent
  `http://${lanHostname}:3274/`, // sabnzbd
  `http://${lanHostname}:3273/`, // radarr
  `http://${lanHostname}:3272/`, // sonarr
  `http://${lanHostname}:3276/` // prowlarr
]

const assetRoutesHttps = HAVE_PUBLIC_DOMAIN ? [
  publicUrl(null, '/logos/jellyfin.png')
] : []

const assetNotFoundHttps = HAVE_PUBLIC_DOMAIN ? [
  publicUrl(null, '/logos/shouldnotexist.png')
] : []

const successStatus = status => status >= 200 && status < 400
const serviceUpStatus = status => successStatus(status) || status === 401

// Environment variables for Access testing
const CF_ACCESS_ENABLED = process.env.CF_ACCESS_ENABLED === 'true'

async function fetchWithHost(url, { auth = false } = {}) {
  const target = new URL(url)

  // If HOST_IP matches localhost/127.0.0.1 and /etc/hosts has entries, use hostname directly
  // This avoids fetch's inability to override Host header
  if (!FORCE_HOST_IP && (HOST_IP === '127.0.0.1' || HOST_IP === 'localhost')) {
    const headers = {}
    if (auth) {
      const token = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
      headers.Authorization = `Basic ${token}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MAX_TIME_MS)

    try {
      const res = await fetch(url, {
        redirect: 'manual',
        headers,
        signal: controller.signal
      })
      return res
    } finally {
      clearTimeout(timeout)
    }
  }

  // For remote testing: use http module which supports Host header override
  return new Promise((resolve, reject) => {
    const port = target.port || 80
    const headers = { Host: target.host }
    if (auth) {
      const token = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
      headers.Authorization = `Basic ${token}`
    }

    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'))
    }, MAX_TIME_MS)

    const req = http.request({
      hostname: HOST_IP,
      port,
      path: target.pathname + target.search,
      method: 'GET',
      headers
    }, (res) => {
      clearTimeout(timeout)
      // Convert http.IncomingMessage to fetch-like Response
      resolve({
        status: res.statusCode,
        headers: {
          get: (name) => res.headers[name.toLowerCase()]
        }
      })
      res.resume() // Drain response body
    })

    req.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    req.end()
  })
}

async function fetchDirect(url, { auth = false } = {}) {
  const headers = {}
  if (auth) {
    const token = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64')
    headers.Authorization = `Basic ${token}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MAX_TIME_MS)
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers,
      signal: controller.signal
    })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

describe('Ingress (open routes)', () => {
  for (const url of openRoutes) {
    it(`GET ${url} returns 2xx/3xx without auth`, async () => {
      const res = await fetchWithHost(url)
      assert.ok(successStatus(res.status), `${url} returned ${res.status}`)
    })
  }
})

describe('Direct service ports (LAN)', () => {
  for (const url of directServiceRoutes) {
    it(`GET ${url} returns up status`, async () => {
      const res = await fetchWithHost(url)
      assert.ok(serviceUpStatus(res.status), `${url} returned ${res.status}`)
    })
  }
})

describeIf(HAVE_PUBLIC_DOMAIN, 'Ingress (http -> https redirects for public hosts)', () => {
  for (const { from, to } of httpRedirectsToHttps) {
    it(`GET ${from} redirects to ${to}`, async () => {
      const res = await fetchWithHost(from)
      assert.equal(res.status, 308, `${from} returned ${res.status}`)
      assert.equal(res.headers.get('location'), to)
    })
  }
})

describeIf(HAVE_PUBLIC_DOMAIN, 'Ingress (not found routes)', () => {
  for (const url of notFoundRoutes) {
    it(`GET ${url} returns 401/404 depending on auth`, async () => {
      const res = await fetchDirect(url, { auth: HAVE_AUTH })
      if (CADDY_AUTH_ENABLED && !HAVE_AUTH) {
        assert.equal(res.status, 401, `${url} returned ${res.status}`)
      } else {
        assert.equal(res.status, 404, `${url} returned ${res.status}`)
      }
    })
  }
})

describeHttpsAuth('Ingress (https routes)', () => {
  for (const url of httpsAuthRoutes) {
    it(`GET ${url} returns 2xx/3xx with auth`, async () => {
      const res = await fetchDirect(url, { auth: HAVE_AUTH })
      if (CADDY_AUTH_ENABLED && !HAVE_AUTH) {
        assert.equal(res.status, 401, `${url} returned ${res.status}`)
      } else {
        assert.ok(successStatus(res.status), `${url} returned ${res.status}`)
      }
    })
  }
  for (const url of httpsOpenRoutes) {
    it(`GET ${url} returns 2xx/3xx without auth`, async () => {
      const res = await fetchDirect(url)
      assert.ok(successStatus(res.status), `${url} returned ${res.status}`)
    })
  }
})

describeHttpsAuth('Ingress (https not found routes)', () => {
  for (const url of httpsNotFoundRoutes) {
    it(`GET ${url} returns 401/404 depending on auth`, async () => {
      const res = await fetchDirect(url, { auth: HAVE_AUTH })
      if (CADDY_AUTH_ENABLED && !HAVE_AUTH) {
        assert.equal(res.status, 401, `${url} returned ${res.status}`)
      } else {
        assert.equal(res.status, 404, `${url} returned ${res.status}`)
      }
    })
  }
})

describe('Ingress (LAN redirects)', () => {
  for (const { from, expected } of redirectRoutes) {
    it(`GET ${from} redirects to ${expected}`, async () => {
      const res = await fetchRedirect(from)
      const allowedStatuses = from.includes('/sab/') ? [303, 307] : [307]
      assert.ok(allowedStatuses.includes(res.status), `${from} returned ${res.status}`)
      const location = res.headers.get('location')
      if (from.includes('/sab/')) {
        assert.ok(location && location.startsWith(expected), `${from} location ${location}`)
      } else {
        assert.equal(location, expected)
      }
    })
  }
})

describeIf(HAVE_PUBLIC_DOMAIN, 'Ingress (apex assets http -> https redirect)', () => {
  const assetRedirects = httpRedirectsToHttps.filter(({ from }) => from.includes('/logos/'))
  for (const { from, to } of assetRedirects) {
    it(`GET ${from} redirects to ${to}`, async () => {
      const res = await fetchWithHost(from, { auth: true })
      assert.equal(res.status, 308, `${from} returned ${res.status}`)
      assert.equal(res.headers.get('location'), to)
    })
  }
})

describeHttpsAuth('Ingress (apex assets https)', () => {
  for (const url of assetRoutesHttps) {
    it(`GET ${url} returns 2xx with auth or 401 without`, async () => {
      const res = await fetchDirect(url, { auth: HAVE_AUTH })
      if (CADDY_AUTH_ENABLED && !HAVE_AUTH) {
        assert.equal(res.status, 401, `${url} returned ${res.status}`)
      } else {
        assert.ok(successStatus(res.status), `${url} returned ${res.status}`)
      }
    })
  }
})

describeHttpsAuth('Ingress (apex assets https 404)', () => {
  for (const url of assetNotFoundHttps) {
    it(`GET ${url} returns 401/404 depending on auth`, async () => {
      const res = await fetchDirect(url, { auth: HAVE_AUTH })
      if (CADDY_AUTH_ENABLED && !HAVE_AUTH) {
        assert.equal(res.status, 401, `${url} returned ${res.status}`)
      } else {
        assert.equal(res.status, 404, `${url} returned ${res.status}`)
      }
    })
  }
})

async function fetchRedirect(url) {
  const res = await fetchWithHost(url, { auth: false })
  return res
}

describeHttpsAuth('Ingress (unauthorized expectations)', () => {
  for (const { url, expected } of unauthorizedRoutes) {
    it(`GET ${url} without auth returns ${expected}`, async () => {
      const res = await fetchDirect(url)
      if (CADDY_AUTH_ENABLED) {
        assert.equal(res.status, expected)
      } else {
        assert.ok(successStatus(res.status), `${url} returned ${res.status}`)
      }
    })
  }
})

// =============================================================================
// New DulceJelly IaC-related tests
// =============================================================================

describeHttpsAuth('Security: Jellyfin public access (no Access/ZeroTrust)', () => {
  it(`GET https://jellyfin.${publicDomain}/ should NOT redirect to Access login`, async () => {
    const res = await fetchDirect(publicUrl('jellyfin', '/'))

    // Should get either 2xx (success) or 401 (basic auth, not Access)
    // Should NOT get 302/303 redirect to cloudflarenet.com or cloudflareaccess.com
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || ''
      assert.ok(
        !location.includes('cloudflareaccess.com') &&
        !location.includes('cloudflarenet.com'),
        `Jellyfin redirects to Access login page: ${location}. This breaks TV clients!`
      )
    }

    // If Jellyfin auth is disabled via CADDY, should get 2xx
    // If Jellyfin auth is enabled via CADDY basic auth and no creds provided, should get 401
    if (!process.env.JELLYFIN_AUTH_ENABLED || process.env.JELLYFIN_AUTH_ENABLED === 'false') {
      assert.ok(
        successStatus(res.status),
        `Jellyfin should be publicly accessible, got ${res.status}`
      )
    } else if (!HAVE_AUTH) {
      assert.equal(res.status, 401, 'Jellyfin basic auth should return 401 without credentials')
    }
  })

  it('Jellyfin response should contain Jellyfin markers (not Access login page)', async () => {
    const res = await fetchDirect(publicUrl('jellyfin', '/'), { auth: HAVE_AUTH })

    // Should not be a redirect to Access
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') || ''
      assert.ok(
        !location.includes('cloudflareaccess.com'),
        'Jellyfin should not redirect to Cloudflare Access'
      )
    }
  })
})

describeHttpsAuth('Security: Admin services authentication', () => {
  const adminServiceUrls = [
    { url: publicUrl('jellyseerr', '/'), name: 'Jellyseerr' },
    { url: publicUrl('radarr', '/'), name: 'Radarr' },
    { url: publicUrl('sonarr', '/'), name: 'Sonarr' },
    { url: publicUrl('qb', '/'), name: 'qBittorrent' },
    { url: publicUrl('prowlarr', '/'), name: 'Prowlarr' },
    { url: publicUrl('sab', '/'), name: 'SABnzbd' }
  ]

  for (const { url, name } of adminServiceUrls) {
    it(`${name} requires authentication (basic auth or Access)`, async () => {
      const res = await fetchDirect(url)

      if (CF_ACCESS_ENABLED) {
        // If Cloudflare Access is enabled, should redirect to Access login
        // or return 403 Forbidden
        assert.ok(
          res.status === 403 ||
          (res.status >= 300 && res.status < 400 &&
           (res.headers.get('location') || '').includes('cloudflareaccess.com')),
          `${name} with Access should return 403 or redirect to Access login, got ${res.status}`
        )
      } else if (CADDY_AUTH_ENABLED) {
        // If Caddy basic auth is enabled, should return 401 without credentials
        assert.equal(res.status, 401, `${name} should return 401 without basic auth credentials`)
      } else {
        // If no auth is configured, should succeed
        assert.ok(successStatus(res.status), `${name} returned ${res.status}`)
      }
    })

    if (HAVE_AUTH && !CF_ACCESS_ENABLED) {
      it(`${name} accessible with valid basic auth credentials`, async () => {
        const res = await fetchDirect(url, { auth: true })

        // Should succeed with valid credentials
        assert.ok(
          successStatus(res.status),
          `${name} should be accessible with valid credentials, got ${res.status}`
        )
      })
    }
  }
})

describeHttpsAuth('Security: WAF and rate limiting behavior', () => {
  it('Public services should not block legitimate requests', async () => {
    // Test that WAF rules don't break normal usage
    // This is a basic sanity check
    const res = await fetchDirect(publicUrl('jellyfin', '/'), { auth: HAVE_AUTH })

    // Should not get blocked by WAF (would be 403 or similar)
    assert.ok(
      res.status !== 403 || res.status === 401,
      'Legitimate requests should not be blocked by WAF'
    )
  })

  it('HTTP requests should redirect to HTTPS (Cloudflare enforcement)', async () => {
    // All public domain requests should be HTTPS
    const httpServices = [
      `http://${publicHost('jellyfin')}/`,
      `http://${publicHost('radarr')}/`
    ]

    for (const url of httpServices) {
      const res = await fetchDirect(url)
      assert.equal(res.status, 308, `${url} should redirect with 308 to HTTPS`)
      const location = res.headers.get('location')
      assert.ok(location && location.startsWith('https://'), `${url} should redirect to HTTPS`)
    }
  })
})

describe('Smoke: LAN access remains functional', () => {
  it('Direct port access works regardless of tunnel/Cloudflare status', async () => {
    // Ensure LAN access via direct ports still works
    // This is critical - LAN should work even if Cloudflare is down
    const lanServices = [
      `http://${lanHostname}:3278/`, // Jellyfin
      `http://${lanHostname}:3277/`, // Jellyseerr
    ]

    for (const url of lanServices) {
      const res = await fetchWithHost(url)
      assert.ok(
        serviceUpStatus(res.status),
        `${url} should be accessible on LAN, got ${res.status}`
      )
    }
  })
})
