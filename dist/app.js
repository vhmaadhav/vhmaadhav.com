'use strict';

/*
 * Progressive enhancement only: build.mjs prerenders the page and this script
 * never replaces it. It runs the braille clouds (hero, footer), reveals the
 * section dividers once, fills the GitHub and LeetCode heatmaps and refreshes durations.
 */
(function () {
  const SR = window.SiteRender;
  const esc = SR ? SR.esc : (value) => String(value ?? '');
  const linkAttrs = SR ? SR.linkAttrs : () => '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const CAMERA = 6; // perspective: k = CAMERA / (CAMERA + z)
  const MORPH_S = 1.5;
  const HALF = 0.45; // projected box: 90% of the dot-height at most, and 90% of the width
  const TORUS_TILT = 0.9; // base tilt of the ring about x, so it reads as a ring, not a pancake
  const BIT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80]; // [y & 3][x & 1]

  // Braille grid: cols x rows characters hold (2 * cols) x (4 * rows) dots.
  function brailleGrid(cols, rows) {
    const bits = new Uint8Array(cols * rows);
    const codes = new Uint16Array(rows * (cols + 1) - 1);
    const dw = cols * 2;
    const dh = rows * 4;
    return {
      dw,
      dh,
      clear: () => bits.fill(0),
      plot(x, y) {
        if (x >= 0 && y >= 0 && x < dw && y < dh) bits[(y >> 2) * cols + (x >> 1)] |= BIT[((y & 3) << 1) | (x & 1)];
      },
      text() { // the frame as one string
        let k = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) codes[k++] = 0x2800 + bits[r * cols + c];
          if (r < rows - 1) codes[k++] = 10;
        }
        return String.fromCharCode.apply(null, codes);
      }
    };
  }

  // Shapes are [x, y, z] lists in about -1..1. Each one is drawn as dots on
  // lines or lattice points (wireframe), so the cloud reads as structure.
  const sphere = (n) => Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(GOLDEN * i) * r, y, Math.sin(GOLDEN * i) * r];
  });

  // Ring of 56 x 12 points: tube circles and ring circles, tilted about x.
  const torus = () => {
    const out = [];
    const cs = Math.cos(TORUS_TILT);
    const sn = Math.sin(TORUS_TILT);
    for (let i = 0; i < 56; i++) {
      for (let j = 0; j < 12; j++) {
        const u = (i / 56) * TAU;
        const v = (j / 12) * TAU;
        const R = 0.68 + 0.32 * Math.cos(v);
        const y = 0.32 * Math.sin(v);
        const z = R * Math.sin(u);
        out.push([R * Math.cos(u), y * cs - z * sn, y * sn + z * cs]);
      }
    }
    return out;
  };

  // Slab outline (top and bottom edges, corner posts), pins along all four
  // sides and an outline of the die on top.
  const chip = () => {
    const S = 0.6; // half side
    const T = 0.05; // half thickness
    const D = 0.32; // half side of the die
    const corner = [[-S, -S], [S, -S], [S, S], [-S, S]];
    const out = [];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corner[c];
      const [bx, bz] = corner[(c + 1) % 4];
      const nx = (ax + bx) / (2 * S); // outward unit normal of this side
      const nz = (az + bz) / (2 * S);
      for (let k = 0; k < 36; k++) {
        const t = k / 36;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        out.push([x, T, z], [x, -T, z]);
      }
      for (let k = 0; k < 4; k++) out.push([ax, -T + (2 * T * k) / 3, az]);
      for (let p = 0; p < 16; p++) {
        const t = 0.08 + (0.84 * p) / 15;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        for (let m = 0; m < 4; m++) {
          const e = 0.03 + 0.08 * m;
          out.push([x + nx * e, 0, z + nz * e]);
        }
      }
    }
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corner[c];
      const [bx, bz] = corner[(c + 1) % 4];
      for (let k = 0; k < 20; k++) {
        const t = k / 20;
        out.push([((ax + (bx - ax) * t) * D) / S, T, ((az + (bz - az) * t) * D) / S]);
      }
    }
    return out;
  };

  // Three stacked 14 x 14 planes joined by rungs at a 4 x 4 set of nodes.
  const lattice = () => {
    const ys = [-0.6, 0, 0.6];
    const nodes = [1, 5, 8, 12];
    const at = (i) => -0.8 + (1.6 * i) / 13;
    const out = [];
    for (const y of ys) for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) out.push([at(i), y, at(j)]);
    for (const i of nodes) {
      for (const j of nodes) {
        for (let g = 0; g < 2; g++) {
          for (let k = 1; k <= 4; k++) out.push([at(i), ys[g] + ((ys[g + 1] - ys[g]) * k) / 5, at(j)]);
        }
      }
    }
    return out;
  };

  // Exactly n points: the list is repeated when short.
  const pack = (list, n) => {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) out.set(list[i % list.length], i * 3);
    return out;
  };

  /*
   * One cloud in a <pre>. cfg: n, shapes (makers), yaw, spin (rad/s), pitch,
   * gap (ms per frame), morph (s between morphs, 0 for none), drag (pointer
   * spin with inertia, cursor tilt).
   *
   * Every frame the points are projected, and the scale is fitted so the
   * projected box is 90% of the element's dot-height (and no wider than 90%
   * of its width). Dots are in real pixels, so a sphere stays round.
   */
  function cloud(pre, cfg) {
    const n = cfg.n;
    const shapes = cfg.shapes.map((make) => pack(make(n), n));
    const cur = Float32Array.from(shapes[0]);
    const from = new Float32Array(n * 3);
    const px = new Float32Array(n); // projected coordinates, unit scale
    const py = new Float32Array(n);
    let grid = null;
    let cols = 0;
    let rows = 0;
    let pxW = 1;
    let pxH = 1;
    let dotX = 1;
    let dotY = 1;
    let scale = 0; // pixels per unit; 0 until the first fit
    let on = true;
    let last = performance.now();
    let clock = 0;
    let index = 0;
    let morphAt = -1;
    let nextMorph = cfg.morph || Infinity;
    let yaw = cfg.yaw;
    let spin = cfg.spin;
    let dragging = false;
    let dx0 = 0;
    let ox = 0;
    let oy = 0;
    let tx = 0;
    let ty = 0;

    // The cloud fills its box, so cell and line size come from the element.
    function measure() {
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(100);
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      pre.appendChild(probe);
      const charW = probe.getBoundingClientRect().width / 100;
      probe.remove();
      const lineH = parseFloat(getComputedStyle(pre).lineHeight);
      if (!(charW > 0 && lineH > 0)) return;
      const c = Math.max(4, Math.floor(pre.clientWidth / charW + 0.05));
      const r = Math.max(2, Math.round(pre.clientHeight / lineH));
      if (c !== cols || r !== rows) {
        grid = brailleGrid(c, r);
        cols = c;
        rows = r;
      }
      pxW = cols * charW;
      pxH = rows * lineH;
      dotX = pxW / grid.dw; // a dot is charW / 2 wide and lineH / 4 tall
      dotY = pxH / grid.dh;
      scale = 0; // snap to the fit on the next frame
    }

    // Each point lerps from the snapshot at the morph start to the next shape.
    function morph() {
      if (morphAt < 0 && clock >= nextMorph) {
        from.set(cur);
        index = (index + 1) % shapes.length;
        morphAt = clock;
      }
      if (morphAt < 0) return;
      const p = Math.min(1, (clock - morphAt) / MORPH_S);
      const e = p * p * (3 - 2 * p);
      const to = shapes[index];
      for (let i = 0; i < cur.length; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
      if (p >= 1) {
        nextMorph = morphAt + cfg.morph;
        morphAt = -1;
      }
    }

    function update(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      if (!dragging) { // a flick decays back to the resting spin
        spin = cfg.spin + (spin - cfg.spin) * Math.exp(-dt * 2.2);
        yaw += spin * dt;
      }
      const k = 1 - Math.exp(-dt * 6);
      ox += (tx - ox) * k;
      oy += (ty - oy) * k;
      if (cfg.morph) morph();
    }

    function render() {
      if (!grid) return;
      grid.clear();
      const sa = Math.sin(yaw + ox);
      const ca = Math.cos(yaw + ox);
      const sb = Math.sin(cfg.pitch + oy);
      const cb = Math.cos(cfg.pitch + oy);
      let maxX = 1e-3;
      let maxY = 1e-3;
      for (let i = 0; i < n; i++) {
        const x = cur[i * 3];
        const y = cur[i * 3 + 1];
        const z = cur[i * 3 + 2];
        const z1 = z * ca - x * sa;
        const z2 = y * sb + z1 * cb;
        const k = CAMERA / (CAMERA + z2);
        const X = (x * ca + z * sa) * k;
        const Y = (y * cb - z1 * sb) * k;
        px[i] = X;
        py[i] = Y;
        if (Math.abs(X) > maxX) maxX = Math.abs(X);
        if (Math.abs(Y) > maxY) maxY = Math.abs(Y);
      }
      // Fit the projected box to the element, then ease toward it so morphs and spins do not pump.
      const fit = Math.min((HALF * pxH) / maxY, (HALF * pxW) / maxX);
      scale = scale ? scale + (fit - scale) * 0.3 : fit;
      const mx = pxW / 2;
      const my = pxH / 2;
      for (let i = 0; i < n; i++) {
        grid.plot(Math.floor((mx + px[i] * scale) / dotX), Math.floor((my - py[i] * scale) / dotY));
      }
      pre.textContent = grid.text();
    }

    if (cfg.drag) {
      pre.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        dragging = true;
        dx0 = e.clientX;
        pre.setPointerCapture(e.pointerId);
      });
      pre.addEventListener('pointermove', (e) => {
        if (dragging) {
          const dx = e.clientX - dx0;
          dx0 = e.clientX;
          yaw += dx * 0.012;
          spin = Math.max(-8, Math.min(8, dx * 0.7));
          if (reduced) render();
        } else if (e.pointerType === 'mouse' && !reduced) {
          const r = pre.getBoundingClientRect();
          tx = ((e.clientX - r.left) / r.width - 0.5) / 2; // +-0.25 rad
          ty = ((e.clientY - r.top) / r.height - 0.5) / 2;
        }
      });
      const end = () => { dragging = false; };
      pre.addEventListener('pointerup', end);
      pre.addEventListener('pointercancel', end);
      pre.addEventListener('pointerleave', () => { if (!dragging) tx = ty = 0; });
    }

    measure();
    render();
    if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); render(); }).observe(pre);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        on = entries[entries.length - 1].isIntersecting;
        schedule();
      }).observe(pre);
    }
    return {
      shown: () => on,
      step(now) {
        if (on && now - last >= cfg.gap) {
          update(now);
          render();
        }
      }
    };
  }

  // One rAF loop drives every cloud, and only while one is on screen and the tab is visible.
  const clouds = [];
  const isShown = (c) => c.shown();
  let raf = 0;

  function schedule() {
    if (!reduced && !raf && !document.hidden && clouds.some(isShown)) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    for (const c of clouds) c.step(now);
    schedule();
  }

  // Each divider clips in from the left once, the first time it scrolls into view.
  function revealRules() {
    if (reduced || !('IntersectionObserver' in window)) return;
    const rules = document.querySelectorAll('.rule');
    rules.forEach((el) => el.classList.add('is-hidden'));
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove('is-hidden');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    rules.forEach((el) => io.observe(el));
  }

  // ---- heatmaps (GitHub and LeetCode share the calendar, stats row and styles) ----

  function level(day) {
    const value = Number(day.level);
    if (Number.isFinite(value)) return Math.max(0, Math.min(4, value));
    return Number(day.count) > 0 ? 1 : 0;
  }

  // days: oldest first, {date: "YYYY-MM-DD", count, level?}.
  function heatmap(days, unit, caption) {
    const columns = [];
    let column = Array(new Date(`${days[0].date}T00:00:00`).getDay()).fill(null);
    for (const day of days) {
      column.push(day);
      if (column.length === 7) {
        columns.push(column);
        column = [];
      }
    }
    if (column.length) {
      while (column.length < 7) column.push(null);
      columns.push(column);
    }
    const weeks = columns.map((cells) => `<div class="week">${cells.map((day) => {
      if (!day) return '<span class="cell none" aria-hidden="true"></span>';
      const count = Number(day.count) || 0;
      const label = `${day.date}: ${count} ${unit}${count === 1 ? '' : 's'}`;
      return `<span class="cell l${level(day)}" title="${esc(label)}"></span>`;
    }).join('')}</div>`).join('');
    return `<div class="heat-scroll" tabindex="0" aria-label="${esc(caption)}"><div class="heat">${weeks}</div></div>`;
  }

  // Longest run of active days, and the current run. Today may not have activity yet,
  // so the current run starts from yesterday in that case.
  function streaks(counts) {
    let longest = 0;
    let run = 0;
    for (const n of counts) {
      run = n > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    let i = counts.length - 1;
    if (counts[i] === 0) i -= 1;
    let current = 0;
    for (; i >= 0 && counts[i] > 0; i -= 1) current += 1;
    return { current, longest };
  }

  const fmt = (n) => n.toLocaleString('en-US');

  function statsRow(cells, profileUrl, linkText) {
    return `
      <div class="stats">
        ${cells}
        <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>${linkText}</a>
      </div>`;
  }

  function contributionStats(days, profileUrl) {
    const counts = days.map((day) => Number(day.count) || 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const { current, longest } = streaks(counts);
    return statsRow(
      `<span>total <b>${fmt(total)}</b></span>
        <span>current streak <b>${current}d</b></span>
        <span>longest streak <b>${longest}d</b></span>`,
      profileUrl, 'view on github →');
  }

  // The last 365 days in UTC, oldest first, to match LeetCode's UTC day keys.
  function lastYear(counts) {
    const now = new Date();
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = [];
    for (let i = 364; i >= 0; i -= 1) {
      const date = new Date(end - i * 86400000).toISOString().slice(0, 10);
      days.push({ date, count: Number(counts[date]) || 0 });
    }
    return days;
  }

  // Quartiles of the active days set the shades, so one heavy day does not wash out the rest.
  function assignLevels(days) {
    const active = days.map((day) => day.count).filter((n) => n > 0).sort((a, b) => a - b);
    const at = (p) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
    const [q1, q2, q3] = active.length ? [at(0.25), at(0.5), at(0.75)] : [1, 1, 1];
    for (const day of days) {
      day.level = day.count <= 0 ? 0 : day.count <= q1 ? 1 : day.count <= q2 ? 2 : day.count <= q3 ? 3 : 4;
    }
    return days;
  }

  function leetcodeStats(data, days, profileUrl) {
    const solved = data.solved;
    const all = Number(solved.all) || 0;
    const easy = Number(solved.easy) || 0;
    const medium = Number(solved.medium) || 0;
    const hard = Number(solved.hard) || 0;
    const counts = days.map((day) => day.count);
    const active = counts.filter((n) => n > 0).length;
    const { current } = streaks(counts);
    return statsRow(
      `<span>solved <b>${fmt(all)}</b><small class="split">E ${fmt(easy)} · M ${fmt(medium)} · H ${fmt(hard)}</small></span>
        <span>current streak <b>${current}d</b></span>
        <span>active days <b>${fmt(active)}</b></span>`,
      profileUrl, 'view on leetcode →');
  }

  async function fetchJson(url, ms = 8000) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  function validLeetcode(data) {
    return Boolean(data && data.solved && typeof data.solved === 'object' && data.days && typeof data.days === 'object');
  }

  async function loadContributions() {
    const host = document.getElementById('contributions');
    if (!host) return;
    const username = host.getAttribute('data-handle');
    if (!username) return;
    const profileUrl = `https://github.com/${encodeURIComponent(username)}`;
    const fallback = `<p class="muted">contributions are unavailable right now. <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>view activity on github →</a></p>`;
    host.innerHTML = '<p class="muted">loading contributions…</p>';
    try {
      const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`, {
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const days = Array.isArray(payload.contributions) ? payload.contributions : [];
      if (!days.length) throw new Error('no contribution data');
      host.innerHTML = heatmap(days, 'contribution', 'github contribution calendar, last year')
        + contributionStats(days, profileUrl);
      const scroller = host.querySelector('.heat-scroll');
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    } catch (err) {
      host.innerHTML = fallback;
    }
  }

  // The Pages Function first, then the snapshot build.mjs writes next to the page.
  // If both fail, the link stands in for the heatmap.
  async function loadLeetcode() {
    const host = document.getElementById('leetcode');
    if (!host) return;
    const username = host.getAttribute('data-handle');
    if (!username) return;
    const profileUrl = `https://leetcode.com/u/${encodeURIComponent(username)}/`;
    const fallback = `<p class="muted">leetcode is unavailable right now. <a class="link" href="${esc(profileUrl)}"${linkAttrs(profileUrl)}>view on leetcode →</a></p>`;
    host.innerHTML = '<p class="muted">loading leetcode…</p>';
    let data = await fetchJson('/api/leetcode');
    if (!validLeetcode(data)) data = await fetchJson('leetcode.json');
    if (!validLeetcode(data)) {
      host.innerHTML = fallback;
      return;
    }
    try {
      const days = assignLevels(lastYear(data.days));
      host.innerHTML = heatmap(days, 'submission', 'leetcode submission calendar, last year')
        + leetcodeStats(data, days, profileUrl);
      const scroller = host.querySelector('.heat-scroll');
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    } catch (err) {
      host.innerHTML = fallback;
    }
  }

  function init() {
    const page = document.getElementById('portfolio');
    if (!page) return;
    if (SR) SR.refreshDurations(page, new Date());

    const hero = document.getElementById('hero-cloud');
    if (hero) {
      clouds.push(cloud(hero, {
        n: 700, shapes: [torus, sphere, chip, lattice], spin: 0.3, yaw: 0.6, pitch: 0.35,
        gap: 33, morph: 6, drag: true
      }));
    }
    const foot = document.getElementById('footer-cloud');
    if (foot) {
      clouds.push(cloud(foot, {
        n: 120, shapes: [sphere], spin: 0.5, yaw: 0, pitch: 0.35, gap: 66, morph: 0
      }));
    }

    revealRules();
    schedule();
    loadContributions();
    loadLeetcode();
  }

  init();
})();
