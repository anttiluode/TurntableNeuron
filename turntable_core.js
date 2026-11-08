/* Turntable Neuron v2 core. One file drives the browser lab (index.html), the experiments and the tests.

   The yard: R tracks (dendrites) end at a central turntable. The turntable rotates. It faces each track
   in turn, and it faces the exit (axon) once per rotation.

   Track    upwind advection-diffusion: a train moves toward the turntable at `speed` compartments
            per tick, spreads (`blur`) and fades (`fade`). This is a moving cable, NOT Rall's passive
            cable (which has no drift). Carriages are current pulses injected at the distal end.
            I_i = speed * u_i[0] is the flux leaving the proximal end of track i.
   Gate     g_i(theta) = exp(kappa (cos(theta - phi_i) - 1)): the share of I_i that rolls onto the
            platform. The rest is lost.
   Soma     load <- load (1 - somaLeak) + sum_i w_i g_i I_i. Carriages wait on the platform.
   Exit     when theta passes exitAngle (the AIS "allow" signal): if load >= threshold, n = min(maxCarriages,
            floor(load / threshold)) carriages leave and load -= n * threshold (subtractive reset).
   Turntable  theta <- theta + 2 pi / period + kick * sum_i I_i sin(phi_i - theta). With kick > 0 a busy
            track pulls the turntable toward itself.
   Growth   per track, over each rotation: e_i = sum I_i sin(theta - phi_i) / sum I_i (> 0: arrived after
            the turntable passed, so too late). length_i -= growth * e_i. Compartments = round(length_i).
*/
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.Turntable = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TAU = 2 * Math.PI;

  function defaults() {
    return {
      period: 32, kappa: 8,
      angles: [TAU / 4, TAU / 2, 3 * TAU / 4], exitAngle: 0,   // A top, B left, C bottom, exit right
      lengths: [12, 12, 12], weights: [1, 1, 1],
      speed: 0.8, blur: 0.08, fade: 0.01,
      carriageAmp: 1, carriageTicks: 3, slot: 6,
      somaLeak: 0.01, threshold: 1.0, maxCarriages: 4,
      kick: 0, growth: 0, theta0: 0, minLength: 2, maxLength: 48,
    };
  }

  class Yard {
    constructor(conf = {}) { this.cfg = { ...defaults(), ...conf }; this.reset(); }

    reset() {
      const c = this.cfg;
      this.t = 0; this.theta = c.theta0; this.load = 0; this.rotation = 0;
      this.len = c.lengths.map(Number);
      this.cables = this.len.map(n => new Float64Array(Math.round(n)));
      this.stimuli = []; this.departures = [];
      this.I = this.cables.map(() => 0); this.gate = this.cables.map(() => 0);
      this.S = this.cables.map(() => 0); this.M = this.cables.map(() => 0);
      this.delivered = 0; this.captured = 0;
      this.history = [];
      this.keepHistory = 0;
    }

    /* A train: bits[k] = 1 puts a carriage in slot k; slots are cfg.slot ticks apart. */
    train(track, bits, t0 = 0, amp = this.cfg.carriageAmp) {
      bits.forEach((b, k) => {
        if (b) this.stimuli.push({ track, t0: this.t + t0 + k * this.cfg.slot, until: this.t + t0 + k * this.cfg.slot + this.cfg.carriageTicks, amp });
      });
    }

    carriage(track, t0 = 0, amp = this.cfg.carriageAmp) {
      this.stimuli.push({ track, t0: this.t + t0, until: this.t + t0 + this.cfg.carriageTicks, amp });
    }

    resize(i, n) {
      const old = this.cables[i], next = new Float64Array(n);
      for (let j = 0; j < Math.min(n, old.length); j++) next[j] = old[j];
      this.cables[i] = next;
    }

    tick() {
      const c = this.cfg, R = this.cables.length;
      const src = new Array(R).fill(0);
      for (const s of this.stimuli) if (this.t >= s.t0 && this.t < s.until) src[s.track] += s.amp;

      // tracks
      for (let i = 0; i < R; i++) {
        const u = this.cables[i], N = u.length, nx = new Float64Array(N);
        for (let j = 0; j < N; j++) {
          const up = j + 1 < N ? u[j + 1] : 0;                       // nothing beyond the distal end
          const left = j > 0 ? u[j - 1] : u[j], right = j + 1 < N ? u[j + 1] : u[j];
          nx[j] = u[j] + c.speed * (up - u[j]) + c.blur * (left + right - 2 * u[j]) - c.fade * u[j];
        }
        nx[N - 1] += src[i];
        this.I[i] = c.speed * u[0];                                  // flux off the proximal end this tick
        this.cables[i] = nx;
      }

      // turntable gate, platform, turntable motion
      let inflow = 0, pull = 0;
      for (let i = 0; i < R; i++) {
        const g = Math.exp(c.kappa * (Math.cos(this.theta - c.angles[i]) - 1));
        this.gate[i] = g;
        inflow += c.weights[i] * g * this.I[i];
        pull += this.I[i] * Math.sin(c.angles[i] - this.theta);
        this.S[i] += this.I[i] * Math.sin(this.theta - c.angles[i]);
        this.M[i] += this.I[i];
        this.delivered += this.I[i]; this.captured += g * this.I[i];
      }
      this.load = this.load * (1 - c.somaLeak) + inflow;
      const before = this.theta;
      this.theta += TAU / c.period + c.kick * pull;

      // exit: the AIS allow signal comes once per rotation, when the turntable passes the exit
      let departed = 0;
      if (Math.floor((this.theta - c.exitAngle) / TAU) > Math.floor((before - c.exitAngle) / TAU)) {
        this.rotation++;
        if (this.load >= c.threshold) {
          departed = Math.min(c.maxCarriages, Math.floor(this.load / c.threshold));
          this.load -= departed * c.threshold;
          this.departures.push({ t: this.t, n: departed, rotation: this.rotation });
        }
        if (c.growth) this.grow();
      }
      if (this.keepHistory) {
        this.history.push({ t: this.t, load: this.load, theta: this.theta, departed, I: [...this.I], gate: [...this.gate] });
        if (this.history.length > this.keepHistory) this.history.shift();
      }
      this.t++;
      return departed;
    }

    grow() {
      const c = this.cfg;
      for (let i = 0; i < this.cables.length; i++) {
        if (this.M[i] > 1e-3) {
          const e = this.S[i] / this.M[i];                           // > 0: arrived after facing (late)
          this.len[i] = Math.min(c.maxLength, Math.max(c.minLength, this.len[i] - c.growth * e));
          const n = Math.round(this.len[i]);
          if (n !== this.cables[i].length) this.resize(i, n);
        }
        this.S[i] = 0; this.M[i] = 0;
      }
    }

    run(n) { for (let k = 0; k < n; k++) this.tick(); return this; }

    carriagesOut() { return this.departures.reduce((s, d) => s + d.n, 0); }
  }

  return { Yard, defaults, TAU };
});
