# Turntable Neuron — an executable computational rail yard

**Status:** designed mechanistic toy, not a biological neuron, not a direct simulation of the `ChainNeuronsWithPhaseSpike` wave field. No GitHub repository was modified. 2026-11-08.

## Source lineages

- `anttiluode/Operaattori` supplied the idea that dendritic geometry is an **electrical transport operator**, not a screen-space drawing.
- `anttiluode/chainneuronswithphasespike` supplied an excitable **2π phase slip** near a locking boundary, and its negative relay experiment motivates separating internal events from externally transmitted pulses.
- `anttiluode/JelloBrain` supplied the distinction between **continuous internal state**, **salience**, and an **outward launch boundary**.
- `anttiluode/GeometricNeuronOriginReview` supplied a cautionary lesson: keep causal source signals, state, and pipeline timing explicit, and compare interventions rather than appearances.

## Core: compact, discrete, transparent

Three dendritic cables contain `N_i` electrical compartments, with leak and axial conduction. At each tick, the proximal end contacts the soma, and a finite-duration stimulus enters at the distal end.

```
u_i,j(t+1) = u_i,j(t) + dt [D (u_i,j-1 - 2 u_i,j + u_i,j+1)
                              - leak u_i,j + source_i,j(t)]
```

`dt=0.22`, `D=1.05`, fixed shared leak `0.045` by default. Sealed distal endpoint and voltage-coupled proximal endpoint. These are normalized toy units; no biological lengths, ionic current units, or membrane capacitance are inferred.

The soma receives branch currents (coupled to its own membrane voltage) and a small *explicit* paired-arrival nonlinearity. This is not an NMDA-channel model; it is a controlled nonlinear conjunction:

```
soma += dt * [0.25 Σ weight_i (u_i,0 - soma)
              - 0.10 soma
              + plateau · Σ_{i<j} min(max(0,w_i u_i,0),max(0,w_j u_j,0))]
```

A phase variable acts as an excitable turntable. The unforced gate is *locked* because `delta=0.06 < K=0.09`:

```
theta += delta - K sin(theta) + phaseDrive·max(0,soma)
         + 0.025·sin(slowPhaseMemory) - axonThreshold
```

The stable phase is `asin(delta/K)` when memory and input are zero. A stimulus may carry `theta` across the unstable phase and cause a complete winding; each completed 2π winding is interpreted as one output event. A slow phase variable shifts excitability and chooses among three output rails, and each slip writes `+0.22 rad` to that memory. **Both of these choices are explicitly engineered toy mechanisms**; they do not follow automatically from the chain field model or from AIS biology.

An optional `transmit` switch converts each detected event into a fresh pulse after seven ticks. The recipient fires when this pulse crosses its explicitly defined detection threshold. Without that transducer the recipient stays quiet even though the source completes its internal phase slip. This is a controlled illustration of the *missing relay* in the earlier wave-field work, not a demonstration that the original wave field has been solved.

The display's `A/B/C` source labels are **observer metadata** for the most recent inputs, not information recovered by an autonomous decoder. The physical computation is in cable voltages, soma integration, and phase dynamics. True carriage/payload composition is a future experiment.

## Reproducible first assays

`node --test test_turntable.cjs` passes 9/9 tests, including deterministic reset, fixed input ablations, cable length effect, slow phase gating, and relay vs no-relay.

Run `node -e "console.log(require('./trainyard_core.js').assay())"` for matched scenarios. At defaults and 370 ticks: isolated A and isolated B produce **0** phase slips, the simultaneous `A+B` case **1** slip and **1** downstream event. Shortening cable A from 6 to 4 compartments makes A alone sufficient; lengthening it to 16 does not. Setting the slow memory to `-2 rad` suppresses the otherwise identical A+B event, while memory `0 rad` permits it.

These are design/test outputs, not a scientific discovery in an uncontrolled physical system. The model was tuned to demonstrate the desired causal distinctions. It earns no claim of emergent biology, generality, learning, or noise robustness.

## What to attack next, without opening another repository

1. **Fair cable replacement:** replace each full cable by a measured linear transfer kernel with the same input-output map. Test equality of spike times, not just soma peak.
2. **True carriages:** encode two independent features in locally delivered signals; do not pass source-label metadata to the decoder. Measure what combinations survive at soma and what information escapes through spike timing, event count, or route. Count the output bits honestly.
3. **Phase-only versus event:** compare real continuous oscillatory output to explicit regenerated pulses in a spatial receiver; score both with direct leakage and no-sender controls.
4. **Structural growth:** after previous checks, allow a bounded, local rule to change branch length/coupling to restore timing for a task. Compare against fixed geometry and ordinary tuned delays.
5. **Retained-state split:** construct microstates with equal soma voltage and phase but different branch voltages; deliver the same input. Identify the minimal state needed for closure.

## Files

- `turntable_neuron.html`: self-contained offline animated laboratory; open directly in Chrome/Edge/Firefox.
- `trainyard_core.js`: deterministic browser/Node simulation core.
- `test_turntable.cjs`: 9 headless tests (`node --test test_turntable.cjs`).
- `assay.json`: matched-world assay results.

Scientific background: Rall-type passive cable theory, excitable phase reduction (Adler/SNIC), and the axon initial segment as a specialized action-potential initiator. The train turntable's three-way routing is an explicitly hypothetical engineering device, not normal AIS physiology.
