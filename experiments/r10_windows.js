/* R10: time windows and path sums. Run: node experiments/r10_windows.js -> results/r10_windows.json

   Two 2025 papers on real time windows prompted this round:
   - Drebitz, Rausch & Kreiter, Nat Commun 2025: single spike volleys evoked in macaque V2 disturb V4 (and the
     monkey's behaviour) only when they arrive within about +-45 deg of V4's gamma cycle.
   - Norman-Haignere et al., Nat Neurosci 2025: integration windows in human auditory cortex barely stretch
     (~5%) when speech is stretched or compressed: they are yoked to absolute time, not to structure.

   R10a  How wide should a listener's window be? Window width vs number of addresses per rotation vs jitter.
   R10b  Time-yoked or rhythm-yoked windows: what happens to a locked listener's window when the sender slows.
   R10c  The vector platform is a one-frequency path sum (Feynman): identity, stationary phase, aliasing.
*/
const fs = require('fs');
const path = require('path');
const { Yard } = require('../turntable_core.js');
const R8 = require('./r8_phase.js');

const P = 32, TAU = 2 * Math.PI;
const r = x => +x.toFixed(4);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
function rng(seed) {                                 // mulberry32
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(R) { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * R()); }

/* ---------- R10a: window width, address count, jitter ---------- */
// the v3 listener (data on track B, 4 compartments), with gate sharpness kappa; threshold = frac * best single load
const calCache = new Map();
function calib(kappa) {
  if (calCache.has(kappa)) return calCache.get(kappa);
  let aBest = 0, m = -1;
  for (let a = 0; a < P; a++) {
    const y = new Yard({ threshold: Infinity, lengths: [12, 4, 12], kappa }); y.keepHistory = 1e6;
    y.carriage(1, 64 + a); y.run(64 + a + 3 * P);
    const v = Math.max(...y.history.map(h => h.load));
    if (v > m) { m = v; aBest = a; }
  }
  const out = { aBest, m }; calCache.set(kappa, out); return out;
}
function fires(kappa, thr, psi, t) {
  const y = new Yard({ theta0: psi, threshold: thr, lengths: [12, 4, 12], kappa });
  y.carriage(1, t); y.run(t + 3 * P);
  return y.carriagesOut() > 0 ? 1 : 0;
}
function windowTicks(kappa, frac) {
  const { m } = calib(kappa);
  return range(0, P - 1).reduce((n, a) => n + fires(kappa, frac * m, 0, 64 + a), 0);
}
// K addresses spread evenly over one rotation; listener k is tuned to address k
function addressBook(kappa, frac, K) {
  const { aBest, m } = calib(kappa), thr = frac * m;
  const off = k => Math.round(k * P / K);
  const psis = range(0, K - 1).map(k => (((aBest - off(k)) % P + P) % P) * TAU / P);
  const correct = (k, s) => psis.every((psi, j) => fires(kappa, thr, psi, 64 + off(k) + s) === (j === k ? 1 : 0));
  return { correct, K };
}
function shiftSpan(book) {
  const ok = s => range(0, book.K - 1).every(k => book.correct(k, s));
  if (!ok(0)) return { span: 0, from: null, to: null };
  let lo = 0, hi = 0;
  while (lo > -16 && ok(lo - 1)) lo--;
  while (hi < 16 && ok(hi + 1)) hi++;
  return { span: hi - lo + 1, from: lo, to: hi };
}
function randomJitterAccuracy(book, sigma, trials = 300, seed = 11) {
  const R = rng(seed + Math.round(sigma * 100) + book.K * 1000);
  let ok = 0;
  for (let n = 0; n < trials; n++) { const k = n % book.K; ok += book.correct(k, Math.round(sigma * gauss(R))) ? 1 : 0; }
  return r(ok / trials);
}

const KAPPAS = [16, 8, 4, 2, 1], FRACS = [0.8, 0.6, 0.4, 0.25];

function r10a() {
  const out = { note: 'window = arrival ticks (of 32) that make one listener fire; 1 tick = 11.25 deg', window_ticks: {}, by_address_count: {} };
  for (const kappa of KAPPAS) out.window_ticks[`kappa_${kappa}`] = Object.fromEntries(FRACS.map(f => [`thr_${f}`, windowTicks(kappa, f)]));
  out.v3_listener = { kappa: 8, thr: 0.6, window_ticks: out.window_ticks.kappa_8['thr_0.6'], window_deg: out.window_ticks.kappa_8['thr_0.6'] * 360 / P };
  for (const K of [2, 3, 4, 5, 6, 8]) {
    let best = null;
    for (const kappa of KAPPAS) for (const f of FRACS) {
      const s = shiftSpan(addressBook(kappa, f, K));
      if (!best || s.span > best.span) best = { kappa, thr: f, ...s };
    }
    const v3 = addressBook(8, 0.6, K), bb = addressBook(best.kappa, best.thr, K);
    out.by_address_count[K] = {
      spacing_ticks: r(P / K),
      v3_listener: { shifts_survived: shiftSpan(v3) },
      best_listener: { kappa: best.kappa, thr: best.thr, window_ticks: windowTicks(best.kappa, best.thr), shifts_survived: { span: best.span, from: best.from, to: best.to } },
      random_jitter_accuracy: Object.fromEntries([0.5, 1, 2, 3].map(sg => [`sigma_${sg}`, { v3_listener: randomJitterAccuracy(v3, sg), best_listener: randomJitterAccuracy(bb, sg) }])),
    };
  }
  return out;
}

/* ---------- R10b: does a locked listener's window follow the sender's rhythm? ---------- */
const B8 = R8.r8b();
const PSIS = B8.listener_phase_offsets_deg.map(d => d * Math.PI / 180), E0 = R8.E0;
const LPHI = require('./r9_entrain.js').LPHI;
// the listener's integration window: peak platform load against the data's offset after the pilot, full width at half max
function lockedWindow(Ps, learn, li = 2, nd = 30) {
  const prof = [];
  for (let x = 0; x < Ps; x++) {
    const y = new Yard({ theta0: PSIS[li], threshold: Infinity, lengths: [12, 4, 12], weights: [0, 1, 1], angles: [LPHI[li], Math.PI, 3 * Math.PI / 2],
                         kick: 0.4, kickWeights: [1, 0, 0], clockLearn: learn });
    y.keepHistory = 1e6;
    for (let n = 0; n < nd + 4; n++) y.carriage(0, n * Ps + E0);
    const t0 = nd * Ps + E0 + x;
    y.carriage(1, t0); y.run((nd + 4) * Ps + 2 * P);
    prof.push(Math.max(...y.history.filter(h => h.t >= t0 && h.t < t0 + 2 * P).map(h => h.load)));
  }
  const m = Math.max(...prof), k = prof.indexOf(m), half = m / 2, at = i => prof[((i % Ps) + Ps) % Ps];
  let lo = k; while (at(lo - 1) >= half) lo--;
  let hi = k; while (at(hi + 1) >= half) hi++;
  const left = lo - 1 + (half - at(lo - 1)) / (at(lo) - at(lo - 1));      // linear interpolation at both edges
  const right = hi + (at(hi) - half) / (at(hi) - at(hi + 1));
  return { fwhm_ticks: r(right - left), peak_offset: k };
}
function r10b() {
  const out = { note: 'integration window = full width at half max of the peak platform load against the data offset after the pilot (ticks), listener locked to a sender of period Ps. The pilot pulls 12-21 ticks after it leaves. Data for listener 1 rolls in 13-18 ticks after (inside the pull), for listener 2 21-26 (at its tail), for listener 3 29-34 (outside it).',
                sender_period_ratio_35_over_29: r(35 / 29), by_listener: {} };
  for (const li of [0, 1, 2]) {
    const row = {};
    for (const [name, learn] of [['kick_only', 0], ['kick_plus_clock_learning', 0.01]]) {
      const w = {};
      for (const Ps of [29, 32, 35]) w[`Ps_${Ps}`] = lockedWindow(Ps, learn, li);
      w.window_ratio_35_over_29 = r(w.Ps_35.fwhm_ticks / w.Ps_29.fwhm_ticks);
      row[name] = w;
    }
    out.by_listener[`listener_${li + 1}`] = row;
  }
  return out;
}

/* ---------- R10c: the vector platform as a path sum ---------- */
// an always-listening platform (kappa 0: every gate is 1) with no leak, so z keeps every piece exactly
function zOf(arrivals, period = P) {
  const y = new Yard({ kappa: 0, somaLeak: 0, threshold: Infinity, period, lengths: [12, 12, 12] });
  for (const [t, a] of arrivals) y.carriage(1, t, a);
  y.run(Math.max(...arrivals.map(x => x[0])) + 6 * P);
  return [y.zr, y.zi];
}
function r10c() {
  const out = {};
  // identity: z(routes) = S * sum_m a_m e^{i w T_m}, S = one carriage at delay 0
  const S = zOf([[0, 1]]), w = TAU / P;
  let worst = 0;
  const R = rng(5);
  for (let trial = 0; trial < 30; trial++) {
    const routes = Array.from({ length: 2 + Math.floor(R() * 10) }, () => [Math.floor(R() * 200), 0.2 + R()]);
    const [zr, zi] = zOf(routes);
    let pr = 0, pi = 0;
    for (const [T, a] of routes) { const c = Math.cos(w * T), s = Math.sin(w * T); pr += a * (S[0] * c - S[1] * s); pi += a * (S[0] * s + S[1] * c); }
    worst = Math.max(worst, Math.hypot(zr - pr, zi - pi));
  }
  out.identity = { trials: 30, max_abs_error_measured_vs_path_sum: worst, single_carriage_abs_z: r(Math.hypot(...S)) };
  // two routes: interference against their delay difference
  const one = Math.hypot(...S);
  out.two_routes_abs_z_over_single = Object.fromEntries([0, 4, 8, 12, 16, 24, 32, 48, 64].map(D => [`delta_${D}`, r(Math.hypot(...zOf([[0, 1], [D, 1]])) / one)]));
  // stationary phase: 41 routes, delays T_m = round(0.25 (m - 20)^2); partial sums from the centre outwards
  const T = range(0, 40).map(m => Math.round(0.25 * (m - 20) ** 2));
  const partial = [];
  for (const rad of [0, 2, 4, 6, 8, 10, 14, 20]) {
    const routes = T.filter((_, m) => Math.abs(m - 20) <= rad).map(t => [t, 1]);
    partial.push({ routes_within: rad, n_routes: routes.length, abs_z_over_single: r(Math.hypot(...zOf(routes)) / one) });
  }
  const all = Math.hypot(...zOf(T.map(t => [t, 1])));
  const noCentre = Math.hypot(...zOf(T.filter((_, m) => Math.abs(m - 20) > 4).map(t => [t, 1])));
  const noEdge = Math.hypot(...zOf(T.filter((_, m) => m > 8).map(t => [t, 1])));
  out.stationary_phase = { delays: T, partial_sums_from_centre: partial,
                           remove_9_central_routes: r(noCentre / all), remove_9_edge_routes: r(noEdge / all),
                           note: 'fraction of the full |z| left after removing routes' };
  // aliasing: delays T and T+32 are identical to a 32-tick clock; a 37-tick clock tells them apart
  const a32 = zOf([[40, 1]], 32), b32 = zOf([[72, 1]], 32), a37 = zOf([[40, 1]], 37), b37 = zOf([[72, 1]], 37);
  out.aliasing = { clock_32_difference: Math.hypot(a32[0] - b32[0], a32[1] - b32[1]),
                   clock_37_relative_difference: r(Math.hypot(a37[0] - b37[0], a37[1] - b37[1]) / Math.hypot(...a37)),
                   two_clocks_distinguish_delays_up_to: 32 * 37 };
  return out;
}

function main() {
  const out = { R10a_window_width: r10a(), R10b_time_yoked: r10b(), R10c_path_sum: r10c() };
  const dir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'r10_windows.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

if (require.main === module) main();
module.exports = { r10a, r10b, r10c, windowTicks, addressBook, shiftSpan, lockedWindow, zOf };
