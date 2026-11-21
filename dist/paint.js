/*
 * Colour-field paintings, generated in the browser.
 *
 * Every element with [data-paint] holds a <canvas>. The element's CSS draws a
 * flat fallback of the same palette (style.css), so without JavaScript or
 * WebGL the page still shows the painting's colours. When WebGL is available
 * this file paints soft, feathered slabs of colour over a ground, with brush
 * drag, a linen weave and a faint seam of light where the slabs meet.
 *
 *   data-paint="ember"     palette name (PALETTES below)
 *   data-comp="2"          composition index, or "hero" / "foot"
 *   data-seed="0.37"       makes each painting its own
 *   data-live              keeps breathing while on screen (the hero)
 *   data-light             a soft light follows the pointer across it
 *
 * Paintings are drawn when they scroll near, share one WebGL context, pause
 * off screen, and stay still under prefers-reduced-motion.
 */
(function () {
  'use strict';

  // ground, slab A, slab B, slab C, seam light
  const PALETTES = {
    ember: ['#2a120d', '#5e1d14', '#e0782e', '#24110e', '#ff9a4a'],
    umber: ['#1f1712', '#6b4a2b', '#120d0b', '#a8722f', '#e0a050'],
    slate: ['#151a1c', '#2c3d42', '#b4552a', '#0e1214', '#d9733a'],
    plum: ['#1d1218', '#4a1f2c', '#c56a2a', '#160d12', '#e8873f'],
    olive: ['#1a1a12', '#545432', '#d8c7a0', '#13130e', '#efd9a8'],
    ink: ['#0f1218', '#1f2a40', '#8c3a24', '#0b0d12', '#d06a3c'],
    maroon: ['#1c0c0b', '#3e1210', '#0e0807', '#7a1f17', '#c8502e'],
    tobacco: ['#1b130d', '#7a4a22', '#2a1a10', '#c98b45', '#f0b060'],
  };

  // slab rectangles: x0, y0, x1, y1 in 0..1, y measured upwards
  const COMPS = {
    0: [[0.07, 0.5, 0.93, 0.93], [0.07, 0.4, 0.93, 0.47], [0.07, 0.07, 0.93, 0.36]],
    1: [[0.08, 0.62, 0.92, 0.92], [0.08, 0.1, 0.92, 0.58], [0.3, 0.3, 0.7, 0.38]],
    2: [[0.06, 0.08, 0.94, 0.44], [0.06, 0.5, 0.94, 0.56], [0.06, 0.62, 0.94, 0.94]],
    3: [[0.1, 0.55, 0.9, 0.9], [0.1, 0.46, 0.9, 0.51], [0.1, 0.1, 0.9, 0.42]],
    hero: [[0.04, 0.63, 0.96, 0.95], [0.04, 0.545, 0.96, 0.585], [0.04, 0.05, 0.96, 0.5]],
    foot: [[0.05, 0.55, 0.95, 0.93], [0.05, 0.47, 0.95, 0.51], [0.05, 0.06, 0.95, 0.43]],
    banner: [[0.03, 0.56, 0.97, 0.94], [0.03, 0.44, 0.97, 0.5], [0.03, 0.06, 0.97, 0.38]],
  };

  const FRAG = `
precision highp float;
uniform vec2 res; uniform float t; uniform float seed;
uniform vec3 ground; uniform vec3 cA; uniform vec3 cB; uniform vec3 cC; uniform vec3 glow;
uniform vec4 rA; uniform vec4 rB; uniform vec4 rC;
uniform vec3 light;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed*57.3) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p=p*2.03+.31; a*=.5; } return v; }
float slab(vec2 uv, vec4 r, float soft, float k){
  float e = (fbm(uv*vec2(2.2, 3.4) + k + .02*t) - .5) * .07 + (fbm(uv*vec2(9., 12.) + k*2.) - .5) * .012;
  float dx = max(r.x - uv.x, uv.x - r.z) + e;
  float dy = max(r.y - uv.y, uv.y - r.w) + e*1.3;
  return 1. - smoothstep(-soft, soft*.6, max(dx, dy));
}
void main(){
  vec2 uv = gl_FragCoord.xy / res;
  vec2 q = vec2(uv.x * res.x / res.y, uv.y);
  vec3 col = ground * (.82 + .3*fbm(q*1.6 + seed));
  float drag = fbm(vec2(q.x*1.2, q.y*26.) + seed*3. + .01*t);
  float drag2 = fbm(vec2(q.x*2.2, q.y*60.) + seed*7.);
  float cloud = fbm(q*2.6 + seed*5. + .008*t);
  float breathe = .5 + .5*sin(t*.12 + seed*6.);
  float a = slab(uv, rA, .06, 1.);
  float b = slab(uv, rB, .045, 4.);
  float c = slab(uv, rC, .065, 8.);
  col = mix(col, cA * (.7 + .26*drag + .08*drag2 + .3*cloud), a*.94);
  col = mix(col, cB * (.72 + .24*drag + .06*drag2 + .3*cloud), b*.95);
  col = mix(col, cC * (.72 + .24*drag + .3*cloud), c*.93);
  float seam = (smoothstep(0., .5, a) - smoothstep(.5, 1., a)) + (smoothstep(0., .5, b) - smoothstep(.5, 1., b)) + (smoothstep(0., .5, c) - smoothstep(.5, 1., c));
  col += glow * seam * (.05 + .03*breathe);
  col += glow * .06 * exp(-pow((uv.y - (rB.y + rA.w)*.5) * 9., 2.)) * (.6 + .4*breathe);
  // a soft light carried across the canvas by the viewer's pointer
  vec2 lp = vec2(light.x * res.x / res.y, light.y);
  col += glow * light.z * .16 * exp(-dot(q - lp, q - lp) * 2.6) * (.6 + .4*cloud);
  float weave = .5 + .25*sin(gl_FragCoord.x*1.9) + .25*sin(gl_FragCoord.y*1.7);
  col *= .93 + .07*weave;
  col *= .94 + .12*h(gl_FragCoord.xy*.37);
  col *= .55 + .45*smoothstep(1.25, .25, length((uv - .5)*vec2(1.05, 1.2)));
  gl_FragColor = vec4(col, 1.);
}`;
  const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }';

  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeGL() {
    const c = document.createElement('canvas');
    let gl = null;
    try { gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['res', 't', 'seed', 'ground', 'cA', 'cB', 'cC', 'glow', 'rA', 'rB', 'rC', 'light'].forEach((k) => { U[k] = gl.getUniformLocation(pr, k); });
    let lost = false;
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
    return {
      c,
      ok: () => !lost,
      draw(w, h, o) {
        c.width = w; c.height = h; gl.viewport(0, 0, w, h);
        gl.uniform2f(U.res, w, h); gl.uniform1f(U.t, o.t); gl.uniform1f(U.seed, o.seed);
        ['ground', 'cA', 'cB', 'cC', 'glow'].forEach((k, i) => gl.uniform3fv(U[k], o.pal[i]));
        ['rA', 'rB', 'rC'].forEach((k, i) => gl.uniform4fv(U[k], o.rects[i]));
        gl.uniform3f(U.light, o.light[0], o.light[1], o.light[2]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  const G = makeGL();
  if (!G) return;   // the CSS fallback stays in place
  document.documentElement.classList.add('has-paint');

  const items = [];
  const SCALE = 0.6;   // render below device resolution: the paint is soft anyway

  function setup(el) {
    const canvas = el.querySelector('canvas');
    if (!canvas) return null;
    const name = el.getAttribute('data-paint');
    const comp = el.getAttribute('data-comp') || '0';
    const it = {
      el, canvas, ctx: canvas.getContext('2d'),
      pal: (PALETTES[name] || PALETTES.ember).map(hex),
      rects: COMPS[comp] || COMPS[0],
      seed: Number(el.getAttribute('data-seed')) || 0.37,
      live: el.hasAttribute('data-live') && !reduce,
      lit: el.hasAttribute('data-light') && !reduce,
      t: 0, visible: false, hover: false, drawn: false,
      light: [0.5, 0.5, 0], target: [0.5, 0.5, 0],
    };
    return it;
  }

  function paint(it) {
    if (!G.ok()) return;
    const r = it.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (it.canvas.width !== W || it.canvas.height !== H) { it.canvas.width = W; it.canvas.height = H; }
    G.draw(Math.max(2, Math.round(W * SCALE)), Math.max(2, Math.round(H * SCALE)), it);
    it.ctx.drawImage(G.c, 0, 0, W, H);
    if (!it.drawn) { it.drawn = true; it.el.classList.add('is-painted'); }
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const it = items.find((x) => x.el === e.target);
      if (!it) return;
      it.visible = e.isIntersecting;
      if (it.visible && !it.drawn) paint(it);
    });
  }, { rootMargin: '300px 0px' });

  document.querySelectorAll('[data-paint]').forEach((el) => {
    const it = setup(el);
    if (!it) return;
    items.push(it);
    io.observe(el);
    if (it.lit) {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        it.target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, 1];
      });
      el.addEventListener('pointerleave', () => { it.target = [it.target[0], it.target[1], 0]; });
    }
    // a painting on the page comes alive while it is hovered
    const host = el.closest('[data-paint-host]');
    if (host && !reduce) {
      host.addEventListener('pointerenter', () => { it.hover = true; });
      host.addEventListener('pointerleave', () => { it.hover = false; });
    }
  });

  // one loop for everything that moves; about 12 frames a second is plenty for paint that breathes
  let last = 0;
  const start = performance.now();
  function loop(ms) {
    requestAnimationFrame(loop);
    if (document.hidden || ms - last < 80) return;
    const dt = Math.min(0.2, (ms - last) / 1000);
    last = ms;
    for (const it of items) {
      if (!it.visible || !(it.live || it.hover || it.light[2] > 0.01 || it.target[2] > 0)) continue;
      if (it.live) it.t = (ms - start) / 1000;
      else if (it.hover) it.t += dt * 3;
      if (it.lit) {
        const k = 1 - Math.pow(0.02, dt);
        for (let i = 0; i < 3; i++) it.light[i] += (it.target[i] - it.light[i]) * k;
      }
      paint(it);
    }
  }
  if (!reduce) requestAnimationFrame(loop);

  let pending = 0;
  window.addEventListener('resize', () => {
    clearTimeout(pending);
    pending = setTimeout(() => items.forEach((it) => { if (it.visible) paint(it); else it.drawn = false; }), 150);
  });

  window.Paint = { PALETTES, COMPS };
})();
