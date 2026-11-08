/* node --test tests/turntable.test.js */
const test = require('node:test');
const assert = require('node:assert');
const { Yard } = require('../turntable_core.js');
const E = require('../experiments/run.js');

test('deterministic', () => {
  const run = () => { const y = new Yard({ threshold: 0.8 }); y.train(0, [1, 0, 1], 3); y.train(1, [1, 1, 0], 0); y.run(200); return JSON.stringify(y.departures); };
  assert.strictEqual(run(), run());
});

test('everything before the exit is linear in the carriages', () => {
  assert.ok(E.r1Linearity(8).max_abs_error_load_vs_sum_of_single_carriages < 1e-12);
});

test('track length changes which carriages count', () => {
  const a = E.weightMap([12, 12, 12]), b = E.weightMap([6, 14, 22]);
  assert.ok(a[0][0] < 0.1 && b[0][0] > 1.5);           // A's first carriage: lost vs captured
});

test('two-train order detector: preferred lag moves with length difference', () => {
  const lags = Array.from({ length: 49 }, (_, k) => k - 24);
  const eq = E.lagTuning([12, 12], lags).lags_that_fire;
  const longB = E.lagTuning([12, 20], lags).lags_that_fire;
  assert.ok(eq.includes(6) && !eq.includes(-6));         // B after A fires, B before A does not
  assert.ok(longB.includes(-4) && !longB.includes(8));   // a longer B track wants B sent earlier
});

test('the output is monotone: adding a carriage never removes departures (so no XOR)', () => {
  const res = E.ensemble([10, 14, 18], 0.8, 2, 3);
  assert.strictEqual(res.monotonicity.adding_a_carriage_reduced_output, 0);
  assert.ok(res.entropy_bits.platform_load_before_each_exit.bits > res.entropy_bits.total_carriages_out.bits);
});

test('the exit is the only place information is lost before it', () => {
  const res = E.ensemble([10, 14, 18], 0.8, 3, 4);
  assert.strictEqual(res.entropy_bits.platform_load_before_each_exit.distinct, 512);
  assert.ok(res.entropy_bits.total_carriages_out.distinct <= 5);
});

test('a busy track can entrain the turntable', () => {
  const [free, locked] = E.r7Entrain([0, 0.4], 36, 200);
  assert.ok(Math.abs(free.turntable_period_second_half - 32) < 1e-9);
  assert.ok(Math.abs(locked.turntable_period_second_half - 36) < 0.05);
});

test('growth raises capture and the response to the trained timing', () => {
  const g = E.r6Growth([5, 25, 15], [2, 6, 10], 60);
  assert.ok(g.capture_last > g.capture_first);
  assert.ok(g.after.target > g.before.target);
});

/* ---- v3 / R8: phase-biased axon ---- */
const R8 = require('../experiments/r8_phase.js');

test('v3 defaults leave v2 behaviour untouched (no phase release, load AIS)', () => {
  const y = new Yard({ threshold: 0.8 }); y.train(0, [1, 1, 0], 0); y.run(200);
  assert.ok(y.departures.every(d => d.tau === 0 && d.release === d.t));
});

test('outgoing timing carries information beyond the count', () => {
  const a = R8.r8a();
  assert.ok(a.by_jitter.sigma_0.extra_bits_from_timing_given_count > 1.0);
  assert.ok(a.by_jitter.sigma_4.extra_bits_from_timing_given_count < a.by_jitter.sigma_1.extra_bits_from_timing_given_count);
});

test('phase release routes each input to its own listener; bias re-addresses', () => {
  const b = R8.r8b();
  assert.deepStrictEqual(b.with_phase_release, ['100', '010', '001']);
  assert.deepStrictEqual(b.without_phase_release, ['000', '000', '000']);
  assert.strictEqual(b.bias_sweep[8], '010 001 000');
});

test('a vector platform computes XOR; the load platform cannot', () => {
  const c = R8.r8c();
  assert.ok(c.functions_reachable.vector.includes('0110'));
  assert.ok(!c.functions_reachable.load.includes('0110'));
  assert.ok(c.vector_mode_monotonicity.adding_a_carriage_reduced_output > 0);
});

/* ---- v4 / R9: listeners locked to the sender's pilot ---- */
const R9 = require('../experiments/r9_entrain.js');

test('v4 defaults leave v2/v3 untouched (kickWeights null = all ones, clockLearn 0)', () => {
  const run = conf => { const y = new Yard({ kick: 0.4, threshold: 0.8, ...conf }); y.keepHistory = 1e6;
    y.train(0, [1, 1, 0], 0); y.train(2, [0, 1, 1], 5); y.run(300); return JSON.stringify(y.history.map(h => h.theta)); };
  assert.strictEqual(run({}), run({ kickWeights: [1, 1, 1] }));
  const pilot = new Yard({ weights: [0, 1, 1], kickWeights: [1, 0, 0], kick: 0.4, threshold: 0.1 });
  pilot.carriage(0, 0); pilot.run(200);
  assert.strictEqual(pilot.load, 0);                           // a pilot steers but never loads
});

test('locked listeners route through any common delay; free ones only within a tick or two', () => {
  const free = { kick: 0 }, lock = { kick: R9.KICK };
  for (const d of [-12, -6, -3, 3, 6, 12]) {
    assert.ok(R9.routedOK(lock, { d }), `locked, delay ${d}`);
    assert.ok(!R9.routedOK(free, { d }), `free, delay ${d}`);
  }
  assert.ok(R9.routedOK(free, { d: 0 }) && R9.routedOK(lock, { d: 0 }));
});

test('locking does not rescue jitter on the data itself', () => {
  const lock = { kick: R9.KICK };
  assert.ok(!R9.routedOK(lock, { dataJ: -3 }) || !R9.routedOK(lock, { dataJ: 3 }));
  assert.ok(!R9.routedOK(lock, { dataJ: 4 }) && !R9.routedOK(lock, { dataJ: -4 }));
});

test('clock learning tracks a sender of another period; the locked XOR survives common delay', () => {
  const lock = { kick: R9.KICK }, learn = { kick: R9.KICK, learn: R9.LEARN };
  assert.ok(!R9.routedOK(lock, { Ps: 30, scaled: true }) && R9.routedOK(learn, { Ps: 30, scaled: true }));
  assert.ok(R9.routedOK(learn, { Ps: 40, scaled: true }) && !R9.routedOK(lock, { Ps: 40, scaled: true }));
  for (const d of [-10, -4, 4, 10]) {
    assert.strictEqual(R9.xorTruth(lock, { d }), '0110');
    assert.notStrictEqual(R9.xorTruth({ kick: 0 }, { d }), '0110');
  }
  assert.notStrictEqual(R9.xorTruth(lock, { shiftC: 3 }), '0110'); // C's own timing is still tight
});

/* ---- v5 / R10: time windows and path sums ---- */
const R10 = require('../experiments/r10_windows.js');

test('the vector platform is exactly a one-frequency path sum; a second clock breaks the alias', () => {
  const c = R10.r10c();
  assert.ok(c.identity.max_abs_error_measured_vs_path_sum < 1e-9);
  assert.ok(c.two_routes_abs_z_over_single.delta_16 < 1e-9 && Math.abs(c.two_routes_abs_z_over_single.delta_32 - 2) < 1e-9);
  assert.ok(c.aliasing.clock_32_difference < 1e-9 && c.aliasing.clock_37_relative_difference > 0.5);
  assert.ok(c.stationary_phase.remove_9_central_routes < 0.5 && c.stationary_phase.remove_9_edge_routes > 0.8);
});

test('a window as wide as the address spacing buys the full spacing in jitter', () => {
  const v3 = R10.shiftSpan(R10.addressBook(8, 0.6, 4)), wide = R10.shiftSpan(R10.addressBook(4, 0.4, 4));
  assert.strictEqual(v3.span, 4);
  assert.deepStrictEqual(wide, { span: 8, from: -3, to: 4 });   // 4 addresses, 8 ticks apart
  assert.strictEqual(R10.windowTicks(4, 0.4), 8);                // 90 degrees
});

test('a locked listener listening away from the pilot keeps a time-yoked window; clock learning stretches it', () => {
  const w = (Ps, learn) => R10.lockedWindow(Ps, learn, 2).fwhm_ticks;
  const kick = w(35, 0) / w(29, 0), learn = w(35, 0.01) / w(29, 0.01);
  assert.ok(Math.abs(kick - 1) < 0.03, `kick-only ratio ${kick}`);
  assert.ok(learn > 1.1, `clock-learning ratio ${learn}`);
});
