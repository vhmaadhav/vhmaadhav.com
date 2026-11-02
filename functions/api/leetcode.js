// GET /api/leetcode: LeetCode snapshot for the page's heatmap.
// Cloudflare Pages Function. The project root is maadhav-site and the output
// directory is dist, so this file is picked up from functions/ automatically.

import { fetchLeetcode } from '../../lib/leetcode.mjs';

const USERNAME = 'vhmaadhav'; // keep in step with profile.leetcodeHandle in dist/content.json
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchLeetcode(USERNAME, { signal: AbortSignal.timeout(8000) });
    const response = new Response(JSON.stringify(data), {
      headers: { ...HEADERS, 'Cache-Control': 'public, max-age=21600' }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: 'leetcode unavailable' }), {
      status: 502,
      headers: { ...HEADERS, 'Cache-Control': 'no-store' }
    });
  }
}
