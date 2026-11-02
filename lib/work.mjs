// Static case-study pages and the 404 page.
//
//   content/work/<slug>.json  -> dist/work/<slug>/index.html (markup: src/work.template.html)
//   src/404.template.html     -> dist/404.html (copied; the 404 has no per-page data)
//
// Called from build.mjs, which passes its escape function and absolute URLs.
// Returns the canonical URLs of the case-study pages for the sitemap.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildWork({ distDir, base, esc, ogImage, ogType, profile }) {
  const template = readFileSync(path.join(root, 'src', 'work.template.html'), 'utf8');
  const dir = path.join(root, 'content', 'work');
  const pages = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')))
    .sort((a, b) => a.order - b.order);

  const personId = `${base}/#person`;
  const urlOf = (slug) => `${base}/work/${slug}/`;

  pages.forEach((page, i) => {
    assertNoPlaceholders(page);
    const prev = pages[i - 1];
    const next = pages[i + 1];
    const url = urlOf(page.slug);
    const title = `${page.title} — case study · ${profile.name}`;

    const og = [
      '<meta property="og:type" content="article">',
      `<meta property="og:site_name" content="${esc(profile.name)}">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(page.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${esc(ogImage)}">`,
      `<meta property="og:image:type" content="${ogType}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${esc(`${page.title}, case study by ${profile.name}`)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(page.description)}">`,
      `<meta name="twitter:image" content="${esc(ogImage)}">`
    ].join('\n  ');

    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CreativeWork',
          '@id': `${url}#work`,
          url,
          name: page.title,
          description: page.description,
          inLanguage: 'en',
          keywords: page.tags.map((t) => (typeof t === 'string' ? t : t.text)),
          author: { '@id': personId }
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: profile.name, item: `${base}/` },
            { '@type': 'ListItem', position: 2, name: 'Work', item: `${base}/#work` },
            { '@type': 'ListItem', position: 3, name: page.title, item: url }
          ]
        }
      ]
    };
    const jsonLd = `<script type="application/ld+json">\n${jsonSafe(graph)}\n  </script>`;

    const html = template
      .replace('{{TITLE}}', () => esc(title))
      .replace('{{DESCRIPTION}}', () => esc(page.description))
      .replace('{{AUTHOR}}', () => esc(profile.name))
      .replace('{{CANONICAL}}', () => esc(url))
      .replace('{{OG}}', () => og)
      .replace('{{JSON_LD}}', () => jsonLd)
      .replace('{{CRUMBS}}', () => crumbs(page, esc))
      .replace('{{HEADER}}', () => header(page, esc))
      .replace('{{SECTIONS}}', () => page.sections.map((s) => section(s, esc)).join('\n    '))
      .replace('{{EVIDENCE}}', () => evidence(page, esc))
      .replace('{{NAV}}', () => nav(prev, next, esc));

    const out = path.join(distDir, 'work', page.slug);
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'index.html'), html);
  });

  copyFileSync(path.join(root, 'src', '404.template.html'), path.join(distDir, '404.html'));
  console.log(`work: ${pages.length} case studies, 404 page`);
  return pages.map((page) => urlOf(page.slug));
}

// JSON-LD: escape characters that could close the script tag. The escapes are valid JSON.
function jsonSafe(value) {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

// Content must never carry bracket placeholders or template leftovers.
function assertNoPlaceholders(page) {
  const strings = [];
  const walk = (node) => {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(page);
  for (const text of strings) {
    if (/[[\]]|\{\{/.test(text)) throw new Error(`content/work/${page.slug}.json: placeholder text in "${text}"`);
  }
}

function crumbs(page, esc) {
  return `<nav class="crumbs" aria-label="Breadcrumb">
      <span><a href="/">~/vhmaadhav</a> / <a href="/#work">work</a> / <span class="here">${esc(page.slug)}</span></span>
      <a href="/#work">← all work</a>
    </nav>`;
}

function header(page, esc) {
  const tags = page.tags
    .map((t) => (typeof t === 'string'
      ? `<li class="pill">${esc(t)}</li>`
      : `<li class="pill${t.accent ? ' hl' : ''}">${esc(t.text)}</li>`))
    .join('');
  const facts = page.facts
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
  return `<header class="wp-head">
      <ul class="wp-tags">${tags}</ul>
      <h1>${esc(page.title)}</h1>
      <p class="wp-lede">${esc(page.lede)}</p>
      <dl class="wp-facts">${facts}</dl>
    </header>`;
}

function section(s, esc) {
  const id = `wp-${s.id}`;
  return `<section class="wp-section" aria-labelledby="${id}">
      <div class="sec-head"><h2 id="${id}"><span class="prompt" aria-hidden="true">$</span> ${esc(s.command)}</h2></div>
      ${s.blocks.map((b) => block(b, esc)).join('\n      ')}
    </section>`;
}

// Block types: p, h3, note, list, table, diagram.
function block(b, esc) {
  switch (b.type) {
    case 'p':
      return `<p class="wp-p">${esc(b.text)}</p>`;
    case 'h3':
      return `<h3 class="wp-sub">${esc(b.text)}</h3>`;
    case 'note':
      return `<p class="wp-note">${esc(b.text)}</p>`;
    case 'list':
      return `<ul class="wp-list">${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'table': {
      const head = b.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
      const rows = b.rows
        .map((r) => `<tr>${r.map((c, i) => (i === 0
          ? `<th scope="row">${esc(c)}</th>`
          : `<td${i === 1 ? ' class="wp-val"' : ''}>${esc(c)}</td>`)).join('')}</tr>`)
        .join('');
      return `<div class="wp-table-wrap"><table class="wp-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'diagram': {
      // « » mark the parts of the drawing shown in the accent colour.
      const art = esc(b.art.join('\n'))
        .replace(/«/g, '<span class="wp-hit">')
        .replace(/»/g, '</span>');
      return `<figure class="wp-figure"><pre class="wp-diagram" aria-hidden="true">${art}</pre><figcaption>${esc(b.caption)}</figcaption></figure>`;
    }
    default:
      throw new Error(`unknown block type: ${b.type}`);
  }
}

function evidence(page, esc) {
  const links = (page.links || [])
    .map((l) => `<a class="btn ${l.primary ? 'btn-primary' : 'btn-outline'}" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join('');
  const note = page.codeNote ? `<p class="wp-note">${esc(page.codeNote)}</p>` : '';
  return `<section class="wp-evidence" aria-label="Evidence">
      ${links ? `<div class="wp-links">${links}</div>` : ''}
      ${note}
    </section>`;
}

function nav(prev, next, esc) {
  const back = prev ? `<a href="/work/${esc(prev.slug)}/" rel="prev">← prev: ${esc(prev.slug)}</a>` : '';
  const forward = next ? `<a href="/work/${esc(next.slug)}/" rel="next">next: ${esc(next.slug)} →</a>` : '';
  return `<nav class="wp-nav" aria-label="More work">
      <a href="/">← back home</a>
      <span class="wp-pn">${back}${forward}</span>
    </nav>`;
}
