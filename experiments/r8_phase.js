/* R8: phase-biased axonal transmission. Run: node experiments/r8_phase.js -> results/r8_phase.json

   R8a  Does outgoing timing carry input information beyond the count?  I(pattern; tau | count), with jitter.
   R8b  Can the same yard address different listeners by timing? Real downstream Yards with turntable offsets.
   R8c  Does a vector platform (threshold on |z|) break monotonicity and compute XOR? How robust is it?
*/
const fs = require('fs');
const path = require('path');
const { Yard } = require('../turntable_core.js');

const P = 32, TAU = 2 * Math.PI;
const r = x => +x.toFixed(4);
const bitsOf = (n, w) => Array.from({ length: w }, (_, k) => (n >> k) & 1);

function gaussWeights(sigma) {
  if (sigma === 0) return [[0, 1]];
  const K = Math.ceil(4 * sigma), w = [];
  let s = 0;
  for (let k = -K; k <= K; k++) { const v = Math.exp(-k * k / (2 * sigma * sigma)); w.push([k, v]); s += v; }
  return w.map(([k, v]) => [k, v / s]);
}

// mutual information I(X; Y) for uniform X and channel p(y|x) given as Map per x
function mutualInfo(channels) {
  const py = new Map(), nx = channels.length;
  for (const ch of channels) for (const [y, p] of ch) py.set(y, (py.get(y) || 0) + p / nx);
  let hy = 0; for (const p of py.values()) if (p > 0) hy -= p * Math.log2(p);
  let hyx = 0;
  for (const ch of channels) for (const p of ch.values()) if (p > 0) hyx -= (p * Math.log2(p)) / nx;
  return hy - hyx;
}

function r8aRows(lengths = [10, 14, 18], threshold = 0.8, slots = 3, rotations = 4, phaseOut = P) {
  const rows = [];
  for (let code = 0; code < (1 << (3 * slots)); code++) {
    const y = new Yard({ lengths, threshold, phaseOut });
    for (let i = 0; i < 3; i++) y.train(i, bitsOf(code >> (i * slots), slots), 0);
    y.run(rotations * P);
    const N = y.carriagesOut();
    const tau = y.departures.length ? y.departures[0].tau : null;     // timing of the first departure
    rows.push({ N, tau });
  }
  return rows;
}

// bits in (count, timing) when the timing is read through a noise kernel [[shift, probability], ...]
function countTimingBits(rows, kernel) {
  return mutualInfo(rows.map(x => {
    const m = new Map();
    if (x.tau === null) m.set(`${x.N}|-`, 1);
    else for (const [k, p] of kernel) { const key = `${x.N}|${x.tau + k}`; m.set(key, (m.get(key) || 0) + p); }
    return m;
  }));
}

function r8a(lengths = [10, 14, 18], threshold = 0.8, slots = 3, rotations = 4, phaseOut = P) {
  const rows = r8aRows(lengths, threshold, slots, rotations, phaseOut);
  const hN = mutualInfo(rows.map(x => new Map([[String(x.N), 1]])));
  const out = { patterns: rows.length, count_only_bits: r(hN), timing_resolution_ticks: 1, phaseOut_ticks: phaseOut, by_jitter: {} };
  for (const sigma of [0, 0.5, 1, 2, 4]) {
    const w = gaussWeights(sigma);
    const ch = rows.map(x => {
      const m = new Map();
      if (x.tau === null) m.set(`${x.N}|-`, 1);
      else for (const [k, p] of w) { const key = `${x.N}|${x.tau + k}`; m.set(key, (m.get(key) || 0) + p); }
      return m;
    });
    const both = mutualInfo(ch);
    out.by_jitter[`sigma_${sigma}`] = { count_and_timing_bits: r(both), extra_bits_from_timing_given_count: r(both - hN) };
  }
  // control: the same departures with no phase release (all leave at the exit moment)
  out.control_no_phase_release_extra_bits = 0;
  out.distinct_count_timing_pairs = new Set(rows.map(x => `${x.N}|${x.tau}`)).size;
  return out;
}

/* ---------- R8b: listeners ---------- */
function senderTau(track) {
  // one carriage on one track, sent where that track is best captured; returns the phase delay tau
  let best = 0, val = -1;
  for (let t0 = 0; t0 < P; t0++) {
    const y = new Yard({ threshold: Infinity }); y.carriage(track, t0); y.run(3 * P);
    if (y.captured > val) { val = y.captured; best = t0; }
  }
  const y = new Yard({ threshold: 0.5, phaseOut: P });
  y.carriage(track, best); y.run(4 * P);
  const d = y.departures[0];
  return { tau: d.tau, phase_deg: r(d.phase * 180 / Math.PI) };
}

function listenerLoad(arrival, psi) {
  // a downstream yard: the axon branch lands on its track B; its turntable starts at phase psi
  const y = new Yard({ theta0: psi, threshold: Infinity, lengths: [12, 4, 12] }); y.keepHistory = 1e6;
  y.carriage(1, arrival); y.run(arrival + 3 * P);
  return Math.max(...y.history.map(h => h.load));
}

function listenerFires(arrival, psi, threshold) {
  const y = new Yard({ theta0: psi, threshold, lengths: [12, 4, 12] });
  y.carriage(1, arrival); y.run(arrival + 3 * P);
  return y.carriagesOut() > 0 ? 1 : 0;
}

const E0 = 31;                                   // every departure leaves at the same exit moment; only tau differs

function r8b() {
  const senders = [0, 1, 2].map(senderTau);
  // the listener with psi = 0: which arrival time suits it best?
  let aBest = 0, m = -1;
  for (let a = 0; a < P; a++) { const v = listenerLoad(64 + a, 0); if (v > m) { m = v; aBest = a; } }
  const thr = 0.6 * m;
  // tune listener k to input k's arrival phase at bias 0
  const psis = senders.map(s => (((aBest - (E0 + s.tau)) % P + P) % P) * TAU / P);
  const route = (bias, taus) => taus.map(tau => psis.map(psi => listenerFires(64 + E0 + tau + bias, psi, thr)).join(''));
  const taus = senders.map(s => s.tau);
  const out = {
    sender: senders.map((s, i) => ({ input: 'ABC'[i], ...s })),
    listener_phase_offsets_deg: psis.map(p => r(p * 180 / Math.PI)),
    listener_threshold: r(thr),
    note: "rows = inputs A, B, C; each string = which of listeners 1, 2, 3 fire",
    with_phase_release: route(0, taus),
    without_phase_release: route(0, [0, 0, 0]),
    bias_sweep: {},
    jitter: {},
  };
  for (let b = 0; b < P; b += 2) out.bias_sweep[b] = route(b, taus).join(' ');
  const base = route(0, taus);
  for (const j of [1, 2, 3, 4, 6]) {
    let same = 0;
    for (const sgn of [-1, 1]) route(sgn * j, taus).forEach((x, i) => { same += x === base[i] ? 1 : 0; });
    out.jitter[`plus_minus_${j}_ticks`] = `${same}/6`;
  }
  return out;
}

/* ---------- R8c: vector platform, monotonicity, XOR ---------- */
function captureTick(track, t0) {
  const y = new Yard({ threshold: Infinity }); y.keepHistory = 1e6;
  y.carriage(track, t0); y.run(4 * P);
  let best = 0, v = -1;
  y.history.forEach(h => { const c = h.gate[track] * h.I[track]; if (c > v) { v = c; best = h.t; } });
  return best;
}

function bestT0(track) {
  let best = 0, val = -1;
  for (let t0 = 0; t0 < P; t0++) {
    const y = new Yard({ threshold: Infinity }); y.carriage(track, t0); y.run(3 * P);
    if (y.captured > val) { val = y.captured; best = t0; }
  }
  return best;
}

// A (track at 90 deg) and C (track at 270 deg) land on the platform in the SAME rotation, C after A
const tA = bestT0(0);
const cA = captureTick(0, tA);
let tC = bestT0(2);
while (captureTick(2, tC) < cA) tC += P;

function truth(aisMode, threshold, ampC = 1, shiftC = 0) {
  const row = (a, c) => {
    const y = new Yard({ aisMode, threshold, maxCarriages: 1 });
    if (a) y.carriage(0, tA);
    if (c) y.carriage(2, tC + shiftC, ampC);
    y.run(cA + 2 * P);
    return y.carriagesOut() > 0 ? 1 : 0;
  };
  return [row(0, 0), row(1, 0), row(0, 1), row(1, 1)].join('');
}

function r8c() {
  const out = { setup: { A_sent: tA, A_captured_at: cA, C_sent: tC, C_captured_at: captureTick(2, tC) } };
  const thrs = Array.from({ length: 60 }, (_, k) => 0.05 + k * 0.05);
  const amps = Array.from({ length: 23 }, (_, k) => 0.5 + k * 0.05);
  const reach = { load: new Set(), vector: new Set() };
  for (const mode of ['load', 'vector']) for (const t of thrs) for (const a of amps) reach[mode].add(truth(mode, t, a));
  out.functions_reachable = { order: 'output for inputs AC = 00,10,01,11 (scanning threshold and C amplitude)',
                              load: [...reach.load].sort(), vector: [...reach.vector].sort() };
  // the XOR region in (threshold, C amplitude)
  const region = [];
  for (const t of thrs) for (const a of amps) if (truth('vector', t, a) === '0110') region.push([r(t), r(a)]);
  out.xor_region_threshold_ampC = region;
  if (region.length) {
    const [T, A] = region[Math.floor(region.length / 2)];
    const shiftOK = [];
    for (let s = -8; s <= 8; s++) if (truth('vector', T, A, s) === '0110') shiftOK.push(s);
    out.xor_example = { threshold: T, ampC: A, survives_C_timing_shift_ticks: shiftOK };
  }
  const slots = 3, rows = [];
  for (let code = 0; code < 512; code++) {
    const y = new Yard({ lengths: [10, 14, 18], threshold: 0.8, aisMode: 'vector' });
    for (let i = 0; i < 3; i++) y.train(i, bitsOf(code >> (i * slots), slots), 0);
    y.run(4 * P);
    rows.push(y.carriagesOut());
  }
  let viol = 0, pairs = 0;
  for (let code = 0; code < 512; code++) for (let k = 0; k < 9; k++) {
    if (code & (1 << k)) continue;
    pairs++; if (rows[code | (1 << k)] < rows[code]) viol++;
  }
  out.vector_mode_monotonicity = { pairs_checked: pairs, adding_a_carriage_reduced_output: viol };
  return out;
}

function main() {
  const out = { R8a_timing_information: r8a(), R8b_listeners: r8b(), R8c_vector_platform: r8c() };
  const dir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'r8_phase.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}

if (require.main === module) main();
module.exports = { r8a, r8b, r8c, truth, r8aRows, countTimingBits, mutualInfo, gaussWeights, senderTau, E0 };
