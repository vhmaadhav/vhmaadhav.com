// Prerender for the portfolio. No dependencies.
//
//   node build.mjs
//
// Reads dist/content.json and src/index.template.html, and writes:
//   dist/index.html   static semantic content, SEO head, JSON-LD
//   dist/robots.txt   crawl rules, including AI crawlers, plus the sitemap line
//   dist/sitemap.xml  home URL with lastmod
//   dist/llms.txt     llmstxt.org summary for LLM crawlers
//   dist/llms-full.txt  every fact in content.json as markdown
//   dist/resume.json    JSON Resume (jsonresume.org/schema)
//   dist/for-agents.txt plain facts with the link that checks each one
//   dist/leetcode.json  LeetCode snapshot (network; kept if the fetch fails)
// Every absolute URL comes from site.url in content.json. The agent files
// and the JSON-LD graph are built by lib/agents.mjs.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLeetcode } from './lib/leetcode.mjs';
import { agentFiles } from './lib/agents.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, 'dist');

// render.js is UMD, so require() gives the same functions the browser uses.
const require = createRequire(import.meta.url);
const SR = require(path.join(distDir, 'render.js'));
const { esc } = SR;

const data = JSON.parse(readFileSync(path.join(distDir, 'content.json'), 'utf8'));
const { site, profile } = data;
if (!site || !site.url) throw new Error('content.json: site.url is required');

const base = site.url.replace(/\/+$/, '');
const home = `${base}/`;
const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0')
].join('-');

const hasPng = existsSync(path.join(distDir, 'og.png'));
const ogImage = `${base}/${hasPng ? 'og.png' : 'og.svg'}`;
const ogType = hasPng ? 'image/png' : 'image/svg+xml';
const ogAlt = `${profile.name}, ${profile.role}`;

// LeetCode snapshot for the page's heatmap. A failed fetch keeps the last file.
async function writeLeetcode() {
  const file = path.join(distDir, 'leetcode.json');
  try {
    const snapshot = await fetchLeetcode(profile.leetcodeHandle || profile.handle, {
      signal: AbortSignal.timeout(15000)
    });
    writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`leetcode: ok, ${snapshot.solved.all} solved, ${Object.keys(snapshot.days).length} active days`);
  } catch (err) {
    const kept = existsSync(file) ? 'kept the existing dist/leetcode.json' : 'no dist/leetcode.json yet';
    console.log(`leetcode: fetch failed (${err.message}); ${kept}`);
  }
}
await writeLeetcode();

function seoHead() {
  return [
    `<title>${esc(site.title)}</title>`,
    `<meta name="description" content="${esc(site.description)}">`,
    `<meta name="author" content="${esc(profile.name)}">`,
    '<meta name="robots" content="index,follow">',
    `<link rel="canonical" href="${esc(home)}">`,
    '<meta property="og:type" content="profile">',
    `<meta property="og:site_name" content="${esc(profile.name)}">`,
    `<meta property="og:title" content="${esc(site.title)}">`,
    `<meta property="og:description" content="${esc(site.description)}">`,
    `<meta property="og:url" content="${esc(home)}">`,
    `<meta property="og:image" content="${esc(ogImage)}">`,
    `<meta property="og:image:type" content="${ogType}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(site.title)}">`,
    `<meta name="twitter:description" content="${esc(site.description)}">`,
    `<meta name="twitter:image" content="${esc(ogImage)}">`
  ].join('\n  ');
}

const agent = agentFiles({ data, now, today, ogImage, durationLabel: SR.durationLabel, distDir });

const template = readFileSync(path.join(here, 'src', 'index.template.html'), 'utf8');
const html = template
  .replace('{{SEO}}', () => seoHead())
  .replace('{{JSON_LD}}', () => agent.jsonLd)
  .replace('{{CONTENT}}', () => SR.content(data, { now }));

const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot',
  'PerplexityBot', 'Google-Extended', 'Applebot-Extended'
];
const robots = [
  'User-agent: *',
  'Allow: /',
  '',
  ...AI_BOTS.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', '']),
  `Sitemap: ${base}/sitemap.xml`,
  ''
].join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${esc(home)}</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`;

writeFileSync(path.join(distDir, 'index.html'), html);
writeFileSync(path.join(distDir, 'robots.txt'), robots);
writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap);
writeFileSync(path.join(distDir, 'llms.txt'), agent.llms);
writeFileSync(path.join(distDir, 'llms-full.txt'), agent.llmsFull);
writeFileSync(path.join(distDir, 'resume.json'), agent.resumeJson);
writeFileSync(path.join(distDir, 'for-agents.txt'), agent.forAgents);
console.log(`built ${home} (og image: ${ogImage}, lastmod ${today})`);
