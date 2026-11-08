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

## Where it could go

1. **Two yards.** Feed one yard's exit into another's track, and add an inhibitory track that *removes* carriages. That is the smallest network that can compute XOR. Measure what that network needs.
2. **Entrain plus grow.** Let the turntable lock to a rhythmic world while the tracks grow to its timing. Does the yard tune itself to a rhythm it has never been told about?
3. **Route by phase.** This is Sol's v1 idea. If the exit had several rails and the departure phase chose one, how many more bits get out than with a count alone?

## Run

```bash
node experiments/run.js                  # ~2 s, writes results/results.json
node --test tests/turntable.test.js      # 8 tests
```

Open `index.html` (or the Pages link) for the lab. **Presets:**

- **Order detector:** A then B; swap the two offsets and departures stop.
- **Learn a timing:** growth on; watch the lengths move.
- **Entrain:** kick 0.4 with a 36-tick input.
