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

  function linkAttrs(url) {
    return url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"';
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

  // Braille dotted hairline (U+2824 = dots 3 and 6, the middle row). Wide enough
  // for any column; CSS clips it. Pure text, so it works without JavaScript.
  const RULE_CHARS = 180;
  function rule() {
    return `<div class="rule" aria-hidden="true">${'⠤'.repeat(RULE_CHARS)}</div>`;
  }

  function section(id, title, body, aside = '') {
    return `
      <section class="section" aria-labelledby="${id}-title">
        <header class="section-head">
          <h2 id="${id}-title"><span class="prompt" aria-hidden="true">$</span> ${esc(title)}</h2>
          ${aside ? `<span class="aside">${esc(aside)}</span>` : ''}
        </header>
        ${rule()}
        ${body}
      </section>`;
  }

  function hero(profile) {
    const links = profile.links
      .map((link) => `<a href="${esc(link.url)}"${linkAttrs(link.url)}>${esc(link.label)}</a>`)
      .join('');
    return `
      <header class="hero">
        <pre id="hero-cloud" class="cloud" aria-hidden="true"></pre>
        <div>
          <h1>${esc(profile.name)}</h1>
          <p class="role">${esc(profile.role)}</p>
        </div>
        <div class="bio">${profile.bio.map((line) => `<p>${esc(line)}</p>`).join('')}</div>
        <p class="location">${esc(profile.location)}</p>
        <nav class="links" aria-label="links">${links}</nav>
      </header>`;
  }

  function experience(list, now) {
    const earliest = list.map((job) => job.start).sort()[0];
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
    return section('experience', 'experience',
      `<ul class="list">${items}</ul>`,
      `${list.length} roles · since ${earliest.split('-')[0]}`);
  }

  function wins(list) {
    const items = list.map((win) => {
      const iso = isoFromDate(win.date);
      const date = iso ? time(iso, win.date) : esc(win.date);
      return `
      <li class="item">
        <div class="item-head">
          <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="event">${esc(win.event)}</span></p>
          <p class="dates">${date}</p>
        </div>
        <p class="item-body result${win.highlight ? ' hl' : ''}">${esc(win.result)}</p>
      </li>`;
    }).join('');
    return section('wins', 'wins', `<ul class="list">${items}</ul>`);
  }

  function projects(list, more = []) {
    const items = list.map((project) => {
      const repo = project.url
        ? `<span class="sep" aria-hidden="true"> · </span><a class="link" href="${esc(project.url)}"${linkAttrs(project.url)}>view repo →</a>`
        : '';
      return `
        <li class="item">
          <article>
            <div class="item-head">
              <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(project.title)}</span></p>
              ${project.tag ? `<span class="pill">${esc(project.tag)}</span>` : ''}
            </div>
            <p class="item-body what">${esc(project.what)}</p>
            <p class="item-body proof">${esc(project.proof)}${repo}</p>
          </article>
        </li>`;
    }).join('');
    const moreLinks = (more || []).map((repo) =>
      `<a href="${esc(repo.url)}"${linkAttrs(repo.url)}>${esc(repo.name)}</a>`).join(' · ');
    const moreLine = moreLinks
      ? `<p class="more-projects"><span class="muted">also on github:</span> ${moreLinks}</p>`
      : '';
    return section('projects', 'projects', `<ul class="list">${items}</ul>${moreLine}`);
  }

  function education(list) {
    const items = list.map((entry) => {
      const dates = entry.dates
        ? entry.dates.split(' – ').map((part) => {
          const iso = isoFromDate(part);
          return iso ? time(iso, part.trim()) : esc(part);
        }).join(' – ')
        : '';
      return `
      <li class="item">
        <div class="item-head">
          <p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(entry.title)}</span></p>
          ${entry.dates ? `<p class="dates">${dates}</p>` : ''}
        </div>
        ${entry.subtitle ? `<p class="item-body">${esc(entry.subtitle)}</p>` : ''}
      </li>`;
    }).join('');
    return section('education', 'education', `<ul class="list">${items}</ul>`);
  }

  function skills(groups) {
    const body = groups.map((group) => {
      const chips = group.items.map(([label, icon]) => `
        <li class="chip">${icon ? `<i class="${esc(icon)}" aria-hidden="true"></i>` : ''}<span>${esc(label)}</span></li>`).join('');
      return `
        <div class="skill-group">
          <p class="skill-label">${esc(group.group)}</p>
          <ul class="chips">${chips}</ul>
        </div>`;
    }).join('');
    return section('skills', 'skills', `<div class="skill-groups">${body}</div>`);
  }

  function credentials(list) {
    const items = list.map((text) => `
      <li class="item"><p class="item-title"><span class="marker" aria-hidden="true">&gt;</span><span class="name">${esc(text)}</span></p></li>`).join('');
    return section('credentials', 'credentials', `<ul class="list">${items}</ul>`);
  }

  // The heatmaps are the only parts filled in by app.js. Without JavaScript the
  // link below is what a reader gets instead.
  function githubSection(username) {
    const profileUrl = `https://github.com/${encodeURIComponent(username)}`;
    return section('github', 'github',
      `<div id="contributions" data-handle="${esc(username)}"><p class="muted">contribution heatmap needs javascript. <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>view activity on github →</a></p></div>`,
      `@${username}`);
  }

  function leetcodeSection(username) {
    const profileUrl = `https://leetcode.com/u/${encodeURIComponent(username)}/`;
    return section('leetcode', 'leetcode',
      `<div id="leetcode" data-handle="${esc(username)}"><p class="muted">leetcode heatmap needs javascript. <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>view on leetcode →</a></p></div>`,
      `@${username}`);
  }

  // One quiet line above the footer. Not a section: no heading and no rule.
  function quip(text) {
    return `
      <p class="quip"><span class="marker" aria-hidden="true">&gt;</span><span>${esc(text)}</span></p>`;
  }

  function footer(name, now) {
    return `
      <footer class="footer">
        <pre id="footer-cloud" class="footer-cloud" aria-hidden="true"></pre>
        <p>© ${now.getFullYear()} ${esc(name)} · built by hand, no framework</p>
      </footer>`;
  }

  /*
   * Full page body (everything inside <main id="portfolio">). Pure function of
   * the content data and the date, so build.mjs output matches the browser.
   */
  function content(data, options = {}) {
    const now = options.now || new Date();
    return [
      hero(data.profile),
      experience(data.experience, now),
      wins(data.wins),
      projects(data.projects, data.moreProjects),
      education(data.education),
      skills(data.skills),
      credentials(data.credentials),
      githubSection(data.profile.handle),
      leetcodeSection(data.profile.leetcodeHandle || data.profile.handle),
      data.profile.quip ? quip(data.profile.quip) : '',
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
