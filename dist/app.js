'use strict';

/* Progressive enhancement only: fills the heatmaps, refreshes durations, reveals sections as they scroll in. */
(function () {
  const SR = window.SiteRender;
  const esc = SR ? SR.esc : (value) => String(value ?? '');
  const linkAttrs = SR ? SR.linkAttrs : () => '';
  const fact = () => {};

  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // Wrap every word of an element in a span (keeping nested <em> etc.), for staggered reveals.
  function splitWords(el) {
    let n = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.textContent = part;
            w.style.setProperty('--d', `${Math.min(n++ * 70, 700)}ms`);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) walk(child);
      });
    };
    walk(el);
  }

  // Sfumato: blocks below the fold resolve from a slight blur as they arrive; headings word by word.
  // Anything already on screen is left alone, and without JS nothing is hidden.
  function reveal() {
    if (!('IntersectionObserver' in window) || reduced) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.remove('wait');
      e.target.classList.add('in');
      io.unobserve(e.target);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.rise, [data-split]').forEach((el) => {
      if (el.getBoundingClientRect().top <= window.innerHeight) return;
      if (el.hasAttribute('data-split')) { splitWords(el); el.classList.add('split'); } else el.classList.add('wait');
      io.observe(el);
    });
  }

  // Quiet navigation, section tone and progress, from one throttled scroll handler.
  function scrollChrome() {
    const nav = document.querySelector('[data-snav]');
    const hero = document.querySelector('.hero');
    const links = nav ? Array.from(nav.querySelectorAll('a[data-s]')) : [];
    const sections = links.map((a) => document.getElementById(a.getAttribute('data-s')));
    const tones = Array.from(document.querySelectorAll('.hero, [data-tone], .foot'));
    const toneOf = (el) => el.getAttribute('data-tone') || (el.classList.contains('hero') ? 'ember' : el.classList.contains('foot') ? 'maroon' : '');
    let last = window.scrollY;
    let shown = false;
    let tick = false;
    let current = '';
    let tone = '';
    function update() {
      tick = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const dy = y - last;
      last = y;
      if (nav) {
        const past = hero ? y > hero.offsetHeight - 80 : y > vh;
        if (!past) shown = false;
        else if (!shown && dy < -3) shown = true;
        else if (!shown && dy >= 0 && y < hero.offsetHeight + 40) shown = true;
        else if (shown && dy > 6) shown = false;
        nav.classList.toggle('is-on', shown);
        const max = document.documentElement.scrollHeight - vh;
        nav.style.setProperty('--p', max > 0 ? clamp01(y / max).toFixed(4) : '0');
        let now = '';
        sections.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < vh * 0.4) now = links[i].getAttribute('data-s'); });
        if (now !== current) {
          current = now;
          links.forEach((a) => (a.getAttribute('data-s') === now ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
        }
      }
      let t = '';
      tones.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.55 && r.bottom > vh * 0.45) t = toneOf(el);
      });
      if (t !== tone) { tone = t; if (t) document.body.setAttribute('data-tone', t); else document.body.removeAttribute('data-tone'); }
    }
    const onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    update();
  }

  // Headings and the monogram lean toward the pointer through Fraunces' own axes (SOFT, wght).
  // One rAF loop, running only while something is still easing.
  function pointerAxes() {
    if (reduced || !matchMedia('(hover: hover)').matches) return;
    const els = Array.from(document.querySelectorAll('[data-axes]')).map((el) => ({
      el, kind: el.getAttribute('data-axes') || 'head', v: 0, target: 0
    }));
    if (!els.length) return;
    const visible = new Set();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((e) => {
        const item = els.find((x) => x.el === e.target);
        if (e.isIntersecting) visible.add(item); else visible.delete(item);
      }));
      els.forEach((x) => io.observe(x.el));
    } else els.forEach((x) => visible.add(x));
    let px = -1e4;
    let py = -1e4;
    let running = false;
    function frame() {
      let busy = false;
      visible.forEach((item) => {
        const r = item.el.getBoundingClientRect();
        const cx = Math.max(r.left, Math.min(px, r.right));
        const cy = Math.max(r.top, Math.min(py, r.bottom));
        const d = Math.hypot(px - cx, py - cy);
        item.target = clamp01(1 - d / 360);
        item.v += (item.target - item.v) * 0.09;
        if (Math.abs(item.target - item.v) > 0.002) busy = true;
        const v = item.v;
        if (item.kind === 'mark') {
          item.el.style.setProperty('--pw', String(Math.round(360 + 220 * v)));
        } else {
          item.el.style.setProperty('--ps', String(Math.round(60 + 40 * v)));
          item.el.style.setProperty('--pw', String(Math.round(300 + (item.kind === 'name' ? 70 : 50) * v)));
        }
      });
      if (busy) requestAnimationFrame(frame); else running = false;
    }
    addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      if (!running) { running = true; requestAnimationFrame(frame); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { px = py = -1e4; if (!running) { running = true; requestAnimationFrame(frame); } });
  }

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
    reveal();
    pointerAxes();
    if (!page) return;
    scrollChrome();
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
