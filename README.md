# Turntable Neuron

**Live lab: [anttiluode.github.io/TurntableNeuron](https://anttiluode.github.io/TurntableNeuron/)** · [Sol's v1 lab](sol_v1.html)

*Antti's picture, 8 November 2026:* an old railway yard. Tracks come in and end at a turning platform. In computational space the platform can turn to face different directions; the directions are the dendrites, and the platform is where the axon leaves. The tracks can grow to different lengths and change the trains on them. The soma can take carriages from trains on different tracks. The axon initial segment waits for some kind of "let the trains through" signal.

v2 builds that picture literally, then measures what such a neuron can and cannot compute. *Built by Claude (Opus 5.5); v1 by Sol (ChatGPT) is kept as [`sol_v1.html`](sol_v1.html) and [`SOL_V1_NOTE.md`](SOL_V1_NOTE.md).*

## The yard

```
            A  ═══════════╗
                          ║        (the turntable rotates; it faces A, B, C, then the exit)
            B  ═════════  ◉  ═════════  EXIT (axon)  → carriages leave
                          ║
            C  ═══════════╝
```

| Part | Rule (all in [`turntable_core.js`](turntable_core.js)) |
|---|---|
| **Train** | a pattern of carriages; each carriage is a 3-tick current pulse, slots 6 ticks apart |
| **Track** (dendrite) | the train moves toward the turntable at 0.8 compartments per tick, spreading and fading as it goes. A longer track means a later arrival and a more smeared train. This is a *moving* cable (advection–diffusion), not Rall's passive cable. |
| **Turntable** | rotates once per 32 ticks. A track's arrivals roll onto the platform only while the turntable faces that track: g = exp(κ(cos(θ − φ) − 1)). Everything else is lost. |
| **Platform** (soma) | collects what rolls on, so carriages from different trains end up on one platform. Load leaks slowly (1% per tick). |
| **Exit** (AIS) | the "allow" signal comes once per rotation, when the turntable faces the exit. If load ≥ threshold, ⌊load/threshold⌋ carriages leave (at most 4) and that much is subtracted. Otherwise the carriages wait for the next rotation. |
| **Kick** (optional) | a busy track pulls the turntable toward itself |
| **Growth** (optional) | each track lengthens if its trains arrive before the turntable faces it, and shortens if they arrive after |

One file drives the browser lab, the experiments and the tests.

## What it computes: measured

All numbers come from `node experiments/run.js`; see [`results/results.json`](results/results.json).

**1. Everything before the exit is one linear map.** The platform load equals the sum of the loads each carriage would produce alone, to within **3e-15** (40 random yards and patterns). However the tracks, turntable and platform are arranged, until the exit they only weight and add carriages.

**2. Geometry decides which carriages count.** The table below shows what one carriage in each slot is worth on the platform, with all trains sent at the same moment:

| Track lengths | A: slots 1–4 | B: slots 1–4 | C: slots 1–4 |
|---|---|---|---|
| 12 / 12 / 12 | 0.03, 0, 0.01, 0.23 | **1.45**, 0.24, 0, 0 | 0.10, **0.98**, **0.86**, 0 |
| 6 / 14 / 22 | **2.01**, 0.06, 0, 0 | **1.30**, 0.03, 0, 0.02 | 0.76, 0.01, 0.01, 0.08 |

Same trains, different lengths, different carriages counted. A carriage that arrives while the turntable faces elsewhere is lost. The track has "changed the train".

**3. Relationships between trains: an order detector.** One carriage on A and one on B, B sent `lag` ticks after A, with the threshold set above anything one carriage can produce:

| Lengths A / B | Fires for lag (ticks) |
|---|---|
| 12 / 12 | **+3 … +12** (B after A); not for B before A |
| 12 / 20 | −7 … +3 |
| 20 / 12 | +15 … +21 |

Each compartment of length difference moves the preferred lag by about 1.2 ticks, the train's travel time. Every window also has an alias one rotation (32 ticks) away, because the turntable comes back. This is the Jeffress delay-line coincidence idea (1948), with the turntable doing the sampling.

**4. What it can never compute.** Adding a carriage never reduces the output: **0 violations in 2,304** checked pairs. Gates and track currents are never negative, so the neuron computes only *monotone* threshold functions of its carriages. AND-like relations ("A then B") are possible; **XOR is not**, exactly as for a perceptron. Getting XOR would need inhibition or a second yard.

**5. The exit is the bottleneck.** I tested 512 input patterns (3 tracks × 3 carriage slots) over 4 rotations:

| What you read | Distinct outputs | Bits |
|---|---|---|
| platform load before each exit | 512 | **9.0** (every pattern distinguishable) |
| carriages out (total, or per rotation) | 4 | **1.9** |
| "did anything leave" | 2 | 0.8 |

The platform holds everything; only a count gets out. What survives is a quantized weighted sum.

**6. Growth learns a timing.** All three tracks receive one carriage every rotation, at 2, 6 and 10 ticks after the exit. Growth started from lengths 5 / 25 / 15:

| | Before growth | After 120 rotations |
|---|---|---|
| share of arriving train captured | 50% | 59% |
| lengths | 5 / 25 / 15 | 4 / 34 / 11 |
| carriages out per rotation, trained timing | 0.67 | **1.50** |
| ...for 40 random timings (mean) | 0.19 | 0.36 |
| random timings matching the trained one | 4 / 40 | 1 / 40 |

Track B grew to 34, which delays its train by a whole extra rotation. Lengths only matter modulo one rotation, so growth found the nearest working alignment, not the shortest.

**7. A busy track can entrain the turntable.** Its natural period is 32 ticks. With carriages arriving on A every 36 ticks, kick 0.4 locks it at **36.007**; kick 0.3 slips (34.5). A 28-tick input almost locks (29.0), and a 48-tick input is out of range. This is classic Adler phase locking.

## The picture in one paragraph

Tracks turn *when* into *whether*: a carriage counts only if it arrives while the turntable is looking. The turntable turns the yard into a sampler that listens to each dendrite in turn. The platform adds up what it heard, and the exit turns that sum into a count. So a turntable neuron is a **clocked, monotone, threshold-counting unit whose weights are set by geometry and timing**, and whose geometry can grow to match the timing of its world.

## Honest limits and prior art

- **A designed toy.** Every mechanism was chosen, not discovered. The units are ticks and arbitrary currents. It is not a biophysical neuron.
- **The rotating turntable is a hypothesis.** Real neurons don't have a rotating input selector. The closest real things are rhythmic gating of inputs, such as theta-phase sampling and phase coding (O'Keefe and Recce 1993), and "communication through coherence" (Fries 2005).
- **Delays as weights** are the Jeffress model (1948). Learning delays has prior art: Hüning et al. 1998; Eurich et al., *PRL* 1999. The exit with subtractive reset is an integrate-and-fire counter; the monotone/XOR limit is the perceptron result (Minsky and Papert 1969). The entrainment is Adler (1946).
- **Growth reads the shared turntable clock.** That is local in space, but every track uses the same global rhythm.
- **Carriage content:** Sol's open question, whether a *relationship* can pass the standardized exit, gets a partial answer here. A conjunction and an order can (as a count); XOR cannot; and only about 2 bits per 512-pattern ensemble pass the exit.

## v3: trains with phase in the axon (added later on 8 November)

*Antti asked: what if the trains, once in the axon, have a phase bias? Sol designed the test (R8); Claude built it. v2's numbers above are unchanged: the defaults reproduce [`results/results.json`](results/results.json) byte for byte.*

Sol's catch: in v2 every departure leaves when the turntable faces the exit, so "departure phase" is always the same and carries nothing. A phase that means anything has to be *earned* from the inputs. Three optional additions (all off by default):

- **A complex platform.** `z ← z·(1 − leak) + Σ gᵢIᵢ·e^{iθ}`. Every accepted piece of train also adds the direction the turntable was facing when it rolled on. Because tracks are faced at different angles (A 90°, B 180°, C 270°), arg z records *who* filled the platform; the load only records how much.
- **Phase release.** A departing train waits τ = round(phaseOut · arg z / 2π) ticks before it leaves the exit.
- **Vector exit.** `aisMode: 'vector'` thresholds |z| instead of the load, so trains from opposite directions can cancel.

Downstream **listeners** are real yards (the same core) whose turntables start at different phases. All numbers come from `node experiments/r8_phase.js`; see [`results/r8_phase.json`](results/r8_phase.json).

**R8a. Timing carries information beyond the count.** This uses the same 512 patterns as R5, with the first departure's delay τ at 1-tick resolution and Gaussian jitter σ:

| Jitter σ (ticks) | Count alone | Count + timing | Extra bits from timing |
|---|---|---|---|
| 0 | 1.92 | 3.36 | **1.44** |
| 0.5 | | 3.00 | 1.08 |
| 1 | | 2.66 | 0.74 |
| 2 | | 2.37 | 0.45 |
| 4 | | 2.11 | 0.19 |

Without phase release the extra is exactly 0, because every train leaves at the exit moment.

**R8b. The same yard addresses different listeners by timing.** One carriage on A, B or C produces a departure with arg z = 90°, 180° or 270°, so τ = 8, 16 or 24 ticks. Three listener yards are tuned to those arrival phases. Each cell shows which of listeners 1, 2, 3 fire:

| | A | B | C |
|---|---|---|---|
| with phase release | **100** | **010** | **001** |
| without phase release | 000 | 000 | 000 |
| phase release + axon bias 8 ticks | 010 | 001 | 000 |
| phase release + axon bias 16 ticks | 001 | 000 | 100 |

The content of the train picks the listener. Adding a common axon delay re-addresses every input to the next listener, without moving a wire: Sol's communication-through-coherence point. But it is **fragile**: ±1 tick of jitter keeps all 6 routes, ±2 keeps 3, and ±3 keeps none. The listeners' windows are narrow.

**R8c. A vector platform breaks the monotone limit.** A (track at 90°) and C (track at 270°) land on the platform in the same rotation. Scanning the threshold and C's amplitude:

| Exit reads | Boolean functions of (A, C) it can produce |
|---|---|
| load (v2) | never, A, C, AND, OR (all monotone) |
| \|z\| (vector) | never, A-and-not-C, C-and-not-A, **XOR**, OR |

XOR appears through cancellation: A alone or C alone gives a big |z|, but both together point in opposite directions and cancel. In the 512-pattern ensemble, vector mode breaks monotonicity in 32 of 2,304 pairs (v2: 0). Like the routing, it is **fragile**. XOR needs C's weight balanced against A's, in 297 of 1,380 (threshold, amplitude) settings, and C's timing within ±1 tick.

**What v3 adds to the picture.** The count says *how much*; the phase says *from where*. The axon can carry the second as *when*, and a listener's rhythm decides whether *when* means anything to it. All of this rides on precise timing: one tick of jitter costs a third of the extra bits, and two ticks break the routing.

**Prior art.**
- Phase-of-firing codes and communication through coherence: Fries 2005 and 2015.
- XOR with a single complex-valued neuron: Nitta, *Neural Networks* 2003; Aizenberg's multi-valued neurons.
- The vector platform is a phasor sum, the same mathematics as a complex-valued unit.

What's new here is only the yard framing and the measurements.

## v4: listeners that lock onto the sender (added later on 8 November)

*Antti: "continue with the train." The next step v3 named: let the listeners lock onto the sender's rhythm with v2's kick, so their windows follow it, and measure how much jitter that buys back. v2's and v3's numbers are unchanged: the defaults reproduce [`results/results.json`](results/results.json) and [`results/r8_phase.json`](results/r8_phase.json) byte for byte.*

A listener can only lock onto a rhythm it can hear. In v3 the sender's only output is data trains, and their timing *is* the message, so a listener that locked onto them would erase the address. v4 therefore adds a **pilot**: the sender also sends one carriage per rotation at its exit moment, its rhythm without content. Two optional additions to the core (both off by default):

- **`kickWeights`**: how strongly each track pulls the turntable (default: all 1, which is v2). Each listener gets the pilot on a track with **weight 0 and kickWeight 1**, so the pilot steers the turntable but never puts anything on the platform. The data still arrives on track B, as in v3.
- **`clockLearn`**: the pull also retunes the turntable's own speed, `ω ← ω + clockLearn·pull`. This is a second-order phase-locked loop.

Each pilot track sits at the angle the free listener faces when the pilot arrives. With no delay the pilot's pull averages to zero, so a locked listener behaves like a v3 listener until the timing moves (the baseline routing is **100 / 010 / 001** either way). Defaults: kick 0.4, 20 pilot rotations before the data, `clockLearn` 0.01 where it is used. All numbers come from `node experiments/r9_entrain.js`; see [`results/r9_entrain.json`](results/r9_entrain.json).

**R9a. A common delay no longer moves the address.** Pilot and data are shifted together by d ticks, for every d from −16 to 15:

| Kick | Delays that still route all 3 inputs correctly | Pilot rotations needed to lock every delay |
|---|---|---|
| 0 (v3) | 4 / 32 (−1 to +2) | |
| 0.1 | 31 / 32 (all but the half-turn point) | more than 20 |
| 0.2 | **32 / 32** | 11 |
| 0.4 | **32 / 32** | 6 |
| 0.8 | **32 / 32** | 4 |

A locked listener reads a train relative to the pilot, not relative to its own clock. So whatever delay sender and listener share drops out. That includes v3's axon bias: **locked listeners are no longer re-addressed by a common bias.** To re-address them, delay the data and not the pilot.

**R9b. What locking does and does not fix.** Routes kept, out of 6 (both signs) or as a fraction over 20 random trials:

| Disturbance | Free (v3) | Locked (kick 0.4) |
|---|---|---|
| unknown common delay ±2, pilot jitter ±1 | 0.80 | **1.00** |
| unknown common delay ±4, pilot jitter ±1 | 0.35 | **1.00** |
| unknown common delay ±16, pilot jitter ±1 | 0.10 | **1.00** |
| jitter on the data train only, ±1 / ±2 / ±3 | 6/6 · 3/6 · 0/6 | 5/6 · 3/6 · 2/6 |
| jitter on the pilot only, ±2 / ±4 / ±6 | 1 · 1 · 1 (it ignores the pilot) | 0.95 · 0.72 · 0.58 |

Pilot jitter shows the classic loop trade-off. A weaker kick averages over more pilots, so it shrugs off pilot jitter better (kick 0.2: 0.98 / 0.90 / 0.83; kick 0.8: 0.65 / 0.50 / 0.32). The price is a slower lock (11 rotations against 4). The honest negative: **locking does not rescue jitter on the data train itself.** One rotation's train is a single sample, and the window it has to hit is still a tick or two wide. Locking removes *shared* timing error, not *private* timing error.

**R9c. A sender with a different period.** The sender's rotation is 24 to 42 ticks; every listener's is 32:

| | Listeners (routing) | XOR yard (truth table) |
|---|---|---|
| kick alone, timings in ticks | 32–33 | 30–36 |
| kick + clock learning, timings in ticks | 26–34 | 31–33 |
| kick alone, timings as fractions of a rotation | 32–33 | 31–34 |
| kick + clock learning, timings as fractions of a rotation | **30–42** | **24–42** (the whole sweep) |

(Free-running passes such as 24 and 40 are coincidences: the phase had slipped by whole windows by the time the data came. They are listed in the JSON.)

The kick alone matches the sender's period on average, but it locks with a phase lag that grows with the mismatch (Adler), and the listeners' windows can't absorb that lag. Clock learning removes the lag, because it makes the receiver run at the sender's speed. That also stretches the receiver's rotation, so it only helps when the sender's timings are fractions of *its* rotation. `phaseOut` is a fixed number of ticks, so a v3 sender's τ is not a fraction of its rotation. **Sender and receiver have to agree on what a delay means: ticks, or a share of the rhythm.**

**R9d. Timing information under an unknown delay.** This is R8a's extra bits from timing given the count, where every trial has a delay drawn from −D..D. It is read either on the listener's own clock or on its locked clock:

| Delay range ±D | 0 | 1 | 2 | 4 | 8 |
|---|---|---|---|---|---|
| own clock (v3) | 1.44 | 0.91 | 0.73 | 0.45 | 0.24 |
| locked clock | **1.44** | **1.44** | **1.44** | **1.44** | **1.44** |
| locked clock, pilot jitter ±1 | 1.27 | 1.27 | 1.27 | 1.27 | 1.27 |

Once locked, the listener's clock error at the moment the data lands is exactly 0 ticks for every constant delay. A lock is translation-invariant. Pilot jitter of ±1 costs 0.18 bits, whatever the delay. The Gaussian readout jitter of R8a is private to each train, so locking would leave its cost unchanged.

**R9e. The XOR yard, locked.** The pilot rides on the XOR yard's unused B track (weight 0, kickWeight 1). The truth table stays **0110** for **32 of 32** common delays, against 3 of 32 (−1, 0, +1) free-running. C's timing *relative to A* still has to be within −1..+2 ticks: the cancellation needs A and C to meet in the same place.

**What v4 adds to the picture.** v3 found that timing codes break at about two ticks. v4 splits that fragility in two. **Shared** timing error is a delay or a drift that sender and receiver can agree on through a pilot, and a locked receiver removes it entirely: routing, XOR and the timing bits come back in full. **Private** timing error is jitter on the one train that carries the message, and locking cannot touch it. That jitter still sets the limit, about ±1 tick for the listeners and for XOR. The pilot also changes what an address is. It is no longer "when, on my clock" but "when, after the sender's beat", which is communication through coherence taken literally (Fries 2005, 2015). Second-order phase-locked loops are standard engineering (Gardner, *Phaselock Techniques*). Phase-locking a receiver to a carrier is how radios decode phase codes.

## Where it could go

1. **Two yards.** Feed one yard's exit into another's track, and add an inhibitory track that *removes* carriages. That is the smallest network that can compute XOR. Measure what that network needs.
2. **Entrain plus grow.** Let the turntable lock to a rhythmic world while the tracks grow to its timing. Does the yard tune itself to a rhythm it has never been told about?
3. ~~Route by phase~~ (v3) and ~~make it robust to shared delay~~ (v4, above). Next: **private** jitter. One train is one sample. Send each message as a short burst, or across several redundant branches, and let the listener's platform average them. How many carriages does one tick of jitter cost?
4. **Learn when to send.** Growth taught tracks when to *receive*. Can the axon bias grow so the right neighbour listens, using only the listeners' replies?

## Run

```bash
node experiments/run.js                  # ~2 s, writes results/results.json
node experiments/r8_phase.js             # ~4 s, writes results/r8_phase.json
node experiments/r9_entrain.js           # ~25 s, writes results/r9_entrain.json
node --test tests/turntable.test.js      # 16 tests
```

Open `index.html` (or the Pages link) for the lab. **Presets:**

- **Order detector:** A then B; swap the two offsets and departures stop.
- **Learn a timing:** growth on; watch the lengths move.
- **Entrain:** kick 0.4 with a 36-tick input.
- **Address listeners** (v3): one carriage on A, B or C every other rotation; each lights its own listener. Then move the axon bias by 8.
- **XOR** (v3): the exit reads |z|; A alone and C alone leave, A + C cancel. The truth-table button compares load and vector exits at the current threshold.
- **Locked listeners** (v4): Address listeners with the pilot lock on. Move the axon bias and the routes come back within a few rotations; add axon jitter and routes fail anyway (about 30% missed at ±1, 40% at ±2, because the jitter hits the data trains too). The lock button and the jitter slider work with any preset.
