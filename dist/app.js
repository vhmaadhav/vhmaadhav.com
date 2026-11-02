'use strict';

/* Progressive enhancement only: fills the heatmaps, refreshes durations, feeds live stats to the dot panel (dots.js). */
(function () {
  const SR = window.SiteRender;
  const esc = SR ? SR.esc : (value) => String(value ?? '');
  const linkAttrs = SR ? SR.linkAttrs : () => '';
  const fact = (text) => window.Dots && window.Dots.fact(text);
  const fmt = (n) => n.toLocaleString('en-US');
  const num = (v) => Number(v) || 0;

  // days: oldest first, {date, count, level?}; shared by both heatmaps
  function heatmap(days, unit, caption) {
    const cells = Array(new Date(`${days[0].date}T00:00:00`).getDay()).fill(null).concat(days);
    let weeks = '';
    for (let i = 0; i < cells.length; i += 7) {
      weeks += `<div class="week">${Array.from({ length: 7 }, (_, j) => {
        const day = cells[i + j];
        if (!day) return '<span class="cell none" aria-hidden="true"></span>';
        const count = num(day.count);
        const lv = Number.isFinite(Number(day.level)) ? Math.max(0, Math.min(4, Number(day.level))) : Number(count > 0);
        return `<span class="cell l${lv}" title="${esc(`${day.date}: ${count} ${unit}${count === 1 ? '' : 's'}`)}"></span>`;
      }).join('')}</div>`;
    }
    return `<div class="heat-scroll" tabindex="0" aria-label="${esc(caption)}"><div class="heat">${weeks}</div></div>`;
  }

  // longest and current run of active days
  function streaks(counts) {
    let longest = 0;
    let run = 0;
    for (const n of counts) longest = Math.max(longest, (run = n > 0 ? run + 1 : 0));
    let i = counts.length - 1 - Number(counts[counts.length - 1] === 0);
    let current = 0;
    for (; i >= 0 && counts[i] > 0; i--) current++;
    return { current, longest };
  }

  const stats = (cells, url, text) => `
      <div class="stats">
        ${cells}
        <a class="link" href="${esc(url)}"${linkAttrs(url)}>${text}</a>
      </div>`;

  // the last 365 UTC days, oldest first (LeetCode's keys are UTC)
  function lastYear(counts) {
    const now = new Date();
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Array.from({ length: 365 }, (_, i) => {
      const date = new Date(end - (364 - i) * 86400000).toISOString().slice(0, 10);
      return { date, count: num(counts[date]) };
    });
  }

  // quartiles of the active days set the shades
  function assignLevels(days) {
    const active = days.map((day) => day.count).filter((n) => n > 0).sort((a, b) => a - b);
    const at = (p) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
    const [q1, q2, q3] = active.length ? [at(0.25), at(0.5), at(0.75)] : [1, 1, 1];
    for (const day of days) day.level = day.count <= 0 ? 0 : day.count <= q1 ? 1 : day.count <= q2 ? 2 : day.count <= q3 ? 3 : 4;
    return days;
  }

  const getJson = (url, ms = 8000) => fetch(url, { signal: AbortSignal.timeout(ms) }).then((r) => (r.ok ? r.json() : null), () => null);
  const validLeetcode = (d) => Boolean(d && d.solved && typeof d.solved === 'object' && d.days && typeof d.days === 'object');

  // loading note, then fn() -> html; a link if anything fails
  async function mount(id, name, profileUrl, fn) {
    const host = document.getElementById(id);
    if (!host || !host.getAttribute('data-handle')) return;
    host.innerHTML = `<p class="muted">loading ${name}…</p>`;
    try {
      host.innerHTML = await fn(host.getAttribute('data-handle'));
      const scroller = host.querySelector('.heat-scroll');
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    } catch (err) {
      host.innerHTML = `<p class="muted">${name} is unavailable right now. <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>view on ${name} →</a></p>`;
    }
  }

  function init() {
    const page = document.getElementById('portfolio');
    if (!page) return;
    if (SR) SR.refreshDurations(page, new Date());
    const handle = (id) => (document.getElementById(id) || document.body).getAttribute('data-handle') || '';
    const gh = `https://github.com/${encodeURIComponent(handle('contributions'))}`;
    const lc = `https://leetcode.com/u/${encodeURIComponent(handle('leetcode'))}/`;

    mount('contributions', 'github', gh, async (user) => {
      const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const days = Array.isArray(payload.contributions) ? payload.contributions : [];
      if (!days.length) throw new Error('no contribution data');
      const counts = days.map((day) => num(day.count));
      const total = counts.reduce((sum, n) => sum + n, 0);
      const { current, longest } = streaks(counts);
      fact(`GH ${fmt(total)} · 1Y`);
      return heatmap(days, 'contribution', 'github contribution calendar, last year')
        + stats(`<span>total <b>${fmt(total)}</b></span>
        <span>current streak <b>${current}d</b></span>
        <span>longest streak <b>${longest}d</b></span>`, gh, 'view on github →');
    });

    // the Worker's /api/leetcode first, then the built snapshot
    mount('leetcode', 'leetcode', lc, async () => {
      let data = await getJson('/api/leetcode');
      if (!validLeetcode(data)) data = await getJson('leetcode.json');
      if (!validLeetcode(data)) throw new Error('no leetcode data');
      const { all, easy, medium, hard } = Object.fromEntries(['all', 'easy', 'medium', 'hard'].map((k) => [k, num(data.solved[k])]));
      const days = assignLevels(lastYear(data.days));
      const counts = days.map((day) => day.count);
      fact(`LC ${fmt(all)} SOLVED`);
      return heatmap(days, 'submission', 'leetcode submission calendar, last year')
        + stats(`<span>solved <b>${fmt(all)}</b><small class="split">E ${fmt(easy)} · M ${fmt(medium)} · H ${fmt(hard)}</small></span>
        <span>current streak <b>${streaks(counts).current}d</b></span>
        <span>active days <b>${fmt(counts.filter((n) => n > 0).length)}</b></span>`, lc, 'view on leetcode →');
    });
  }

  init();
})();
