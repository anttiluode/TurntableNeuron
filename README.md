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

## v5: time windows and path sums (added later on 8 November)

*Two 2025 papers about the time windows of real neurons, plus Feynman's sum over paths, which Antti brought in from a video. v2–v4 numbers are unchanged: the core was not touched, and `results.json`, `r8_phase.json` and `r9_entrain.json` reproduce byte for byte.*

- **Drebitz, Rausch & Kreiter, *Nat Commun* 2025.** The authors microstimulated single spike volleys in macaque V2 while the monkey did an attention task, and recorded downstream in V4. The volleys disturbed V4, and the monkey's behaviour (misses 31.9% against 15%, reaction times 45–70 ms slower), only when they arrived in an **effective phase range of about ±45° of V4's gamma cycle** (40–80 Hz). V4's spiking response came from a range about 90° wide. That is causal evidence that a receiver's rhythm decides whether a well-timed train counts: R8b's listener windows, in a real brain.
- **Norman-Haignere et al., *Nat Neurosci* 2025.** The authors stretched or compressed speech by √3 each way, a threefold change in phoneme and word durations. Integration windows in human auditory cortex changed by only **about 5%**, even in non-primary, speech-selective regions. The windows are **yoked to absolute time, not to structure.**

All numbers come from `node experiments/r10_windows.js`; see [`results/r10_windows.json`](results/r10_windows.json).

**R10a. A window should be as wide as the spacing between addresses.** In v3 the listener windows were 4 ticks wide (45°), but the addresses were 8 ticks apart. Window width in ticks out of 32, for a listener with gate sharpness κ and threshold = fraction × best single load:

| κ \ threshold | 0.8 | 0.6 | 0.4 | 0.25 |
|---|---|---|---|---|
| 16 | 2 | 4 | 5 | 6 |
| 8 (v3) | 2 | **4** (v3) | 6 | 7 |
| 4 | 3 | 5 | **8** (= 90°) | 10 |
| 2 | 4 | 7 | 10 | 13 |
| 1 | 6 | 10 | 14 | 20 |

Next, K addresses are spread evenly over one rotation, with one listener per address. The table shows the shifts every route survives, for the v3 listener and for the best listener on that grid:

| Addresses K | Spacing (ticks) | v3 listener | Best listener (κ, threshold → window) | Accuracy at Gaussian jitter σ = 2: v3 → best |
|---|---|---|---|---|
| 2 | 16 | −1…+2 | −6…+7 (κ 1, 0.4 → 14) | 0.62 → 1.00 |
| 3 | 10.7 | −1…+2 | **−4…+5** (κ 4, 0.25 → 10) | 0.67 → 0.98 |
| 4 | 8 | −1…+2 | **−3…+4** (κ 4, 0.4 → 8) | 0.70 → 0.96 |
| 5 | 6.4 | −1…+2 | −2…+3 (κ 16, 0.25 → 6) | 0.67 → 0.86 |
| 6 | 5.3 | −1…+2 | −2…+2 (κ 16, 0.4 → 5) | 0.66 → 0.79 |
| 8 | 4 | −1…+2 | −1…+2 (κ 16, 0.6 → 4) | 0.65 → 0.65 |

From K = 3 to 8, the best tolerance equals the spacing, rounded down to whole ticks, and the window that achieves it is as wide as the spacing. (At K = 2 the gate can't open quite wide enough: 14 of 16.) The v3 listeners were sized for 8 addresses while carrying 3. So most of the "private jitter" fragility in v3 and v4 came from the listeners, not from the trains. The trade is exact: **K addresses per rotation buy ±P/2K ticks of jitter.** A ±45° window, as in Drebitz et al., is the K = 4 point: **about four addresses per gamma cycle.** (The lab's new *Wide listener windows* button uses κ 4 and threshold 0.4. Locked and wide, the lab routes about 92% correctly at ±2 ticks of axon jitter, against about 62% with v3 windows.)

**R10b. Time-yoked or rhythm-yoked?** A listener is locked to a sender whose period is 29, 32 or 35 ticks (a ratio of 1.21). Its integration window is measured as the full width at half maximum of its platform load against the data's arrival time:

| | Window in ticks at sender period 29 / 32 / 35 | Ratio 35 : 29 |
|---|---|---|
| listener 3, kick only (it listens after the pilot's pull has ended) | 5.51 / 5.45 / 5.46 | **0.99** (time-yoked) |
| listener 3, kick + clock learning | 5.15 / 5.46 / 5.88 | 1.14 |
| listener 1, kick only (it listens during the pilot's pull) | 4.67 / 4.93 / 5.48 | 1.17 |
| listener 2, kick only (it listens at the tail of the pull) | 5.62 / 5.79 / 6.76 | 1.20 |

There are two ways a window can follow the sender's rhythm. Clock learning makes the whole turntable run at the sender's speed. Separately, a window that falls while the pilot is still pulling gets stretched or squeezed by the pull itself. A listener that does neither keeps a window fixed in ticks, as auditory cortex does. In R9c terms, auditory cortex behaves like kick alone with timings in ticks, not like clock learning. Norman-Haignere's 5% for a threefold change says real receivers stay on their own clock, and the yard says that only holds if the alignment kick lands away from the moment of listening.

**R10c. The vector platform is a Feynman sum at one frequency.** v3's platform adds e^{iθ(t)} for every accepted piece. A platform that always listens (κ = 0, no leak) therefore holds z = S · Σ_routes a_γ e^{iωT_γ}, where S is one carriage's contribution and ω = 2π/32. This checks to **4 × 10⁻¹³** over 30 random route sets. Consequences:

- **Two routes interfere** as |2 cos(πΔ/32)|. Measured |z|, relative to one route, at delay difference Δ = 0, 8, 12, 16, 24, 32, 48, 64: 2, 1.41, 0.77, **0**, 1.41, **2**, **0**, **2**.
- **Stationary phase.** Take 41 routes with delays round(0.25(m − 20)²), slowest-varying at the centre. Partial sums from the centre outward (|z| over one route) go 1, 5.0, 8.6, **10.7**, 9.4, 6.1, 8.0, 9.0: a Cornu spiral. Removing the 9 central routes leaves **38%** of |z|; removing 9 routes at one edge leaves 89%. The routes near the stationary time carry the sum, exactly as in Feynman's account of least time.
- **Aliasing.** Delays T and T + 32 are indistinguishable on the 32-tick clock (difference 4 × 10⁻¹⁴) but differ by 82% on a 37-tick clock. Two clocks with periods 32 and 37 separate delays up to 32 × 37 = 1,184 ticks. This is the Chinese remainder theorem, the reason RoPE uses many frequencies, and the reason grid cells come in modules (Fiete, Burak & Brookings 2008).

The load platform is the incoherent case: ray optics, which only adds sizes. The vector platform is the coherent case: wave optics, which adds phases. v4's pilot is what makes the second possible, because it gives every arrival the same clock.

**What v5 adds to the picture.** Address count, window width and jitter tolerance are one trade, and a real cortex sits near four addresses per cycle with windows a quarter of a cycle wide. Real receivers keep windows fixed in absolute time; the yard reproduces that only when the steering pull and the listening happen at different moments. And the vector platform needs no new mechanism to count as interference: it is literally a single-frequency path sum. Adding clocks adds frequencies.

## Where it could go

1. **Two yards.** Feed one yard's exit into another's track, and add an inhibitory track that *removes* carriages. That is the smallest network that can compute XOR. Measure what that network needs.
2. **Entrain plus grow.** Let the turntable lock to a rhythmic world while the tracks grow to its timing. Does the yard tune itself to a rhythm it has never been told about?
3. ~~Route by phase~~ (v3), ~~robust to shared delay~~ (v4), ~~size windows to the address spacing~~ (v5). Still open: **bursts and redundancy.** A burst of carriages, or several branches, let the platform average private jitter. How many carriages does one tick of jitter cost?
4. **Learn when to send.** Growth taught tracks when to *receive*. Can the axon bias grow so the right neighbour listens, using only the listeners' replies?
5. **Learn routes in a multi-layer yard without a map** (from the Feynman thread). A junction x is on a shortest A→B route exactly when t_A(x) + t_B(x) = T_min. Send forward trains from A and reply trains from B, and grow junctions where the two arrive in the same window. Add a traffic-dependent split at junctions (share ∝ flow^γ: γ = 1 blurs routes together, γ > 1 lets one route win, as in Physarum network models, Tero et al. 2010).

## Run

```bash
node experiments/run.js                  # ~2 s, writes results/results.json
node experiments/r8_phase.js             # ~4 s, writes results/r8_phase.json
node experiments/r9_entrain.js           # ~25 s, writes results/r9_entrain.json
node experiments/r10_windows.js          # ~25 s, writes results/r10_windows.json
node --test tests/turntable.test.js      # 19 tests
```

Open `index.html` (or the Pages link) for the lab. **Presets:**

- **Order detector:** A then B; swap the two offsets and departures stop.
- **Learn a timing:** growth on; watch the lengths move.
- **Entrain:** kick 0.4 with a 36-tick input.
- **Address listeners** (v3): one carriage on A, B or C every other rotation; each lights its own listener. Then move the axon bias by 8.
- **XOR** (v3): the exit reads |z|; A alone and C alone leave, A + C cancel. The truth-table button compares load and vector exits at the current threshold.
- **Locked listeners** (v4): Address listeners with the pilot lock on. Move the axon bias and the routes come back within a few rotations; add axon jitter and routes fail anyway (about 30% missed at ±1, 40% at ±2, because the jitter hits the data trains too). The lock button, the jitter slider and the **Wide listener windows** button (v5) work with any preset. Listener counts are departures (firing events).
