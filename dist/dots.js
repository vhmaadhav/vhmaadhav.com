'use strict';

/*
 * Dot-matrix engine shared by every page; canvases are aria-hidden, the words
 * they show are real text elsewhere. [data-panel]: scan-sweep power-on, types
 * data-name, cycles data-facts ("a|b|c"); the mouse warms dots. [data-dock]
 * (or [data-dot] sections on the home page): a mini display docks top left
 * after the panel scrolls away. prefers-reduced-motion: static panel.
 */
(function () {
  const doc = document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => Array.from(doc.querySelectorAll(s));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 3);
  const phone = () => window.innerWidth < 640;

  // 5 x 7 font, 7 base-32 rows per glyph (bit 4 = left column).
  const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'-·,./";
  const ROWS = 'ehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhe44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhllrhhha4ahhhha4444v1248gvehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12c4480000000v00000040000000048000000411248gg';
  // Text to columns of 7-bit numbers; a space is three empty columns.
  function bits(text) {
    const key = String(text).toUpperCase();
    const out = [];
    for (const ch of key) {
      const k = KEYS.indexOf(ch);
      if (k < 0) { out.push(0, 0, 0); continue; }
      const w = [0, 0, 0, 0, 0];
      for (let r = 0; r < 7; r++) {
        const v = parseInt(ROWS[k * 7 + r], 32);
        for (let c = 0; c < 5; c++) w[c] |= ((v >> (4 - c)) & 1) << r;
      }
      let a = 0, b = 4;
      while (!w[a] && a < 4) a++;
      while (!w[b] && b > 0) b--;
      out.push(...w.slice(a, b + 1), 0);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }

  // core colour of lit level q: amber, whitening at the top
  const color = (q) => [242, 165, 65].map((v, j) => Math.max(0, Math.round(v * Math.min(1, q / 0.8) ** (0.8 + 0.17 * j) + (255 - v) * 3 * Math.max(0, q - 0.8) - 25))).join();
  const canvas = (w, h) => Object.assign(doc.createElement('canvas'), { width: w, height: h });

  // n x m round dots, P device pixels apart (an integer: crisp). T = target level,
  // V = shown level (rises fast, falls slowly: the afterglow), G = cursor warmth.
  class Matrix {
    constructor(cv, n, m, P) {
      const size = n * m;
      Object.assign(this, { cv, n, m, P, T: new Float32Array(size), V: new Float32Array(size), G: new Float32Array(size), x: cv.getContext('2d', { alpha: false }), dirty: 1, gn: 0, hot: 0, wk: 1, tau: 0.17 });
      cv.width = (n + 3) * P;
      cv.height = (m + 3) * P;
      const c = (this.base = canvas(cv.width, cv.height)).getContext('2d');
      c.fillStyle = '#0c0c0d';
      c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#1a1916';
      for (let i = 0; i < size; i++) {
        c.beginPath();
        c.arc(((i % n) + 1.5) * P, (((i / n) | 0) + 1.5) * P, P * 0.27, 0, 7);
        c.fill();
      }
      const S = 4 * P;
      this.sprites = Array.from({ length: 20 }, (_, L) => { // 20 lit levels: halo and core
        const q = (L + 1) / 20;
        const g = canvas(S, S).getContext('2d');
        const h = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 1.7 * P);
        h.addColorStop(0, `rgba(242,150,40,${0.3 * q ** 1.6})`);
        h.addColorStop(0.4, `rgba(242,140,35,${0.1 * q ** 1.6})`);
        h.addColorStop(1, 'rgba(242,140,35,0)');
        g.fillStyle = h;
        g.fillRect(0, 0, S, S);
        g.fillStyle = `rgb(${color(q)})`;
        g.beginPath();
        g.arc(S / 2, S / 2, P * (0.27 + 0.07 * q), 0, 7);
        g.fill();
        return g.canvas;
      });
    }

    // Bitmap s at (X, Y), glyph scale z; columns a..b are lit, the typing edge shines.
    put(s, X, Y, a, b, z = 1) {
      const { n, m, T } = this;
      const W = s.length * z;
      for (let c = 0; c < W; c++) {
        const x = X + c;
        if (x < 0 || x >= n) continue;
        const on = c >= a && c < b;
        const head = (on && b < W && c >= b - 1.5 * z) || (c >= a && a > 0 && a < W && c < a + z);
        const v = on ? (head ? 1 : 0.8) : 0;
        for (let r = 0; r < 7 * z && Y + r < m; r++) {
          const i = (Y + r) * n + x;
          if ((s[(c / z) | 0] >> ((r / z) | 0)) & 1) { if (v > T[i]) T[i] = v; } else if (head && T[i] < 0.16) T[i] = 0.16;
        }
      }
    }

    step(dt) { // V toward T; true while anything still moves
      const { T, V } = this;
      const up = RM ? 1 : 1 - Math.exp(-dt / 0.025);
      const down = RM ? 1 : 1 - Math.exp(-dt / this.tau);
      let moving = false;
      for (let i = 0; i < T.length; i++) {
        if (T[i] === V[i]) continue;
        const u = V[i] + (T[i] - V[i]) * (T[i] > V[i] ? up : down);
        V[i] = Math.abs(T[i] - u) < 0.004 ? T[i] : u;
        moving = true;
      }
      if (moving) this.dirty = 1;
      return moving;
    }

    glow(dt) { // dots within 4.5 dots of the pointer warm up a little
      if (!this.hot && !this.gn) return;
      const { n, G, mx, my } = this;
      const k = 1 - Math.exp(-dt / 0.09);
      let lit = 0;
      for (let i = 0; i < G.length; i++) {
        const d = Math.hypot((i % n) - mx, ((i / n) | 0) - my);
        const t = this.hot && d < 4.5 ? 0.4 * (1 - d / 4.5) ** 1.6 : 0;
        G[i] += (t - G[i]) * k;
        if (!t && G[i] < 0.004) G[i] = 0;
        if (G[i]) lit++;
      }
      this.gn = lit;
      this.dirty = 1;
    }

    draw(wk) { // wk < 1 shows only the left part of the grid: the power-on
      if (wk !== this.wk) { this.wk = wk; this.dirty = 1; }
      if (!this.dirty) return;
      this.dirty = 0;
      const { x, cv, base, V, G, n, P } = this;
      const S = 4 * P;
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#0c0c0d';
      x.fillRect(0, 0, cv.width, cv.height);
      const w = Math.max(1, (wk * cv.width) | 0);
      x.drawImage(base, 0, 0, w, base.height, 0, 0, w, base.height);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < V.length; i++) {
        const L = Math.round(Math.max(V[i], G[i]) * 20);
        if (L > 0) x.drawImage(this.sprites[L - 1], ((i % n) + 1.5) * P - S / 2, (((i / n) | 0) + 1.5) * P - S / 2);
      }
    }
  }

  // One rAF loop for all displays, only while something visible changes.
  const displays = [];
  let raf = 0, last = 0;
  const wake = () => { raf = raf || requestAnimationFrame(frame); }; // rAF itself pauses in hidden tabs
  function frame(now) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    raf = 0;
    let more = false;
    for (const d of displays) if (d.vis && d.frame(dt, now)) more = true;
    if (more) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  const watch = (el, fn, opts) => new IntersectionObserver((es) => fn(es[es.length - 1]), opts).observe(el);

  function panel(host) {
    const name = host.dataset.name.toUpperCase();
    const facts = host.dataset.facts.split('|');
    const z = Number(host.dataset.scale) || 1;
    const cv = host.querySelector('canvas');
    let M, L, fact, clock = 0, nb = 0, lit = -1, extra = 0;

    function layout() {
      const dpr = dprNow();
      const w = host.clientWidth;
      const n = phone() ? 48 : Math.min(130, Math.floor(w / 8) - 3);
      const P = phone() ? Math.max(2, Math.floor((w * dpr) / (n + 3))) : Math.round(8 * dpr);
      const words = name.split(' ');
      const lines = (bits(name).length * z > n - 6 ? [words[0], words.slice(1).join(' ')] : [name]).map(bits);
      let y = 2;
      const ys = lines.map(() => { const at = y; y += 7 * z + 1; return at; });
      const fy = y + 1;
      const py = facts.length > 1 ? fy + 9 : 0;
      L = { n, ys, fy, py, lines, total: lines.reduce((t, s) => t + s.length, 0) };
      M = new Matrix(cv, n, (py || fy + 7) + 2, P);
      cv.style.width = `${cv.width / dpr}px`;
      cv.style.height = `${cv.height / dpr}px`;
      M.draw(0);
    }

    function pick() {
      lit = nb++ % facts.length;
      const s = bits(facts[lit]);
      const sh = Math.max(0, s.length - (L.n - 4)); // too wide: scrolls like a ticker
      if (RM && sh) return { s: [], sh: 0, sc: 0, u: 1, E: Infinity }; // static: name only
      const sc = sh / 14;
      return { s, sh, sc, u: 0, E: facts.length < 2 && !sh ? Infinity : 2.3 + sc };
    }

    function scene(dt) {
      const { n } = L;
      const T = M.T;
      T.fill(0);
      clock = RM ? 9 : clock + dt;
      const sw = (clock - 0.15) / 0.85;
      let wk = 1;
      if (sw < 1.2) { // the scan: a bright column lighting the grid behind it
        const h = sw * (n + 6) - 3;
        wk = clamp((h + 2) / (n + 3));
        for (let i = 0; i < T.length && sw > 0; i++) {
          const d = Math.abs((i % n) - h);
          if (d < 2.2) T[i] = d < 0.8 ? 0.9 : 0.28;
        }
      }
      let typed = clamp((clock - 1) / 0.9) * L.total;
      L.lines.forEach((s, i) => {
        M.put(s, (n - s.length * z) >> 1, L.ys[i], 0, z * clamp(typed, 0, s.length), z);
        typed -= s.length;
      });
      if (clock >= 2.3) {
        if (!fact || (!RM && (fact.u += dt) >= fact.E + 0.55)) fact = pick();
        const { s, sh, sc, E, u } = fact;
        const W = s.length;
        const e = clamp((u - 1.4) / sc); // ticker position, 14 columns a second
        M.tau = e > 0 && e < 1 ? 0.02 : 0.17; // no afterglow while scrolling, or it smears
        const x = sh ? 2 - Math.round(sh * e) : (n - W) >> 1;
        M.put(s, x, L.fy, W * clamp((u - E) / 0.35), RM ? W : W * clamp(u / 0.5));
        for (let k = 0; k < facts.length && L.py; k++) T[L.py * n + (n >> 1) + Math.round((k - (facts.length - 1) / 2) * 3)] = k === lit ? 0.8 : 0.2;
      }
      return wk;
    }

    const d = { vis: false, frame(dt) { const wk = scene(dt); M.step(dt); M.glow(dt); M.draw(wk); return !RM || !!M.gn; } };
    displays.push(d);
    layout();
    host.classList.add('ready');
    // live numbers ("LC 73 SOLVED") join the cycle after the 2nd and 5th item
    window.Dots = { fact: (text) => facts.splice(Math.min(facts.length, 2 + 3 * extra++), 0, text) };
    let width = host.clientWidth;
    addEventListener('resize', () => {
      if (host.clientWidth === width) return;
      width = host.clientWidth;
      layout();
      wake();
    });
    watch(host, (e) => { d.vis = e.isIntersecting; if (d.vis) wake(); });
    if (RM) return;
    host.addEventListener('click', () => { clock = Math.max(clock, 2.3); }); // skip the intro
    host.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = cv.getBoundingClientRect();
      M.mx = ((e.clientX - r.left) * (M.n + 3)) / r.width - 1.5;
      M.my = ((e.clientY - r.top) * (M.n + 3)) / r.width - 1.5;
      M.hot = 1;
      wake();
    });
    host.addEventListener('pointerleave', () => { M.hot = 0; wake(); });
  }

  // The mini display docked top left; returns the label setter.
  function dock(trigger, labels, first) {
    const a = Object.assign(doc.createElement('a'), { className: 'dock', href: '#top', ariaLabel: 'Back to top' });
    const cv = Object.assign(canvas(1, 1), { ariaHidden: 'true' });
    a.append(cv);
    doc.body.append(a);
    let M, ms = 0, cur = bits(first);

    function layout() {
      const dpr = dprNow();
      const N = Math.max(...labels.map((l) => bits(l).length)) + 2;
      const P = Math.max(2, Math.min(Math.round(4 * dpr), Math.floor(((window.innerWidth - 24 - (phone() ? 96 : 0)) * dpr) / (N + 3))));
      M = new Matrix(cv, N, 7, P);
      cv.style.width = `${cv.width / dpr}px`;
      cv.style.height = `${cv.height / dpr}px`;
      const main = $('main');
      a.style.setProperty('--dl', `${main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft)}px`);
    }

    const d = {
      vis: false,
      frame(dt, now) {
        M.T.fill(0);
        const p = RM ? 1 : clamp((now - ms) / 320);
        M.put(cur, 1, 0, 0, p * cur.length);
        const moving = M.step(dt);
        M.draw(1);
        return p < 1 || moving;
      }
    };
    displays.push(d);
    layout();
    watch(trigger, (e) => {
      d.vis = !e.isIntersecting && e.boundingClientRect.top < 0;
      doc.documentElement.classList.toggle('docked', d.vis);
      if (d.vis) { ms = performance.now(); M.dirty = 1; wake(); }
    }, { rootMargin: '-56px 0px 0px 0px' });
    addEventListener('resize', () => { layout(); M.dirty = 1; wake(); });
    return (text) => { cur = bits(text); ms = performance.now(); if (d.vis) wake(); };
  }

  const host = $('[data-panel]');
  const sections = $$('[data-dot]');
  const target = $('[data-dock]') || (sections.length ? host : null);
  if (!('IntersectionObserver' in window)) return;
  if (host) panel(host);
  if (target) {
    const names = sections.length ? sections.map((s) => s.dataset.dot) : [target.dataset.dock];
    const label = dock(target, names, names[0]);
    const inView = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inView.add(e.target) : inView.delete(e.target)));
      const s = sections.find((el) => inView.has(el)); // side-by-side sections: the first wins
      if (!s) return;
      label(s.dataset.dot);
    }, { rootMargin: '-30% 0px -65% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  // Doto's ROND axis: headings turn from square to round dots as they scroll in
  if (!RM) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.6 });
    $$('.sec-head, h1').forEach((el) => io.observe(el));
  }

})();
