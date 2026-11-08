/* R9: listeners that lock onto the sender's rhythm. Run: node experiments/r9_entrain.js -> results/r9_entrain.json

   v3's routing and XOR worked only when every train arrived within about a tick of where the receiving
   turntable expected it. Here the sender also sends a pilot: one carriage per rotation at its exit moment.
   Each receiver gets the pilot on a track with weight 0 (it never loads the platform) and kickWeight 1 (it
   pulls the turntable, v2's kick). So the receiver's turntable follows the sender's rhythm, and a train is
   read relative to the pilot, not relative to the receiver's own clock.

   R9a  A common delay (pilot and data shifted together): which delays still route?
   R9b  Jitter of different kinds: on the data alone, on the pilot alone, an unknown delay plus pilot jitter.
   R9c  A sender whose rotation period differs from the receiver's (kick alone, or kick + clock learning).
   R9d  Timing information (R8a's extra bits) when every trial carries an unknown common delay.
   R9e  The XOR yard locked to a pilot: common delay, C's own timing, period mismatch.
*/
const fs = require('fs');
const path = require('path');
const { Yard } = require('../turntable_core.js');
const R8 = require('./r8_phase.js');

const P = 32, TAU = 2 * Math.PI, E0 = R8.E0;
const KICK = 0.4, LEARN = 0.01, ND = 20;            // pilot rotations before the data train
const r = x => +x.toFixed(4);
const wrap = x => ((x + Math.PI) % TAU + TAU) % TAU - Math.PI;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
function rng(seed) {                                 // mulberry32
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const jitters = (seed, n, j) => { const R = rng(seed); return Array.from({ length: n }, () => Math.round((2 * R() - 1) * j)); };

/* The direction the free-running turntable faces, on average, while a pilot sent at t0 rolls off `track`.
   Putting the pilot's track at this angle makes the pilot's pull average to zero when nothing is delayed,
   so a locked receiver behaves like the free one until the timing moves. */
function pilotAngle(conf, track, t0) {
  const y = new Yard({ ...conf, threshold: Infinity }); y.keepHistory = 1e6;
  y.carriage(track, t0); y.run(4 * P);
  let sx = 0, sy = 0;
  for (const h of y.history) { const th = h.theta - TAU / P; sx += h.I[track] * Math.cos(th); sy += h.I[track] * Math.sin(th); }
  return Math.atan2(sy, sx);
}

/* ---------- listeners (R8b's three yards, plus a pilot track) ---------- */
const B8 = R8.r8b();
const PSIS = B8.listener_phase_offsets_deg.map(d => d * Math.PI / 180);
const LTHR = B8.listener_threshold, TAUS = B8.sender.map(s => s.tau);
const LPHI = PSIS.map(psi => pilotAngle({ theta0: psi, lengths: [12, 4, 12], weights: [0, 1, 1] }, 0, E0));
const WANT = ['100', '010', '001'];

function listenerCfg(k, lock) {
  return { theta0: PSIS[k], threshold: LTHR, lengths: [12, 4, 12], weights: [0, 1, 1],
           angles: [LPHI[k], Math.PI, 3 * Math.PI / 2], kick: lock.kick, kickWeights: [1, 0, 0], clockLearn: lock.learn || 0 };
}

/* o.d: common delay on pilot and data. o.Ps: sender period. o.scaled: the sender's timings are fractions of its
   rotation (true) or fixed tick counts (false; phaseOut is in ticks). o.dataJ: extra delay on the data only.
   o.pilotJ: per-rotation extra delay on the pilot. o.nd: pilot rotations before the data. */
function listen(k, tau, lock, o = {}) {
  const Ps = o.Ps || P, nd = o.nd || ND, d = o.d || 0;
  const at = ticks => (o.scaled ? Math.round(ticks * Ps / P) : ticks);
  const y = new Yard(listenerCfg(k, lock));
  for (let n = 0; n < nd + 4; n++) y.carriage(0, n * Ps + at(E0) + d + (o.pilotJ ? o.pilotJ[n] : 0));
  y.carriage(1, nd * Ps + at(E0 + tau) + d + (o.dataJ || 0));
  y.run((nd + 4) * Ps + 2 * P);
  return y.carriagesOut() > 0 ? 1 : 0;
}
const route = (lock, o) => TAUS.map(tau => [0, 1, 2].map(k => listen(k, tau, lock, o)).join(''));
const routedOK = (lock, o) => route(lock, o).every((x, i) => x === WANT[i]);
const routesKept = (lock, o) => route(lock, o).filter((x, i) => x === WANT[i]).length;

const FREE = { kick: 0 }, LOCK = { kick: KICK }, LOCK_LEARN = { kick: KICK, learn: LEARN };
const DELAYS = range(-16, 15);

function r9a() {
  const out = { pilot_track_angles_deg: LPHI.map(p => r(p * 180 / Math.PI)), pilot_rotations_before_data: ND,
                baseline_free: route(FREE, {}), baseline_locked: route(LOCK, {}), by_kick: {} };
  for (const kick of [0, 0.1, 0.2, 0.4, 0.8]) {
    const ok = DELAYS.filter(d => routedOK({ kick }, { d }));
    out.by_kick[kick] = { delays_routed: `${ok.length}/${DELAYS.length}`, delays: ok.length === DELAYS.length ? 'all of -16..15' : ok };
    // how many pilot rotations the lock needs before every delay routes
    if (ok.length === DELAYS.length) {
      out.by_kick[kick].rotations_to_lock_all_delays = null;
      for (let nd = 1; nd <= ND; nd++) if (DELAYS.every(d => routedOK({ kick }, { d, nd }))) { out.by_kick[kick].rotations_to_lock_all_delays = nd; break; }
    }
  }
  return out;
}

function r9b() {
  const out = { note: 'routes kept out of 6 (3 inputs x both signs) or, for random jitter, the fraction of routes kept over 20 trials',
                data_only_jitter: {}, pilot_jitter: {}, unknown_delay_plus_pilot_jitter_1: {} };
  for (const j of [1, 2, 3, 4, 6]) {
    const row = {};
    for (const [name, lock] of [['free', FREE], ['locked', LOCK]])
      row[name] = `${routesKept(lock, { dataJ: -j }) + routesKept(lock, { dataJ: j })}/6`;
    out.data_only_jitter[`plus_minus_${j}`] = row;
  }
  for (const j of [1, 2, 3, 4, 6]) {
    const row = {};
    for (const [name, lock] of [['free', FREE], ['kick_0.2', { kick: 0.2 }], ['kick_0.4', LOCK], ['kick_0.8', { kick: 0.8 }]]) {
      let kept = 0;
      for (let trial = 0; trial < 20; trial++) kept += routesKept(lock, { pilotJ: jitters(100 + trial, ND + 4, j) });
      row[name] = r(kept / 60);
    }
    out.pilot_jitter[`plus_minus_${j}`] = row;
  }
  for (const D of [1, 2, 4, 8, 16]) {
    const row = {};
    for (const [name, lock] of [['free', FREE], ['locked', LOCK]]) {
      let kept = 0;
      for (let trial = 0; trial < 20; trial++) {
        const R = rng(500 + trial), d = Math.round((2 * R() - 1) * D);
        kept += routesKept(lock, { d, pilotJ: jitters(900 + trial, ND + 4, 1) });
      }
      row[name] = r(kept / 60);
    }
    out.unknown_delay_plus_pilot_jitter_1[`plus_minus_${D}`] = row;
  }
  return out;
}

/* ---------- XOR yard (R8c) with a pilot on its B track ---------- */
const X8 = require('../results/r8_phase.json').R8c_vector_platform;
const { A_sent: tA, A_captured_at: cA, C_sent: tC } = X8.setup;
const XT = X8.xor_example.threshold, XAMP = X8.xor_example.ampC;
const XPHI = pilotAngle({ weights: [1, 0, 1] }, 1, 0);

function xorTruth(lock, o = {}) {
  const Ps = o.Ps || P, nd = o.nd || ND, d = o.d || 0;
  const at = ticks => (o.scaled ? Math.round(ticks * Ps / P) : ticks);
  const row = (a, c) => {
    const y = new Yard({ aisMode: 'vector', threshold: XT, maxCarriages: 1, weights: [1, 0, 1],
                         angles: [Math.PI / 2, XPHI, 3 * Math.PI / 2], kick: lock.kick, kickWeights: [0, 1, 0], clockLearn: lock.learn || 0 });
    for (let n = 0; n < nd + 4; n++) y.carriage(1, n * Ps + d);
    if (a) y.carriage(0, nd * Ps + at(tA) + d);
    if (c) y.carriage(2, nd * Ps + at(tC) + d + (o.shiftC || 0), XAMP);
    y.run(nd * Ps + at(cA) + 3 * P + Math.max(0, d));
    return y.carriagesOut() > 0 ? 1 : 0;
  };
  return [row(0, 0), row(1, 0), row(0, 1), row(1, 1)].join('');
}

function r9e() {
  const out = { pilot_track_angle_deg: r(XPHI * 180 / Math.PI), threshold: XT, ampC: XAMP,
                baseline_free: xorTruth(FREE), baseline_locked: xorTruth(LOCK), common_delay: {}, C_shift_alone: {} };
  for (const [name, lock] of [['free', FREE], ['locked', LOCK]]) {
    const ok = DELAYS.filter(d => xorTruth(lock, { d }) === '0110');
    out.common_delay[name] = { delays_kept: `${ok.length}/${DELAYS.length}`, delays: ok.length === DELAYS.length ? 'all of -16..15' : ok };
    out.C_shift_alone[name] = range(-6, 6).filter(s => xorTruth(lock, { shiftC: s }) === '0110');
  }
  return out;
}

/* ---------- R9c: a sender with a different period ---------- */
function r9c() {
  const periods = range(24, 42), out = { periods_tested: '24..42 (receiver: 32)', listeners: {}, xor: {} };
  for (const [codes, scaled] of [['codes_in_ticks', false], ['codes_in_phase', true]]) {
    out.listeners[codes] = {}; out.xor[codes] = {};
    for (const [name, lock] of [['free', FREE], ['kick', LOCK], ['kick_plus_clock_learning', LOCK_LEARN]]) {
      out.listeners[codes][name] = periods.filter(Ps => routedOK(lock, { Ps, scaled }));
      out.xor[codes][name] = periods.filter(Ps => xorTruth(lock, { Ps, scaled }) === '0110');
    }
  }
  out.note = "free-running passes away from 32 are coincidences: the phase slipped by a whole number of windows by the time the data came";
  return out;
}

/* ---------- R9d: timing information under an unknown common delay ---------- */
// how far (in ticks) the receiver's clock is from where it would be with no delay, at the moment the data lands
function clockError(lock, d, pilotJ) {
  const runOne = (dd, pj) => {
    const y = new Yard(listenerCfg(0, lock)); y.keepHistory = 1e6;
    for (let n = 0; n < ND + 4; n++) y.carriage(0, n * P + E0 + dd + (pj ? pj[n] : 0));
    y.run((ND + 4) * P + 2 * P);
    return y.history;
  };
  const ref = runOne(0, null), h = runOne(d, pilotJ), t = ND * P + E0 + 16;
  return Math.round(wrap(h[t + d].theta - ref[t].theta) / (TAU / P));
}

function kernelOf(errors) {
  const m = new Map(); for (const e of errors) m.set(e, (m.get(e) || 0) + 1 / errors.length);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function r9d() {
  const rows = R8.r8aRows();
  const hN = R8.mutualInfo(rows.map(x => new Map([[String(x.N), 1]])));
  const extra = kernel => r(R8.countTimingBits(rows, kernel) - hN);
  const out = { note: 'extra bits from timing given the count (R8a: 1.44 with perfect timing); each trial has a delay drawn uniformly from -D..D',
                count_only_bits: r(hN), by_delay_range: {} };
  for (const D of [0, 1, 2, 4, 8]) {
    const ds = range(-D, D);
    const free = ds.map(d => clockError(FREE, d)), locked = ds.map(d => clockError(LOCK, d));
    const lockedJ = [];
    for (let s = 0; s < 10; s++) for (const d of ds) lockedJ.push(clockError(LOCK, d, jitters(2000 + s, ND + 4, 1)));
    out.by_delay_range[`plus_minus_${D}`] = {
      read_on_own_clock: extra(kernelOf(free)),
      read_on_locked_clock: extra(kernelOf(locked)),
      read_on_locked_clock_pilot_jitter_1: extra(kernelOf(lockedJ)),
      locked_clock_error_ticks: kernelOf(locked).map(([e, p]) => [e, r(p)]),
    };
  }
  return out;
}

function main() {
  const out = { R9a_common_delay: r9a(), R9b_jitter: r9b(), R9c_period_mismatch: r9c(), R9d_timing_information: r9d(), R9e_xor_locked: r9e() };
  const dir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'r9_entrain.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

if (require.main === module) main();
module.exports = { r9a, r9b, r9c, r9d, r9e, route, routedOK, xorTruth, clockError, LPHI, XPHI, KICK, LEARN };
