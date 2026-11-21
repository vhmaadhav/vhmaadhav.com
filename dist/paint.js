/*
 * Colour-field paintings, generated in the browser.
 *
 * Every element with [data-paint] holds a <canvas>. The element's CSS draws a
 * flat fallback of the same palette, so without JavaScript or WebGL the page
 * still shows the painting's colours. With WebGL this file paints matte,
 * opaque slabs of colour over a ground, the way acrylic sits on canvas, with physical relief (short brush
 * strokes lit by a raking light), a faint seam of light where the slabs meet,
 * and a fingertip that pushes the wet paint.
 *
 *   data-paint="ember"     palette name (PALETTES below)
 *   data-comp="2"          composition (COMPS below)
 *   data-seed="0.37"       makes each painting its own
 *   data-live              keeps breathing while on screen (the hero); gets
 *                          its own WebGL context drawing straight to its canvas
 *   data-light             the light follows the pointer across it
 *   data-smudge="0|1"      force the fingertip smudge off / on
 *
 * Static paintings are drawn once by a shared context and then idle. Anything
 * that moves is driven by one requestAnimationFrame loop that sleeps whenever
 * nothing is animating, pauses off screen and while the tab is hidden, and
 * adapts its render resolution to the frame time it can afford.
 */
(function () {
  'use strict';

  // ground, slab A, slab B, slab C, seam light
  const PALETTES = {
    ember: ['#2a120d', '#5e1d14', '#e0782e', '#24110e', '#ff9a4a'],
    umber: ['#1f1712', '#6b4a2b', '#120d0b', '#a8722f', '#e0a050'],
    slate: ['#151a1c', '#2c3d42', '#b4552a', '#0e1214', '#d9733a'],
    plum: ['#1c1312', '#43201c', '#c56a2a', '#150d0c', '#e8873f'],
    olive: ['#1a1a12', '#545432', '#d8c7a0', '#13130e', '#efd9a8'],
    ink: ['#0f1218', '#1f2a40', '#8c3a24', '#0b0d12', '#d06a3c'],
    maroon: ['#1c0c0b', '#3e1210', '#0e0807', '#7a1f17', '#c8502e'],
    tobacco: ['#1b130d', '#7a4a22', '#2a1a10', '#c98b45', '#f0b060'],
  };

  // slab rectangles: x0, y0, x1, y1 in 0..1, y measured upwards.
  // A .band property (optional) places the faint ambient glow band (-1 = none).
  const COMPS = {
    0: [[0.07, 0.5, 0.93, 0.93], [0.07, 0.4, 0.93, 0.47], [0.07, 0.07, 0.93, 0.36]],
    1: [[0.08, 0.62, 0.92, 0.92], [0.08, 0.1, 0.92, 0.58], [0.3, 0.3, 0.7, 0.38]],
    2: [[0.06, 0.08, 0.94, 0.44], [0.06, 0.5, 0.94, 0.56], [0.06, 0.62, 0.94, 0.94]],
    3: [[0.1, 0.55, 0.9, 0.9], [0.1, 0.46, 0.9, 0.51], [0.1, 0.1, 0.9, 0.42]],
    hero: [[0.04, 0.63, 0.96, 0.95], [0.04, 0.545, 0.96, 0.585], [0.04, 0.05, 0.96, 0.5]],
    foot: [[0.05, 0.55, 0.95, 0.93], [0.05, 0.47, 0.95, 0.51], [0.05, 0.06, 0.95, 0.43]],
    banner: [[0.03, 0.56, 0.97, 0.94], [0.03, 0.44, 0.97, 0.5], [0.03, 0.06, 0.97, 0.38]],
    // ~21:9: two broad bands and a thin seam between them
    wide: [[0.03, 0.53, 0.97, 0.9], [0.03, 0.478, 0.97, 0.508], [0.03, 0.1, 0.97, 0.45]],
    // portrait: three slabs stacked, the middle one narrower
    tall: [[0.1, 0.63, 0.9, 0.94], [0.1, 0.4, 0.9, 0.58], [0.1, 0.06, 0.9, 0.35]],
    // roughly square: a lifted inset slab between two wide ones
    square: [[0.1, 0.57, 0.9, 0.9], [0.2, 0.37, 0.8, 0.5], [0.1, 0.1, 0.9, 0.32]],
    // two slabs side by side (the third is out of frame)
    pair: [[0.07, 0.1, 0.475, 0.9], [0, 3, 0, 3], [0.525, 0.1, 0.93, 0.9]],
  };
  COMPS.pair.band = -1;
  COMPS.square.band = 0.46;
  COMPS.tall.band = 0.5;
  COMPS.wide.band = 0.49;

  const FRAG = `
precision highp float;
uniform vec2 res; uniform float t; uniform float seed; uniform float dev; uniform float smOn;
uniform float bandY; uniform float bandA;
uniform vec3 ground; uniform vec3 cA; uniform vec3 cB; uniform vec3 cC; uniform vec3 glow;
uniform vec4 rA; uniform vec4 rB; uniform vec4 rC;
uniform vec4 light;
uniform sampler2D sm; uniform vec2 smPx;

float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + seed*57.3) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
// truncated fbm, rescaled so its mean matches the original five-octave one
float fbm2(vec2 p){ float v=.5*n(p); p=p*2.03+.31; v+=.25*n(p); return v*1.2917; }
float fbm3(vec2 p){ float v=.5*n(p); p=p*2.03+.31; v+=.25*n(p); p=p*2.03+.31; v+=.125*n(p); return v*1.1071; }
float fbm4(vec2 p){ float v=.5*n(p); p=p*2.03+.31; v+=.25*n(p); p=p*2.03+.31; v+=.125*n(p); p=p*2.03+.31; v+=.0625*n(p); return v*1.0333; }

vec2 dec(vec2 s){ return (s*255. - 128.) / 127. * .1; }

// one slab; ph staggers the "develop" reveal, halo is the wide smoky skirt (sfumato)
float slab(vec2 uv, vec4 r, float soft, float k, float ph, out float halo){
  float e = (fbm4(uv*vec2(2.2, 3.4) + k + .02*t) - .5) * .07 + (fbm2(uv*vec2(9., 12.) + k*2.) - .5) * .012;
  vec2 c = (r.xy + r.zw) * .5, hs = (r.zw - r.xy) * .5;
  float sf = 1., po = 1.;
  if (dev < 1.) {
    float p = clamp((dev - ph) / (1. - ph), 0., 1.);
    float ease = p*p*(3. - 2.*p);
    e += (1. - ease) * (fbm2(uv*vec2(7., 11.) + k*3.) - .48) * .16;     // the soaking edge
    hs *= vec2(mix(.3, 1., ease), mix(.02, 1., ease));                    // spreads out from the centre line
    sf = 1. + (1. - ease) * 1.4;
    po = smoothstep(0., .35, p);
  }
  vec2 dd = abs(uv - c) - hs;
  float d = max(dd.x + e, dd.y + e*1.3);
  halo = (1. - smoothstep(-soft*2.*sf, soft*3.2*sf, d)) * po;
  return (1. - smoothstep(-soft*sf, soft*.6*sf, d)) * po;
}

// short directional bristle strokes: elongated along x in a fixed slab frame, with the lines
// only gently warped by a slow flow, so the relief reads as paint and never as swirls
float stroke(vec2 q, vec2 flow, float tilt){
  float cs = cos(tilt), sn = sin(tilt);
  vec2 p = vec2(cs*q.x + sn*q.y, -sn*q.x + cs*q.y) + flow;
  float body = n(vec2(p.x*6., p.y*34.));                                     // the stroke itself
  float ends = n(vec2(p.x*2.3 + 9., p.y*11.));                               // where one stroke gives way to the next
  float bristle = n(vec2(p.x*14. + body*2., p.y*110.));
  float fine = n(vec2(p.x*26., p.y*190. + 5.));
  return (body*.5 + bristle*.3 + fine*.2) * (.55 + .9*ends);
}

void main(){
  float asp = res.x / res.y;
  vec2 uv0 = gl_FragCoord.xy / res;
  vec2 q0 = vec2(uv0.x * asp, uv0.y);

  // the fingertip: wet paint is pushed, so the painting is looked up where it came from
  vec2 dsp = vec2(0.);
  if (smOn > .5) dsp = dec(texture2D(sm, uv0).rg);
  vec2 uv = uv0 - dsp;
  vec2 q = vec2(uv.x * asp, uv.y);

  vec3 col = ground * (.92 + .2*fbm3(q*1.6 + seed));
  float drag = fbm4(vec2(q.x*1.2, q.y*26.) + seed*3. + .01*t);
  float drag2 = fbm2(vec2(q.x*2.2, q.y*60.) + seed*7.);
  float cloud = fbm3(q*2.6 + seed*5. + .008*t);
  float breathe = .5 + .5*sin(t*.12 + seed*6.);

  float ha, hb, hc;
  float a = slab(uv, rA, .032, 1., 0., ha);
  float b = slab(uv, rB, .026, 4., .22, hb);
  float c = slab(uv, rC, .036, 8., .08, hc);

  // sfumato: each slab breathes a faint smoke of its own colour into the ground around it
  col = mix(col, cA * (.55 + .3*cloud), clamp(ha - a, 0., 1.) * .07);
  col = mix(col, cB * (.55 + .3*cloud), clamp(hb - b, 0., 1.) * .05);
  col = mix(col, cC * (.55 + .3*cloud), clamp(hc - c, 0., 1.) * .07);

  col = mix(col, cA * (.86 + .13*drag + .05*drag2 + .1*cloud), a*.97);
  col = mix(col, cB * (.87 + .12*drag + .04*drag2 + .1*cloud), b*.97);
  col = mix(col, cC * (.87 + .12*drag + .1*cloud), c*.97);

  // the seam of light, a little brighter near the pointer
  vec2 pq = vec2(light.x * asp, light.y);
  float near = exp(-dot(q0 - pq, q0 - pq) * 9.) * light.z;
  float seam = (smoothstep(0., .5, a) - smoothstep(.5, 1., a)) + (smoothstep(0., .5, b) - smoothstep(.5, 1., b)) + (smoothstep(0., .5, c) - smoothstep(.5, 1., c));
  col += glow * seam * (.05 + .03*breathe) * (1. + 1.6*near);
  col += glow * .06 * bandA * exp(-pow((uv.y - bandY) * 9., 2.)) * (.6 + .4*breathe);
  col += glow * light.z * .16 * exp(-dot(q0 - pq, q0 - pq) * 2.6) * (.6 + .4*cloud);

  // impasto: a height field of brush strokes whose direction drifts slowly across each slab
  float thick = clamp(a*.9 + b*.95 + c*.9, 0., 1.);
  float ridge = max(max(a*(1.-a), b*(1.-b)), c*(1.-c)) * 4.;
  vec2 flow = vec2(fbm2(q*.9 + seed*2.) - .48, fbm2(q*.9 + seed*4. + 7.) - .48) * .034;
  float tilt = a*.02 - b*.05 + c*.035;
  float eps = .0026;
  float h0 = stroke(q, flow, tilt);
  vec2 g = vec2(stroke(q + vec2(eps, 0.), flow, tilt) - h0, stroke(q + vec2(0., eps), flow, tilt) - h0) / eps;
  g *= .0068 * thick * (.6 + .9*ridge);
  float pileW = 0.;
  if (smOn > .5) {
    float m0 = length(dsp);
    float mx = length(dec(texture2D(sm, uv0 + vec2(smPx.x, 0.)).rg));
    float my = length(dec(texture2D(sm, uv0 + vec2(0., smPx.y)).rg));
    g += vec2(mx - m0, my - m0) / smPx * .5;   // the paint piles up in front of the finger
    pileW = m0;
  }
  vec3 N = normalize(vec3(-g, 1.));

  // raking light: from the upper left by default, from the pointer when it is over the painting
  vec3 L = normalize(vec3(-.55, .58, .5));
  if (light.z > .001) {
    vec3 Lp = normalize(vec3((light.xy - uv0) * vec2(asp, 1.), .45));
    L = normalize(mix(L, Lp, light.z));
  }
  float lam = dot(N, L) - L.z;
  float body = .3 + .7*thick;
  col *= 1. + lam * .62 * body;
  col += glow * max(lam, 0.) * .035 * body;
  vec3 Hv = normalize(L + vec3(0., 0., 1.));
  float sp = pow(max(dot(N, Hv), 0.), 46.) - pow(Hv.z, 46.);
  col += mix(vec3(.5), glow, .55) * max(sp, 0.) * .07 * (.25 + .75*thick);
  col = max(col, 0.);

  float weave = .5 + .25*sin(gl_FragCoord.x*1.9) + .25*sin(gl_FragCoord.y*1.7);
  col *= .93 + .07*weave;
  col *= .94 + .12*h(gl_FragCoord.xy*.37);
  col *= .74 + .26*smoothstep(1.25, .25, length((uv0 - .5)*vec2(1.05, 1.2)));
  col = col * 1.07 + .008;
  gl_FragColor = vec4(col, 1.);
}`;
  const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }';

  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------------------------------------------------------------- renderer
  // One GL context + program + smudge texture. Dedicated renderers own a
  // painting's canvas; the shared one draws offscreen and is copied out.
  function makeRenderer(canvas, onLost) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { c: canvas, lost: false };
    let U = {}, tex = null;
    function init() {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      const pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      U = {};
      ['res', 't', 'seed', 'dev', 'smOn', 'bandY', 'bandA', 'ground', 'cA', 'cB', 'cC', 'glow', 'rA', 'rB', 'rC', 'light', 'sm', 'smPx']
        .forEach((k) => { U[k] = gl.getUniformLocation(pr, k); });
      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(U.sm, 0);
      return true;
    }
    if (!init()) return null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; if (onLost) onLost(R); });
    canvas.addEventListener('webglcontextrestored', () => { R.lost = !init(); if (!R.lost && R.onRestored) R.onRestored(R); });
    R.draw = function (w, h, it) {
      if (R.lost) return false;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.res, w, h); gl.uniform1f(U.t, it.t); gl.uniform1f(U.seed, it.seed); gl.uniform1f(U.dev, it.dev);
      gl.uniform1f(U.bandY, it.bandY); gl.uniform1f(U.bandA, it.bandA);
      ['ground', 'cA', 'cB', 'cC', 'glow'].forEach((k, i) => gl.uniform3fv(U[k], it.pal[i]));
      ['rA', 'rB', 'rC'].forEach((k, i) => gl.uniform4fv(U[k], it.rects[i]));
      gl.uniform4f(U.light, it.light[0], it.light[1], it.light[2], 0);
      const s = it.sm;
      if (s && s.on) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.gw, s.gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.bytes);
        gl.uniform1f(U.smOn, 1); gl.uniform2f(U.smPx, 1 / s.gw, 1 / s.gh);
      } else gl.uniform1f(U.smOn, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    };
    return R;
  }

  // ---------------------------------------------------------------- smudge
  // A small displacement field on the CPU (64 x ~36): pointer velocity splats
  // into it, it is advected along itself, diffused a touch and decays in ~1.5 s,
  // then goes up as an RGBA8 texture. A few thousand cells cost microseconds,
  // which beats ping-pong float framebuffers (no half-float / render-target
  // support to probe, and nothing to read back).
  const RANGE = 0.1, TAU = 0.42;
  function makeSm(aspect) {
    const gw = 64, gh = clamp(Math.round(64 / aspect), 24, 64), n = gw * gh;
    return { gw, gh, dx: new Float32Array(n), dy: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n), bytes: new Uint8Array(n * 4), energy: 0, on: false };
  }
  function smSplat(s, u, v, mx, my, asp) {
    const sig = 0.075, r = 3 * sig;
    const i0 = Math.max(0, Math.floor((u - r / asp) * s.gw)), i1 = Math.min(s.gw - 1, Math.ceil((u + r / asp) * s.gw));
    const j0 = Math.max(0, Math.floor((v - r) * s.gh)), j1 = Math.min(s.gh - 1, Math.ceil((v + r) * s.gh));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const rx = ((i + 0.5) / s.gw - u) * asp, ry = (j + 0.5) / s.gh - v;
        const w = Math.exp(-(rx * rx + ry * ry) / (2 * sig * sig)) * 0.9, k = j * s.gw + i;
        s.dx[k] = clamp(s.dx[k] + mx * w, -RANGE * 0.95, RANGE * 0.95);
        s.dy[k] = clamp(s.dy[k] + my * w, -RANGE * 0.95, RANGE * 0.95);
      }
    }
    s.on = true;
  }
  function smStep(s, dt) {
    if (!s.on) return;
    const { gw, gh, dx, dy, tx, ty, bytes } = s;
    const decay = Math.exp(-dt / TAU), adv = dt * 3;
    // advect (semi-Lagrangian, bilinear) and decay
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const px = clamp(i - dx[k] * adv * gw, 0, gw - 1), py = clamp(j - dy[k] * adv * gh, 0, gh - 1);
        const i0 = px | 0, j0 = py | 0, i1 = Math.min(gw - 1, i0 + 1), j1 = Math.min(gh - 1, j0 + 1);
        const fx = px - i0, fy = py - j0;
        const a = j0 * gw + i0, b = j0 * gw + i1, c = j1 * gw + i0, d = j1 * gw + i1;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        tx[k] = (dx[a] * w00 + dx[b] * w10 + dx[c] * w01 + dx[d] * w11) * decay;
        ty[k] = (dy[a] * w00 + dy[b] * w10 + dy[c] * w01 + dy[d] * w11) * decay;
      }
    }
    // a little diffusion, then encode
    let e = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const l = i > 0 ? k - 1 : k, r = i < gw - 1 ? k + 1 : k, dn = j > 0 ? k - gw : k, up = j < gh - 1 ? k + gw : k;
        const vx = tx[k] * 0.8 + (tx[l] + tx[r] + tx[dn] + tx[up]) * 0.05;
        const vy = ty[k] * 0.8 + (ty[l] + ty[r] + ty[dn] + ty[up]) * 0.05;
        dx[k] = vx; dy[k] = vy;
        const m = Math.abs(vx) + Math.abs(vy);
        if (m > e) e = m;
        const o = k * 4;
        bytes[o] = clamp(Math.round(128 + (vx / RANGE) * 127), 1, 255);
        bytes[o + 1] = clamp(Math.round(128 + (vy / RANGE) * 127), 1, 255);
        bytes[o + 2] = 0; bytes[o + 3] = 255;
      }
    }
    s.energy = e;
    if (e < 0.0007) { dx.fill(0); dy.fill(0); s.on = false; s.energy = 0; }
  }

  // ---------------------------------------------------------------- setup
  const doc = document.documentElement;
  const els = Array.prototype.slice.call(document.querySelectorAll('[data-paint]'));
  if (!els.length) { window.Paint = { PALETTES, COMPS }; return; }

  const items = [];
  const STATIC_SCALE = 0.9, MIN_SCALE = 0.35, MAX_SCALE = 0.75, START_SCALE = 0.6;
  const DEV_MS = 1600;
  let shared = null, sharedFailed = false;

  function fail(it) { it.failed = true; it.el.classList.remove('is-painted'); it.el.classList.add('paint-failed'); }

  function sharedRenderer() {
    if (shared || sharedFailed) return shared;
    shared = makeRenderer(document.createElement('canvas'), () => items.forEach((it) => { if (it.r === shared) fail(it); }));
    if (!shared) sharedFailed = true;
    return shared;
  }

  function setup(el) {
    const canvas = el.querySelector('canvas');
    if (!canvas) return null;
    const name = el.getAttribute('data-paint');
    const comp = el.getAttribute('data-comp') || '0';
    const rects = COMPS[comp] || COMPS[0];
    const host = el.closest('[data-paint-host]');
    const nf = !!el.closest('.nf');
    const live = el.hasAttribute('data-live') && !reduce;
    const sa = el.getAttribute('data-smudge');
    const noDev = reduce || el.getAttribute('data-develop') === '0';   // e.g. the hero, whose poster already shows the finished painting
    const it = {
      el, canvas, host, live, ctx: null, r: null,
      pal: (PALETTES[name] || PALETTES.ember).map(hex),
      rects,
      bandY: rects.band !== undefined ? rects.band : (rects[1][1] + rects[0][3]) * 0.5,
      bandA: rects.band === -1 ? 0 : 1,
      seed: Number(el.getAttribute('data-seed')) || 0.37,
      lit: !reduce && (el.hasAttribute('data-light') || live || !!host || nf),
      smOn: !reduce && sa !== '0' && (sa !== null || live || !!host || nf),
      t: 0, dev: noDev ? 1 : 0, devStart: -1, devRun: false, devDone: noDev,
      near: false, visible: false, drawn: false, queued: false, failed: false,
      hover: false, wasActive: false,
      light: [0.5, 0.5, 0], target: [0.5, 0.5, 0], pu: null,
      cw: el.clientWidth, ch: el.clientHeight,
      sm: null, scale: START_SCALE, maxScale: MAX_SCALE, ema: 16.7, lastFrame: 0, since: 0, upAt: 0, calm: 0,
    };
    it.inside = false;
    if (live) {
      it.r = makeRenderer(canvas, () => fail(it));
      if (it.r) {
        it.r.onRestored = () => { it.failed = false; it.el.classList.remove('paint-failed'); it.drawn = false; enqueue(it); };
      }
    }
    return it;
  }

  els.forEach((el) => { const it = setup(el); if (it) items.push(it); });
  if (!items.length) return;
  // everything that is not live shares one context (created on first use); if even
  // the dedicated ones failed and no shared context works, the fallback stays
  if (!items.some((it) => it.r) && !sharedRenderer()) return;
  doc.classList.add('has-paint');

  // ---------------------------------------------------------------- drawing
  function size(it, animating) {
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    const s = animating ? it.scale : STATIC_SCALE;
    return [Math.max(2, Math.round(it.cw * pr * s)), Math.max(2, Math.round(it.ch * pr * s))];
  }

  function draw(it, animating) {
    if (it.failed || it.cw < 2 || it.ch < 2) return false;
    const wh = size(it, animating);
    let r = it.r;
    if (r) {
      if (!r.draw(wh[0], wh[1], it)) return false;
    } else {
      r = sharedRenderer();
      if (!r) { fail(it); return false; }
      if (!it.ctx) it.ctx = it.canvas.getContext('2d', { alpha: false });
      if (!it.ctx) { fail(it); return false; }
      if (!r.draw(wh[0], wh[1], it)) return false;
      if (it.canvas.width !== wh[0] || it.canvas.height !== wh[1]) { it.canvas.width = wh[0]; it.canvas.height = wh[1]; }
      it.ctx.drawImage(r.c, 0, 0);
    }
    if (!it.drawn) { it.drawn = true; it.el.classList.add('is-painted'); }
    return true;
  }

  const queue = [];
  function enqueue(it) {
    if (it.queued || it.failed) return;
    it.queued = true;
    if (it.live) queue.unshift(it); else queue.push(it);
    wake();
  }

  function startDevelop(it, now) {
    if (it.devDone || it.devRun) return;
    it.devRun = true; it.devStart = now;
  }

  function needsFrame(it) {
    if (!it.visible || it.failed || !it.drawn) return false;
    return it.live || it.hover || it.devRun || (it.sm && it.sm.on) || Math.abs(it.light[2] - it.target[2]) > 0.004 || (it.lit && it.target[2] > 0 && Math.abs(it.light[0] - it.target[0]) + Math.abs(it.light[1] - it.target[1]) > 0.002);
  }

  // ---------------------------------------------------------------- loop
  let raf = 0, lastRender = 0, started = 0;
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }

  function adapt(it, now) {
    // frame-time EMA keeps the render scale inside what the machine can sustain
    if (it.lastFrame) {
      const dtm = now - it.lastFrame;
      if (dtm < 100) it.ema += (dtm - it.ema) * 0.1;
    }
    it.lastFrame = now; it.since++;
    if (it.since < 24) return;
    if (it.ema > 21 && it.scale > MIN_SCALE) {
      if (now - it.upAt < 4000) it.maxScale = it.scale;   // we climbed and fell straight back: remember the ceiling
      it.scale = Math.max(MIN_SCALE, it.scale * 0.86); it.since = 0; it.calm = 0;
    } else if (it.ema < 17.6) {
      if (++it.calm > 150 && it.scale < it.maxScale) { it.scale = Math.min(it.maxScale, it.scale * 1.04); it.upAt = now; it.since = 0; it.calm = 0; }
    } else it.calm = 0;
  }

  function frame(now) {
    raf = 0;
    if (document.hidden) return;
    if (!started) started = now;
    if (now - lastRender < 12) { raf = requestAnimationFrame(frame); return; }
    const dtRaw = lastRender ? Math.min(0.25, (now - lastRender) / 1000) : 0.016, dt = Math.min(0.1, dtRaw);
    lastRender = now;
    let more = false;

    // static paintings: one per frame, so a page of plates never janks
    if (queue.length) {
      const it = queue.shift();
      it.queued = false;
      if (!it.failed) {
        it.dev = it.devDone ? 1 : (it.devRun ? it.dev : 0);
        draw(it, it.live);
        if (it.visible) startDevelop(it, now);
      }
      if (queue.length) more = true;
    }

    for (const it of items) {
      const act = needsFrame(it);
      if (!act) {
        if (it.wasActive) {   // movement is over: settle on one crisp static frame
          it.wasActive = false; it.lastFrame = 0; it.since = 0;
          if (!it.live && it.visible && it.drawn) draw(it, false);
        }
        continue;
      }
      it.wasActive = true;
      if (it.live) it.t = (now - started) / 1000;
      else if (it.hover) it.t += dt * 2.5;
      if (it.devRun) {
        const p = (now - it.devStart) / DEV_MS;
        if (p >= 1) { it.dev = 1; it.devRun = false; it.devDone = true; } else it.dev = p;
      }
      if (it.lit) {
        const k = 1 - Math.pow(0.02, dt);
        for (let i = 0; i < 3; i++) it.light[i] += (it.target[i] - it.light[i]) * k;
        if (Math.abs(it.light[2] - it.target[2]) < 0.004) it.light[2] = it.target[2];
      }
      if (it.sm) smStep(it.sm, dtRaw);
      adapt(it, now);
      draw(it, true);
      if (needsFrame(it)) more = true;
    }
    if (more) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- observers
  const byEl = new Map(items.map((it) => [it.el, it]));
  // near the viewport: paint (undeveloped); in it: develop
  const ioNear = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const it = byEl.get(e.target);
      if (!it || !e.isIntersecting || it.near) return;
      it.near = true;
      if (!it.drawn) enqueue(it);
    });
  }, { rootMargin: '300px 0px' });
  const ioSee = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const it = byEl.get(e.target);
      if (!it) return;
      it.visible = e.isIntersecting;
      if (!it.visible) { it.lastFrame = 0; return; }
      if (!it.drawn) enqueue(it);
      else if (!it.devDone && !it.devRun) { startDevelop(it, performance.now()); }
      wake();
    });
  }, { threshold: 0.1 });

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    entries.forEach((e) => {
      const it = byEl.get(e.target);
      if (!it) return;
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      if (w === it.cw && h === it.ch) return;
      it.cw = w; it.ch = h; it.sm = null;
      if (it.drawn && it.near) { if (!needsFrame(it)) { it.dev = it.devDone ? 1 : it.dev; draw(it, false); } wake(); }
    });
  }) : null;

  items.forEach((it) => {
    ioNear.observe(it.el); ioSee.observe(it.el);
    if (ro) ro.observe(it.el);
    if (it.host && !reduce) {
      it.host.addEventListener('pointerenter', () => { it.hover = true; wake(); });
      it.host.addEventListener('pointerleave', () => { it.hover = false; it.target[2] = 0; it.pu = null; wake(); });
    }
  });

  // pointer: one passive listener (never preventDefault, so touch scrolling is untouched)
  if (!reduce) {
    const onMove = (e) => {
      let any = false;
      for (const it of items) {
        if (!it.lit || !it.visible || it.failed || !it.drawn) continue;
        const r = it.el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const u = (e.clientX - r.left) / r.width, v = 1 - (e.clientY - r.top) / r.height;
        const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
        const on = it.host ? it.hover : inside;
        if (!it.host) it.hover = !it.live && inside;
        if (!on) { if (it.target[2] > 0) { it.target[2] = 0; any = true; } it.pu = null; continue; }
        it.target[0] = u; it.target[1] = v; it.target[2] = 1; any = true;
        if (it.smOn) {
          const asp = r.width / r.height;
          if (!it.sm) it.sm = makeSm(asp);
          const now = e.timeStamp;
          if (it.pu && now - it.pu[2] < 120) {
            const mx = u - it.pu[0], my = v - it.pu[1];
            const len = Math.hypot(mx * asp, my), steps = Math.min(8, Math.max(1, Math.ceil(len / 0.03)));
            for (let k = 1; k <= steps; k++) smSplat(it.sm, it.pu[0] + (mx * k) / steps, it.pu[1] + (my * k) / steps, mx / steps, my / steps, asp);
          }
          it.pu = [u, v, now];
        }
      }
      if (any) wake();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    doc.addEventListener('pointerleave', () => { items.forEach((it) => { it.target[2] = 0; it.pu = null; if (!it.host) it.hover = false; }); wake(); });
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { items.forEach((it) => { it.lastFrame = 0; }); wake(); } });

  window.Paint = {
    PALETTES, COMPS,
    stats: () => items.map((it) => ({ comp: it.rects === COMPS.hero ? 'hero' : '', live: it.live, scale: +it.scale.toFixed(2), ema: +it.ema.toFixed(1), dev: +it.dev.toFixed(2), failed: it.failed })),
  };
})();
