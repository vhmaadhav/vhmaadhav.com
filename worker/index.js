// Cloudflare Worker: www redirect, GET /api/leetcode (cached), static assets.
// Everything else is served from dist/ through the ASSETS binding.

import { fetchLeetcode } from '../lib/leetcode.mjs';

const USERNAME = 'vhmaadhav'; // keep in step with profile.leetcodeHandle in dist/content.json
const APEX_HOST = 'vhmaadhav.com';
const WWW_HOST = 'www.vhmaadhav.com';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === WWW_HOST) {
      url.hostname = APEX_HOST;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/api/leetcode') {
      return leetcode(request, ctx);
    }

    return env.ASSETS.fetch(request);
  }
};

async function leetcode(request, ctx) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: 'GET' }
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchLeetcode(USERNAME, { signal: AbortSignal.timeout(8000) });
    const response = new Response(JSON.stringify(data), {
      headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=21600' }
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error(`leetcode: ${err.message}`);
    return new Response(JSON.stringify({ error: 'leetcode unavailable' }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' }
    });
  }
}
