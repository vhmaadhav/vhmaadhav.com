/*
 * Shared markup renderer for the portfolio.
 *
 * Used in two places so they always agree:
 *   - build.mjs (Node) calls content() to prerender dist/index.html;
 *   - the browser loads this file before app.js, which only refreshes the
 *     experience durations after the static page is in place.
 *
 * Paintings are emitted as <div data-paint> holders with a <canvas>; paint.js
 * paints them, and style.css gives each palette a flat fallback.
 * The Worker's CSP forbids inline styles, so nothing here writes style="".
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
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Painting titles, one per palette (paint.js holds the colours).
  const PAINTINGS = {
    ember: 'Ember over Umber',
    umber: 'Umber, Black, Ochre',
    slate: 'Slate over Rust',
    plum: 'Plum with an Orange Seam',
    olive: 'Bone and Olive',
    ink: 'Indigo, Brick',
    maroon: 'Black on Maroon',
    tobacco: 'Tobacco and Gold'
  };
  const PAINT_ORDER = ['umber', 'slate', 'olive', 'ink', 'tobacco', 'plum', 'maroon', 'ember'];

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

  function monthName(ym) {
    const [year, month] = ym.split('-');
    return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
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

  const pad = (n) => String(n).padStart(2, '0');

  // A painting holder. paint.js fills the canvas; CSS shows the palette until then.
  function painting(name, comp, seed, extra = '') {
    return `<div class="paint p-${esc(name)}" data-paint="${esc(name)}" data-comp="${esc(comp)}" data-seed="${esc(seed)}"${extra}><canvas aria-hidden="true"></canvas></div>`;
  }

  // Chapter heading: a large serif title with an italic word, plus a small mono note.
  function chapter(id, title, italic, note = '', numeral = '') {
    return `
        <header class="chapter">
          ${numeral ? `<span class="rn mono" aria-hidden="true">${esc(numeral)}</span>` : ''}
          <h2 id="${id}-title" class="serif" data-axes data-split>${esc(title)}${italic ? ` <em>${esc(italic)}</em>` : ''}</h2>
          ${note ? `<p class="mono note">${esc(note)}</p>` : ''}
        </header>`;
  }

  function section(id, heading, body, cls = '') {
    return `
      <section id="${id}" class="section${cls ? ` ${cls}` : ''}" aria-labelledby="${id}-title">${heading}
        ${body}
      </section>`;
  }

  // "Maadhav V H" -> "Maadhav <i>V H</i>"
  function nameMarkup(name) {
    const [first, ...rest] = String(name).split(' ');
    return rest.length ? `${esc(first)} <i>${esc(rest.join(' '))}</i>` : esc(first);
  }

  // Quiet sticky navigation: shown by app.js after the hero and when scrolling up.
  const SNAV = [['work', 'Work'], ['now', 'Easel'], ['awards', 'Awards'], ['experience', 'Experience'], ['stack', 'Tools'], ['activity', 'Practice']];
  function snav(profile) {
    const links = SNAV.map(([id, label]) => `<li><a href="#${id}" data-s="${id}">${label}</a></li>`).join('');
    return `
      <nav class="snav" aria-label="Sections" data-snav>
        <div class="wrap snav-in">
          <a class="mark serif" href="#top" aria-label="${esc(profile.name)}, top of page">mvh</a>
          <ul>${links}</ul>
        </div>
        <i class="snav-bar" aria-hidden="true"></i>
      </nav>`;
  }

  function hero(profile) {
    const resume = profile.links.find((l) => l.label === 'resume');
    const nav = [
      '<a href="#work">Work</a>',
      '<a href="#now">Now</a>',
      '<a href="#awards">Awards</a>',
      resume ? `<a class="keep" href="${esc(resume.url)}"${linkAttrs(resume.url)}>Résumé</a>` : ''
    ].join('');
    const city = String(profile.location || '').split(',')[0];
    return `
      <header class="hero" id="top">
        ${painting('ember', 'hero', '0.37', ' data-live data-light data-develop="0"')}
        <div class="wrap hero-bar">
          <a class="mark serif" href="#top" data-axes="mark" aria-label="${esc(profile.name)}, top of page">mvh</a>
          <nav class="hero-nav" aria-label="Primary">${nav}</nav>
        </div>
        <div class="wrap hero-plaque-wrap" aria-hidden="true">
          <p class="plaque mono">Untitled (${esc(PAINTINGS.ember)}), 2026<br>painted in your browser, never quite the same twice</p>
        </div>
        <div class="wrap hero-name">
          <h1 class="serif" data-axes="name">${nameMarkup(profile.name)}<span class="sr"> — ${esc(profile.role)}</span></h1>
          <div class="hero-under">
            <p class="tagline">${esc(profile.tagline || profile.bio[0])}</p>
            <p class="meta mono">${(profile.heroMeta || [`${city}, India`]).map(esc).join('<br>')}</p>
          </div>
        </div>
      </header>`;
  }

  // Order of the contact links in the intro.
  const LINK_ORDER = ['email', 'github', 'linkedin', 'leetcode', 'resume'];
  const LINK_TEXT = { email: 'Email', github: 'GitHub', linkedin: 'LinkedIn', leetcode: 'LeetCode', resume: 'Résumé (PDF)' };

  function intro(profile) {
    const links = LINK_ORDER
      .map((label) => profile.links.find((l) => l.label === label))
      .filter(Boolean)
      .map((l) => `<a href="${esc(l.url)}"${linkAttrs(l.url)}>${esc(LINK_TEXT[l.label] || l.label)}</a>`)
      .join('');
    const lead = profile.lead ? `<p class="lead serif rise">${profile.lead.map((part, i) => (i % 2 ? `<em>${esc(part)}</em>` : esc(part))).join('')}</p>` : '';
    const notes = (profile.notes || profile.bio).map((line) => `<p>${esc(line)}</p>`).join('');
    return `
      <section class="intro" aria-label="About">
        ${lead}
        <div class="intro-side rise">
          ${notes}
          <p class="status mono"><span class="dot" aria-hidden="true"></span>${esc(profile.status)}</p>
          <p class="links">${links}</p>
        </div>
      </section>`;
  }

  // Three strongest proofs, side by side.
  function proofs(list) {
    if (!list.length) return '';
    const items = list.map((item) => {
      const link = item.link
        ? `<a href="${esc(item.link.url)}"${linkAttrs(item.link.url)}>${esc(item.link.label)}</a>`
        : '';
      return `
          <li class="fig">
            <p class="v serif">${esc(item.value)}</p>
            <p class="t">${esc(item.text)}</p>
            ${item.note ? `<p class="t note">${esc(item.note)}</p>` : ''}
            ${link}
          </li>`;
    }).join('');
    return `
      <section class="figures rise" aria-label="Strongest proof">
        <ul>${items}</ul>
      </section>`;
  }

  // The hang: a fixed rhythm of plate layouts, repeated if there are more works.
  const HANG = [
    { v: 'wide', comp: 'wide' },
    { v: 'pair-a', comp: 'tall' },
    { v: 'pair-b', comp: 'square' },
    { v: 'off-l', comp: 'tall' },
    { v: 'off-r', comp: 'square' },
    { v: 'pair-a', comp: 'tall' },
    { v: 'pair-b', comp: 'square' }
  ];
  const slugOf = (p) => (p.caseStudy ? String(p.caseStudy).replace(/^\/work\/|\/$/g, '') : '');

  function projects(list, more = []) {
    const withCode = list.filter((p) => p.url).length;
    const plates = list.map((p, i) => {
      const name = PAINTINGS[p.paint] ? p.paint : PAINT_ORDER[i % PAINT_ORDER.length];
      const hang = HANG[i % HANG.length];
      const slug = slugOf(p);
      const no = pad(i + 1);
      const acts = [
        p.caseStudy && `<a href="${esc(p.caseStudy)}">Read the case study</a>`,
        p.paper && `<a href="${esc(p.paper.url)}"${linkAttrs(p.paper.url)} title="${esc(p.paper.title)}">Preprint ↗</a>`,
        ...(p.links || []).map((l) => `<a href="${esc(l.url)}"${linkAttrs(l.url)}>${esc(l.label)}</a>`),
        p.code && (p.url
          ? `<a href="${esc(p.url)}"${linkAttrs(p.url)}>${esc(p.code)}</a>`
          : `<span>${esc(p.code)}</span>`)
      ].filter(Boolean).join('');
      const interlude = p.interlude && p.key ? `
          <li class="interlude rise">
            <p class="v serif" data-axes data-split>${esc(p.key.value)}</p>
            <p class="l mono">${esc(p.title)} · ${esc(p.key.label)}</p>
          </li>` : '';
      return `${interlude}
          <li class="plate v-${hang.v} rise" data-paint-host data-tone="${esc(name)}">
            <article>
              <figure class="art">
                <div class="art-frame${slug ? ` vt-p-${esc(slug)}` : ''}">${painting(name, hang.comp, (0.19 + i * 0.29).toFixed(2))}</div>
                <figcaption class="cap mono"><span>Pl. ${no}</span><span>${esc(PAINTINGS[name])}</span></figcaption>
              </figure>
              <header class="plate-head">
                <p class="no mono">No. ${no}</p>
                <h3 class="serif${slug ? ` vt-t-${esc(slug)}` : ''}" data-axes>${esc(p.title)}</h3>
                ${p.tag ? `<p class="tag serif">${esc(p.tag)}</p>` : ''}
              </header>
              <div class="plate-text">
                <p class="what">${esc(p.what)}</p>
                ${p.role ? `<p class="role">My role: ${esc(p.role)}</p>` : ''}
                <p class="res mono">${esc(p.proof)}</p>
                ${acts ? `<p class="acts">${acts}</p>` : ''}
              </div>
            </article>
          </li>`;
    }).join('');
    const repos = more.map((r) => `<a href="${esc(r.url)}"${linkAttrs(r.url)}>${esc(r.name)}</a>`).join('');
    const also = repos ? `<p class="also"><span class="mono">Also on GitHub</span>${repos}</p>` : '';
    return section('work', chapter('work', 'Selected', 'work', `${list.length} works · ${withCode} public`, 'I.'),
      `<ol class="plates">${plates}</ol>${also}`);
  }

  // Work in progress: a small swatch of colour beside each.
  function building(list) {
    if (!list.length) return '';
    const items = list.map((p, i) => {
      const code = p.code
        ? (p.url
          ? `<a class="mono" href="${esc(p.url)}"${linkAttrs(p.url)}>${esc(p.code)}</a>`
          : `<span class="mono quiet">${esc(p.code)}</span>`)
        : '';
      return `
          <li class="easel-item rise">
            <span class="swatch s${i % 9}" aria-hidden="true"></span>
            <h3 class="serif">${esc(p.title)}</h3>
            <p class="what">${esc(p.what)}</p>
            <p class="st mono">${esc(p.status)}</p>
            ${code ? `<p class="code">${code}</p>` : ''}
          </li>`;
    }).join('');
    return section('now', chapter('now', 'On the', 'easel', `${list.length} in progress`, 'II.'),
      `<ul class="easel">${items}</ul>`);
  }

  // The first FEATURED_WINS entries (in content.json order) are set large;
  // the rest follow as a list.
  const FEATURED_WINS = 3;

  function awards(list) {
    const dateOf = (win) => {
      const iso = isoFromDate(win.date);
      return iso ? time(iso, win.date) : esc(win.date);
    };
    const featured = list.slice(0, FEATURED_WINS).map((win) => {
      const source = win.source ? `<a class="mono" href="${esc(win.source)}"${linkAttrs(win.source)}>Source ↗</a>` : '';
      return `
          <li class="award rise${win.highlight ? ' hi' : ''}">
            <p class="d mono">${dateOf(win)}</p>
            <h3 class="serif">${esc(win.event)}</h3>
            <p class="r">${esc(win.result)}</p>
            ${source}
          </li>`;
    }).join('');
    const rest = list.slice(FEATURED_WINS).map((win) => `
          <li><span class="d mono">${dateOf(win)}</span><span class="e">${esc(win.event)}</span><span class="r">${esc(win.result)}</span></li>`).join('');
    return section('awards', chapter('awards', '', 'Recognition', 'newest first', 'III.'),
      `<ul class="awards-top">${featured}</ul>${rest ? `<ul class="awards-rest rise">${rest}</ul>` : ''}`);
  }

  function experience(list, now) {
    const items = list.map((job) => {
      const dates = `${time(job.start, monthName(job.start))} – ${job.end ? time(job.end, monthName(job.end)) : 'now'}`;
      const endAttr = job.end ? ` data-end="${esc(job.end)}"` : '';
      const duration = `<span data-start="${esc(job.start)}"${endAttr}>${esc(durationLabel(job.start, job.end, now))}</span>`;
      return `
          <li class="row">
            <p class="d mono">${dates}<br>${duration}</p>
            <div>
              <h3 class="serif">${esc(job.role)}</h3>
              <p class="org">${esc(job.company)}</p>
              ${job.description ? `<p class="what">${esc(job.description)}</p>` : ''}
            </div>
          </li>`;
    }).join('');
    return `
        <div class="col rise" id="experience">
          <h2 class="col-head mono">Experience</h2>
          <ul class="rows">${items}</ul>
        </div>`;
  }

  function education(list, credentials) {
    const items = list.map((edu) => `
          <li class="row">
            <p class="d mono">${esc(edu.dates)}</p>
            <div>
              <h3 class="serif">${esc(edu.title)}</h3>
              <p class="org">${esc(edu.subtitle)}</p>
            </div>
          </li>`).join('');
    const creds = credentials.length
      ? `<h2 class="col-head mono sub">Credentials</h2><ul class="creds">${credentials.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
      : '';
    return `
        <div class="col rise" id="education">
          <h2 class="col-head mono">Education</h2>
          <ul class="rows">${items}</ul>
          ${creds}
        </div>`;
  }

  // Tools, grouped: the medium the work is made in.
  function stack(groups) {
    const rows = groups.map((group) => `
            <div class="tool-row">
              <dt class="mono">${esc(group.group)}</dt>
              <dd>${group.items.map((item) => esc(item)).join('<span class="sep" aria-hidden="true"> · </span>')}</dd>
            </div>`).join('');
    return section('stack', chapter('stack', 'Tools &', 'materials', 'what the work is made of', 'IV.'),
      `<dl class="tools rise">${rows}</dl>`);
  }

  // The heatmaps are the only parts filled in by app.js. Without JavaScript the
  // link below is what a reader gets instead.
  function activity(username, leetcodeHandle) {
    const ghUrl = `https://github.com/${encodeURIComponent(username)}`;
    const lcUrl = `https://leetcode.com/u/${encodeURIComponent(leetcodeHandle)}/`;
    const body = `
          <div class="heat-pair rise">
            <div class="heat-block">
              <h3 class="caption mono">GitHub</h3>
              <div id="contributions" data-handle="${esc(username)}"><p class="muted">The contribution calendar needs JavaScript. <a href="${esc(ghUrl)}"${linkAttrs(ghUrl)}>See activity on GitHub →</a></p></div>
            </div>
            <div class="heat-block">
              <h3 class="caption mono">LeetCode</h3>
              <div id="leetcode" data-handle="${esc(leetcodeHandle)}"><p class="muted">The LeetCode calendar needs JavaScript. <a href="${esc(lcUrl)}"${linkAttrs(lcUrl)}>See it on LeetCode →</a></p></div>
            </div>
          </div>`;
    return section('activity', chapter('activity', 'A year of', 'practice', 'last 365 days', 'V.'), body);
  }

  function offHours(item) {
    if (!item) return '';
    const films = item.films.split('·').map((f) => f.trim()).filter(Boolean);
    return `
      <section class="off rise" aria-labelledby="off-title">
        <h2 id="off-title" class="mono col-head">Off hours</h2>
        <p class="quip serif" data-split>${esc(item.quip.charAt(0).toUpperCase() + item.quip.slice(1))}</p>
        <p class="films"><span class="mono">Films I return to</span>${films.map((f) => `<span class="serif">${esc(f.replace(/\b\w/g, (c) => c.toUpperCase()))}</span>`).join('')}</p>
      </section>`;
  }

  function footer(name, now) {
    return `
      <footer class="foot">
        ${painting('maroon', 'foot', '0.73')}
        <div class="wrap foot-in">
          <a class="mark mark-lg serif" href="#top" data-axes="mark" aria-label="Back to the top">mvh</a>
          <p class="big serif">Models that run on the <em>device</em>, not in the cloud.</p>
          <p class="meta mono"><span>© ${now.getFullYear()} ${esc(name)} · built by hand, every painting generated</span><span>For agents: <a href="/for-agents.txt">for-agents.txt</a> · <a href="/resume.json">resume.json</a> · <a href="/llms.txt">llms.txt</a></span></p>
        </div>
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
      snav(data.profile),
      hero(data.profile),
      '<div class="wrap">',
      intro(data.profile),
      proofs(data.proofs || []),
      projects(data.projects, data.moreProjects),
      building(data.building || []),
      awards(data.wins),
      `<section class="section duo" aria-label="Experience and education">${experience(data.experience, now)}${education(data.education || [], data.credentials || [])}</section>`,
      stack(data.skills),
      activity(handle, data.profile.leetcodeHandle || handle),
      offHours(data.offHours),
      '</div>',
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
    painting,
    PAINTINGS,
    content,
    refreshDurations
  };
});
