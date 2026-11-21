// Cloudflare Worker: www redirect, security headers, GET /api/leetcode (cached,
// with stale and snapshot fallbacks), static assets.
// Everything else is served from dist/ through the ASSETS binding.

import { fetchLeetcode } from '../lib/leetcode.mjs';

const USERNAME = 'vhmaadhav'; // keep in step with profile.leetcodeHandle in dist/content.json
const APEX_HOST = 'vhmaadhav.com';
const WWW_HOST = 'www.vhmaadhav.com';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

const LEETCODE_PATH = '/api/leetcode';
const LEETCODE_FRESH_KEY = '/__cache/leetcode-fresh'; // caches.default keys, never served directly
const LEETCODE_STALE_KEY = '/__cache/leetcode-stale';
const FRESH_TTL = 21600; // 6h
const STALE_TTL = 604800; // 7d
const UPSTREAM_TIMEOUT_MS = 8000;

// Static files whose names are not hashed: a day of caching, then revalidation.
const DAY_CACHED = new Set(['/og.png', '/favicon.svg', '/Maadhav_VH_Resume.pdf']);
// Fonts and the hero poster never change under the same name (rename a file to change it): cache for a year.
const LONG_CACHED = 'public, max-age=31536000, immutable';
// HTML, CSS and JS are not hashed: HTML revalidates on every load (a cheap 304), CSS and JS may be reused for five minutes.
const HTML_POLICY = 'public, max-age=0, must-revalidate';
const CODE_POLICY = 'public, max-age=300, must-revalidate';

// Every external origin the page loads, checked against template, app.js, render.js and style.css.
// Cloudflare Web Analytics is injected at the edge, hence static.cloudflareinsights.com and cloudflareinsights.com.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self' https://github-contributions-api.jogruber.de https://cloudflareinsights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests'
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === WWW_HOST) {
      url.hostname = APEX_HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === LEETCODE_PATH) {
      return secure(await leetcode(request, env, ctx));
    }

    return secure(await assets(request, env));
  }
};

// Copies a response and adds the security headers. The source may have immutable headers.
function secure(res) {
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}

async function assets(request, env) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok) return res;
  const policy = cacheControl(new URL(request.url).pathname, res.headers.get('Content-Type') || '');
  if (!policy) return res;
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
  out.headers.set('Cache-Control', policy);
  return out;
}

// Returns the Cache-Control for a static file, or null to keep what the assets binding sends.
function cacheControl(pathname, contentType) {
  if (pathname.startsWith('/fonts/') || pathname.startsWith('/hero-poster.')) return LONG_CACHED;
  if (DAY_CACHED.has(pathname)) return 'public, max-age=86400';
  if (contentType.startsWith('text/html')) return HTML_POLICY;
  if (/^(text\/css|text\/javascript|application\/javascript)/.test(contentType)) return CODE_POLICY;
  return null;
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

// Order: fresh cache, live upstream (stored fresh and stale), stale cache, built snapshot, 502.
// Error responses are never cached.
async function leetcode(request, env, ctx) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'method not allowed' }, 405, { Allow: 'GET, HEAD' });
  }

  const cache = caches.default;
  const freshKey = new Request(new URL(LEETCODE_FRESH_KEY, request.url));
  const staleKey = new Request(new URL(LEETCODE_STALE_KEY, request.url));
  const cached = (body, maxAge) => new Response(body, {
    headers: { ...JSON_HEADERS, 'Cache-Control': `public, max-age=${maxAge}` }
  });

  const fresh = await cache.match(freshKey);
  if (fresh) return fresh;

  try {
    const body = JSON.stringify(await fetchLeetcode(USERNAME, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }));
    ctx.waitUntil(Promise.all([
      cache.put(freshKey, cached(body, FRESH_TTL)),
      cache.put(staleKey, cached(body, STALE_TTL))
    ]));
    return cached(body, FRESH_TTL);
  } catch (err) {
    console.error(`leetcode upstream: ${err.message}`);
  }

  try {
    const stale = await cache.match(staleKey);
    if (stale) {
      return new Response(await stale.text(), {
        headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=300', 'X-Data': 'stale' }
      });
    }
  } catch (err) {
    console.error(`leetcode stale: ${err.message}`);
  }

  try {
    const snapshot = await env.ASSETS.fetch(new Request(new URL('/leetcode.json', request.url)));
    if (snapshot.ok) {
      return new Response(await snapshot.text(), {
        headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=300', 'X-Data': 'snapshot' }
      });
    }
  } catch (err) {
    console.error(`leetcode snapshot: ${err.message}`);
  }

  return json({ error: 'leetcode unavailable' }, 502, { 'Cache-Control': 'no-store' });
}
