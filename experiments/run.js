/* Turntable Neuron v2 experiments. Run: node experiments/run.js  ->  results/results.json */
const fs = require('fs');
const path = require('path');
const { Yard } = require('../turntable_core.js');

const P = 32;
const r = x => +x.toFixed(6);

function bitsOf(n, width) { return Array.from({ length: width }, (_, k) => (n >> k) & 1); }

function entropy(labels) {
  const m = new Map();
  for (const l of labels) m.set(l, (m.get(l) || 0) + 1);
  let h = 0;
  for (const c of m.values()) { const p = c / labels.length; h -= p * Math.log2(p); }
  return { bits: r(h), distinct: m.size };
}

// R1: everything before the exit is linear in the carriages
function r1Linearity(trials = 40) {
  let worst = 0;
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < trials; t++) {
    const lengths = [4 + Math.floor(rand() * 30), 4 + Math.floor(rand() * 30), 4 + Math.floor(rand() * 30)];
    const pattern = [0, 1, 2].map(() => bitsOf(Math.floor(rand() * 16), 4));
    const full = new Yard({ lengths, threshold: Infinity }); full.keepHistory = 1e6;
    pattern.forEach((b, i) => full.train(i, b, 3));
    full.run(160);
    const sum = new Float64Array(160);
    pattern.forEach((b, i) => b.forEach((bit, k) => {
      if (!bit) return;
      const y = new Yard({ lengths, threshold: Infinity }); y.keepHistory = 1e6;
      y.carriage(i, 3 + k * y.cfg.slot); y.run(160);
      y.history.forEach((h, s) => { sum[s] += h.load; });
    }));
    full.history.forEach((h, s) => { worst = Math.max(worst, Math.abs(h.load - sum[s])); });
  }
  return { trials, max_abs_error_load_vs_sum_of_single_carriages: worst };
}

// R2: the geometry decides which carriages count
function weightMap(lengths, slots = 4, ticks = 3 * P) {
  return [0, 1, 2].map(i => Array.from({ length: slots }, (_, k) => {
    const y = new Yard({ lengths, threshold: Infinity });
    y.carriage(i, k * y.cfg.slot);
    y.run(ticks);
    return r(y.captured);
  }));
}

// R3: preferred lag between two trains is set by track lengths
function bestPhase(lengths, track) {
  let best = 0, val = -1;
  for (let t0 = 0; t0 < P; t0++) {
    const y = new Yard({ lengths: [lengths[0], lengths[1], 12], threshold: Infinity });
    y.carriage(track, t0); y.run(3 * P);
    if (y.captured > val) { val = y.captured; best = t0; }
  }
  return best;
}

function singleMax(lengths) {
  let m = 0;
  for (const tr of [0, 1]) for (let t0 = 0; t0 < P; t0++) {
    const y = new Yard({ lengths: [lengths[0], lengths[1], 12], threshold: Infinity }); y.keepHistory = 1e6;
    y.carriage(tr, t0); y.run(4 * P);
    m = Math.max(m, ...y.history.map(h => h.load));
  }
  return m;
}

/* A is sent at the phase where track A is best captured; B follows at `lag` ticks. The threshold is
   above anything a single carriage can produce, so a departure needs both in the same rotation. */
function lagTuning(lengths, lags) {
  const tA = bestPhase(lengths, 0), threshold = 1.05 * singleMax(lengths);
  const out = lags.map(lag => {
    const y = new Yard({ lengths: [lengths[0], lengths[1], 12], threshold });
    const shift = Math.max(0, -(tA + lag));
    y.carriage(0, tA + shift); y.carriage(1, tA + lag + shift);
    y.run(5 * P);
    return y.carriagesOut();
  });
  const fired = lags.filter((_, k) => out[k] > 0);
  return { a_sent_at: tA, threshold: r(threshold), carriages_out: out, lags_that_fire: fired };
}

// R4 + R5: monotonicity and the information budget of the exit
function ensemble(lengths, threshold, slots = 3, rotations = 4) {
  const n = 3 * slots, rows = [];
  for (let code = 0; code < (1 << n); code++) {
    const y = new Yard({ lengths, threshold }); y.keepHistory = 1e6;
    for (let i = 0; i < 3; i++) y.train(i, bitsOf(code >> (i * slots), slots), 0);
    y.run(rotations * P);
    const seq = Array.from({ length: rotations + 1 }, () => 0);
    for (const d of y.departures) seq[d.rotation] += d.n;
    const loadsAtExit = y.history.filter((h, s, a) => s > 0 && Math.floor(h.theta / (2 * Math.PI)) > Math.floor(a[s - 1].theta / (2 * Math.PI)))
      .map(h => (h.load + h.departed * threshold).toFixed(9));
    rows.push({ code, total: y.carriagesOut(), seq: seq.join(','), any: y.carriagesOut() > 0 ? 1 : 0, loads: loadsAtExit.join('|') });
  }
  let violations = 0, pairs = 0;
  for (const a of rows) for (let k = 0; k < n; k++) {
    if (a.code & (1 << k)) continue;
    const b = rows[a.code | (1 << k)];
    pairs++;
    if (b.total < a.total) violations++;
  }
  return {
    lengths, threshold, patterns: rows.length, max_bits: n,
    monotonicity: { pairs_checked: pairs, adding_a_carriage_reduced_output: violations },
    entropy_bits: {
      any_departure: entropy(rows.map(x => x.any)),
      total_carriages_out: entropy(rows.map(x => x.total)),
      departures_per_rotation: entropy(rows.map(x => x.seq)),
      platform_load_before_each_exit: entropy(rows.map(x => x.loads)),
    },
  };
}

// R6: growth aligns tracks to a timing pattern; the neuron becomes selective for it
function respond(lengths, offsets, rotations = 6, threshold = 2.2) {
  const y = new Yard({ lengths, threshold });
  for (let rot = 0; rot < rotations; rot++) offsets.forEach((o, i) => y.carriage(i, rot * P + o));
  y.run(rotations * P + P);
  return y.carriagesOut() / rotations;
}

function r6Growth(start, target, rotations = 120, growth = 0.6) {
  const y = new Yard({ lengths: start, growth, threshold: Infinity });
  const trace = [];
  let lastD = 0, lastC = 0;
  for (let rot = 0; rot < rotations; rot++) {
    target.forEach((o, i) => y.carriage(i, o));
    y.run(P);
    trace.push({ rotation: rot + 1, lengths: y.len.map(r), capture: r((y.captured - lastC) / Math.max(1e-9, y.delivered - lastD)) });
    lastD = y.delivered; lastC = y.captured;
  }
  const learned = y.len.map(v => Math.round(v));
  let seed = 3;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const others = Array.from({ length: 40 }, () => [0, 1, 2].map(() => Math.floor(rand() * P)));
  const test = ls => ({ target: r(respond(ls, target)), others: others.map(o => r(respond(ls, o))) });
  const before = test(start.map(Math.round)), after = test(learned);
  const summary = t => ({ target: t.target, others_mean: r(t.others.reduce((a, b) => a + b, 0) / t.others.length),
                          others_max: Math.max(...t.others), others_reaching_target: t.others.filter(v => v >= t.target).length });
  return { start, target_offsets: target, growth, rotations,
           capture_first: trace[0].capture, capture_last: trace[trace.length - 1].capture,
           learned_lengths: learned, trace_every_10: trace.filter(x => x.rotation % 10 === 0),
           before: summary(before), after: summary(after) };
}

// R7: a busy track can pull the turntable into step (entrainment)
function r7Entrain(kicks, inputPeriod = 36, rotations = 60) {
  return kicks.map(kick => {
    const y = new Yard({ kick, threshold: Infinity });
    for (let k = 0; k < Math.ceil(rotations * P / inputPeriod) + 2; k++) y.carriage(0, k * inputPeriod);
    y.keepHistory = 1e6;
    y.run(rotations * P);
    const h = y.history, a = h[Math.floor(h.length / 2)], b = h[h.length - 1];
    const meanPeriod = (b.t - a.t) * 2 * Math.PI / (b.theta - a.theta);
    return { kick, input_period: inputPeriod, natural_period: P, turntable_period_second_half: r(meanPeriod) };
  });
}

function main() {
  const out = {};
  out.R1_linearity = r1Linearity();
  out.R2_weight_maps = { equal_12_12_12: weightMap([12, 12, 12]), graded_6_14_22: weightMap([6, 14, 22]), graded_10_14_18: weightMap([10, 14, 18]) };
  const lags = Array.from({ length: 49 }, (_, k) => k - 24);
  out.R3_lag_tuning = {};
  for (const L of [[12, 12], [12, 20], [20, 12]]) out.R3_lag_tuning[L.join('_')] = { lags, ...lagTuning(L, lags) };
  out.R4_R5_ensemble = ensemble([10, 14, 18], 0.8);
  out.R6_growth = r6Growth([5, 25, 15], [2, 6, 10]);
  out.R7_entrainment = {};
  for (const ip of [28, 36, 48]) out.R7_entrainment['input_period_' + ip] = r7Entrain([0, 0.2, 0.3, 0.4, 0.8], ip, 200)
    .map(x => ({ kick: x.kick, turntable_period: x.turntable_period_second_half }));
  const dir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, (k, v) => (k === 'lags' || k === 'carriages_out' || k === 'trace_every_10' ? undefined : v)));
}

if (require.main === module) main();
module.exports = { weightMap, lagTuning, singleMax, ensemble, respond, r6Growth, r1Linearity, r7Entrain };
