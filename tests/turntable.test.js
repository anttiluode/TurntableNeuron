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
