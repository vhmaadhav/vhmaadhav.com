/*
 * Shared markup renderer for the portfolio.
 *
 * Used in two places so they always agree:
 *   - build.mjs (Node) calls content() to prerender dist/index.html;
 *   - the browser loads this file before app.js, which only refreshes the
 *     experience durations after the static page is in place.
 *
 * UMD: a CommonJS module under Node, a global `SiteRender` in the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SiteRender = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // New tab for external links and PDFs. In-site pages, fragments and mailto stay in the tab.
  function linkAttrs(url) {
    return /^https?:\/\//.test(url) || /\.pdf$/i.test(url)
      ? ' target="_blank" rel="noopener noreferrer"'
      : '';
  }

  function monthLabel(ym) {
    const [year, month] = ym.split('-');
    return `${MONTHS[Number(month) - 1]} ${year}`;
  }

  // "Sep 2026" -> "2026-09", "2026" -> "2026", anything else -> null.
  function isoFromDate(text) {
    const value = String(text).trim();
    const m = /^([A-Za-z]{3})[a-z]* (\d{4})$/.exec(value);
    if (m) {
      const idx = MONTHS.indexOf(m[1].toLowerCase());
      if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
    }
    return /^\d{4}$/.test(value) ? value : null;
  }

  function time(iso, label) {
    return `<time datetime="${esc(iso)}">${esc(label)}</time>`;
  }

  function monthsBetween(start, end, now) {
    const [sy, sm] = start.split('-').map(Number);
    const [ey, em] = end
      ? end.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1];
    return (ey - sy) * 12 + (em - sm) + 1;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function durationLabel(start, end, now = new Date()) {
    const total = monthsBetween(start, end, now);
    const years = Math.floor(total / 12);
    const months = total % 12;
    const parts = [];
    if (years) parts.push(plural(years, 'year'));
    if (months) parts.push(plural(months, 'month'));
    return parts.join(', ') || 'under a month';
  }

  // A section: "$ name" heading, optional mono aside, then the body.
  function section(id, title, body, aside = '') {
    return `
        <section id="${id}" class="section" data-dot="${esc(id.toUpperCase())}" aria-labelledby="${id}-title">
          <header class="sec-head">
            <h2 id="${id}-title"><span class="prompt" aria-hidden="true">$</span> ${esc(title)}</h2>
            ${aside ? `<p class="aside">${esc(aside)}</p>` : ''}
          </header>
          ${body}
        </section>`;
  }

  // Top bar: handle on the left, four landmarks on the right.
  function topbar(profile) {
    const resume = profile.links.find((l) => l.label === 'resume');
    const items = [
      '<a href="#work">work</a>',
      '<a href="#awards">awards</a>',
      '<a href="#experience">experience</a>'
    ];
    if (resume) items.push(`<a class="nav-cv" href="${esc(resume.url)}"${linkAttrs(resume.url)}>résumé</a>`);
    return `
      <header class="topbar">
        <a class="brand" href="#top">~/${esc(profile.handle)}</a>
        <nav class="topnav" aria-label="Primary">${items.join('')}</nav>
      </header>`;
  }

  // Hero buttons, in this order. Email is the filled one, the résumé the outlined one.
  const BUTTONS = ['email', 'resume', 'github', 'linkedin', 'leetcode'];
  const BUTTON_TEXT = { email: 'email me', resume: 'résumé ↓', github: 'github', linkedin: 'linkedin', leetcode: 'leetcode' };
  const BUTTON_CLASS = { email: 'btn btn-primary', resume: 'btn btn-outline' };

  // The dot panel (dots.js) types the name above the intro; the h1 shows only until the panel is ready (CSS), so the name is never doubled and never missing.
  function hero(profile) {
    const buttons = BUTTONS
      .map((label) => profile.links.find((l) => l.label === label))
      .filter(Boolean)
      .map((link) => `<a class="${BUTTON_CLASS[link.label] || 'btn btn-quiet'}" href="${esc(link.url)}"${linkAttrs(link.url)}>${esc(BUTTON_TEXT[link.label] || link.label)}</a>`)
      .join('');
    const bio = profile.bio.map((line) => `<p class="lede">${esc(line)}</p>`).join('');
    const facts = (profile.panel && profile.panel.facts) || [];
    return `
      <section id="top" class="hero" aria-labelledby="hero-name">
        <div class="panel" data-panel data-name="${esc(profile.name)}" data-facts="${esc(facts.join('|'))}">
          <p class="panel-fb" aria-hidden="true">${esc(facts.join(' · '))}</p>
          <canvas aria-hidden="true"></canvas>
        </div>
        <div class="intro">
          <h1 id="hero-name">${esc(profile.name)}<span class="vh"> — ${esc(profile.role)}</span></h1>
          <p class="role-line">${esc(profile.role)}</p>
          ${bio}
          <nav class="buttons" aria-label="contact and links">${buttons}</nav>
          <p class="status-row">
            <span class="status"><span class="dot" aria-hidden="true"></span>${esc(profile.status)}</span>
            <span class="meta">${esc(profile.meta)}</span>
          </p>
        </div>
      </section>`;
  }

  // Three strongest proofs, one card each.
  function proofs(list) {
    const items = list.map((item) => {
      const link = item.link
        ? `<p class="proof-link"><a href="${esc(item.link.url)}"${linkAttrs(item.link.url)}>${esc(item.link.label)}</a></p>`
        : '';
      return `
          <li class="proof">
            <p class="proof-value">${esc(item.value)}</p>
            <p class="proof-text">${esc(item.text)}</p>
            ${item.note ? `<p class="proof-note">${esc(item.note)}</p>` : ''}
            ${link}
          </li>`;
    }).join('');
    return `
      <section class="proofs" data-dot="PROOF" aria-label="Strongest proof">
        <ul class="proof-list">${items}</ul>
      </section>`;
  }

  function projects(list, more = []) {
    const withCode = list.filter((p) => p.url).length;
    const cards = list.map((p) => {
      const role = p.role
        ? `<p class="my-role"><span class="k">my role · </span>${esc(p.role)}</p>`
        : '';
      const code = p.code
        ? (p.url
          ? `<a href="${esc(p.url)}"${linkAttrs(p.url)}>${esc(p.code)}</a>`
          : `<span class="code">${esc(p.code)}</span>`)
        : '';
      const study = p.caseStudy ? `<a href="${esc(p.caseStudy)}">read case study →</a>` : '';
      const foot = study || code ? `<div class="card-foot">${study}${code}</div>` : '';
      return `
          <li>
            <article class="card">
              <div class="card-head">
                <h3><span class="marker" aria-hidden="true">&gt;</span> ${esc(p.title)}</h3>
                ${p.tag ? `<span class="pill">${esc(p.tag)}</span>` : ''}
              </div>
              <p class="what">${esc(p.what)}</p>
              ${role}
              <p class="card-proof">${esc(p.proof)}</p>
              ${foot}
            </article>
          </li>`;
    }).join('');
    const repos = more.map((r) => `<a href="${esc(r.url)}"${linkAttrs(r.url)}>${esc(r.name)}</a>`).join(' · ');
    const also = repos ? `<p class="also"><span class="muted">also on github:</span> ${repos}</p>` : '';
    return section('work', 'ls work/', `<ul class="cards">${cards}</ul>${also}`,
      `${list.length} projects · ${withCode} with public code`);
  }

  // Work in progress: one row each, shaped like the experience items.
  function building(list) {
    if (!list.length) return '';
    const withCode = list.filter((p) => p.url).length;
    const items = list.map((p) => {
      const code = p.code
        ? (p.url
          ? `<a href="${esc(p.url)}"${linkAttrs(p.url)}>${esc(p.code)}</a>`
          : `<span class="muted">${esc(p.code)}</span>`)
        : '';
      return `
          <li class="item">
            <div class="item-head">
              <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(p.title)}</span></p>
              <p class="dates">${code}</p>
            </div>
            <p class="item-body">${esc(p.what)}</p>
            <p class="item-body result">${esc(p.status)}</p>
          </li>`;
    }).join('');
    const aside = `${list.length} in progress` + (withCode ? ` · ${withCode} with public code` : '');
    return section('now', 'currently working', `<ul class="list">${items}</ul>`, aside);
  }

  // The first FEATURED_WINS entries (in content.json order) get full entries;
  // the rest follow as a compact list, one line each.
  const FEATURED_WINS = 3;

  function awards(list) {
    const featured = list.slice(0, FEATURED_WINS);
    const rest = list.slice(FEATURED_WINS);
    const dateOf = (win) => {
      const iso = isoFromDate(win.date);
      return iso ? time(iso, win.date) : esc(win.date);
    };
    const items = featured.map((win) => {
      const source = win.source
        ? ` <a class="source" href="${esc(win.source)}"${linkAttrs(win.source)}>source ↗</a>`
        : '';
      return `
          <li class="item">
            <div class="item-head">
              <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="event">${esc(win.event)}</span></p>
              <p class="dates">${dateOf(win)}</p>
            </div>
            <p class="item-body result${win.highlight ? ' hl' : ''}">${esc(win.result)}${source}</p>
          </li>`;
    }).join('');
    const more = rest.map((win) => `
            <li>${esc(win.event)} — ${esc(win.result)} · ${dateOf(win)}</li>`).join('');
    const moreList = more ? `<ul class="more-awards">${more}</ul>` : '';
    return section('awards', 'awards',
      `<div class="awards-grid"><ul class="list">${items}</ul>${moreList}</div>`,
      '& selections');
  }

  function experience(list, now) {
    const items = list.map((job) => {
      const dates = `${time(job.start, monthLabel(job.start))} – ${job.end ? time(job.end, monthLabel(job.end)) : 'now'}`;
      const endAttr = job.end ? ` data-end="${esc(job.end)}"` : '';
      const duration = `<span data-start="${esc(job.start)}"${endAttr}>${esc(durationLabel(job.start, job.end, now))}</span>`;
      return `
          <li class="item">
            <div class="item-head">
              <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(job.role)}</span></p>
              <p class="dates">${dates}</p>
            </div>
            <p class="item-body">${esc(job.company)} · ${duration}</p>
            ${job.description ? `<p class="item-body">${esc(job.description)}</p>` : ''}
          </li>`;
    }).join('');
    return section('experience', 'experience', `<ul class="list">${items}</ul>`);
  }

  // Text-only rows: a label in the left column, the items in the right.
  function stack(groups) {
    const rows = groups.map((group) => `
            <div class="stack-row">
              <dt>${esc(group.group)}</dt>
              <dd>${group.items.map((item) => esc(item)).join(' · ')}</dd>
            </div>`).join('');
    return section('stack', 'stack', `<dl class="stack">${rows}</dl>`);
  }

  // Degree rows, shaped like the experience items.
  function education(list) {
    const items = list.map((edu) => `
          <li class="item">
            <div class="item-head">
              <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(edu.title)}</span></p>
              <p class="dates">${esc(edu.dates)}</p>
            </div>
            <p class="item-body">${esc(edu.subtitle)}</p>
          </li>`).join('');
    return section('education', 'education', `<ul class="list">${items}</ul>`);
  }

  // Certificates and memberships, one compact line each.
  function credentials(list) {
    const items = list.map((cred) => `
            <li><span class="marker" aria-hidden="true">&gt;</span><span>${esc(cred)}</span></li>`).join('');
    return section('credentials', 'credentials', `<ul class="creds">${items}</ul>`);
  }

  // The heatmaps are the only parts filled in by app.js. Without JavaScript the
  // link below is what a reader gets instead.
  function activity(username, leetcodeHandle) {
    const ghUrl = `https://github.com/${encodeURIComponent(username)}`;
    const lcUrl = `https://leetcode.com/u/${encodeURIComponent(leetcodeHandle)}/`;
    const body = `
          <div class="heat-pair">
            <div class="heat-block">
              <h3 class="caption">github</h3>
              <div id="contributions" data-handle="${esc(username)}"><p class="muted">contribution heatmap needs javascript. <a href="${esc(ghUrl)}"${linkAttrs(ghUrl)}>view activity on github →</a></p></div>
            </div>
            <div class="heat-block">
              <h3 class="caption">leetcode</h3>
              <div id="leetcode" data-handle="${esc(leetcodeHandle)}"><p class="muted">leetcode heatmap needs javascript. <a href="${esc(lcUrl)}"${linkAttrs(lcUrl)}>view on leetcode →</a></p></div>
            </div>
          </div>`;
    return section('activity', 'activity', body);
  }

  function offHours(item) {
    return section('off-hours', 'off-hours', `
          <div class="off-body">
            <p class="films">fav films · ${esc(item.films)}</p>
            <p class="quip-text">${esc(item.quip)}</p>
          </div>`);
  }

  function footer(name, now) {
    return `
      <footer class="footer">
        <p>© ${now.getFullYear()} ${esc(name)} · built by hand, no framework</p>
        <p>for agents → <a href="/for-agents.txt">/for-agents.txt</a> · <a href="/resume.json">/resume.json</a></p>
      </footer>`;
  }

  /*
   * Full page body (everything inside <main id="portfolio">). Pure function of
   * the content data and the date, so build.mjs output matches the browser.
   */
  function content(data, options = {}) {
    const now = options.now || new Date();
    const handle = data.profile.handle;
    return [
      topbar(data.profile),
      hero(data.profile),
      proofs(data.proofs || []),
      projects(data.projects, data.moreProjects),
      building(data.building || []),
      awards(data.wins),
      `<div class="duo">${experience(data.experience, now)}${stack(data.skills)}</div>`,
      `<div class="duo">${education(data.education || [])}${credentials(data.credentials || [])}</div>`,
      activity(handle, data.profile.leetcodeHandle || handle),
      offHours(data.offHours),
      footer(data.profile.name, now)
    ].join('');
  }

  /* Browser only: recompute durations for roles that have no end date. */
  function refreshDurations(scope, now = new Date()) {
    if (!scope) return;
    scope.querySelectorAll('[data-start]:not([data-end])').forEach((el) => {
      el.textContent = durationLabel(el.getAttribute('data-start'), null, now);
    });
  }

  return {
    esc,
    linkAttrs,
    monthLabel,
    durationLabel,
    content,
    refreshDurations
  };
});
