# Coaching validation record

Validated on 2026-10-24: coach `ranges-v5`, compared with baseline revision
`a01c225`. The profile is six-max no-rake cash with no antes. The ordinary
preflop baseline covers 75–150 BB effective and documented raise-size bands;
outside that coverage, advice is provisional and excluded from accuracy.

## Changes covered

- Positional preflop calls, three-bets, squeezes, four-bets and further responses.
- Separate grading for supported, mixed and provisional decisions.
- Hand-specific explanations, sizing notes and accepted alternatives.
- Closing BB overcalls, including the reported Q6s BTN-open/SB-call scenario.
- Offsuit-connector defense, including 87o versus a small BTN open.
- Checked-to flop overpairs, including KK on 8c 3d 2h after a small BTN three-bet.
- Active saved-session migration, without discarding histories or scores.

The KK flop case now accepts betting and checking. The preferred bet is 4 BB
into 12.5 BB; the tested half-pot candidate of 6.5 BB also clears the calibrated
gate. This calibration enumerates one- and two-caller outcomes using current-board
response weights. It is conditional showdown-share evidence, not a full model of
future betting or check-raises. The river policy and simulated bot policy were
not changed.

## Results

| Check | Result |
| --- | --- |
| Automated tests | 215 passed, 0 failed |
| Independent auditor tests | 8 passed, 0 failed |
| Public reviewed observations | 52 evaluated, including 13 new flop cases |
| New flop expectation checks | 39 passed across three seeds, 0 failed |
| Preflop scenarios | 74 cases, 222 runs passed, 0 failed |
| Prior reviewed observations | All 39 retained their strategic outputs |
| Seed 9182 simulation | 1,000 hands; 11,133 audited actions; 0 rules/payout failures |
| Seed 424242 simulation | 1,000 hands; 11,004 audited actions; 0 rules/payout failures |
| Browser verification | Original 6.5 BB KK flop bet displays Close; checking accepted; no runtime errors |

The suites include a 169-class sweep across 15 positional matchups, hidden-card
and future-deck isolation, saved-session restoration, legal bet sizes and
reopening, score exclusions, and analytic caller-branch checks. Flop controls
cover lower overpairs, underpairs, unpaired hands, overcards, board textures,
short stacks and players still to act. Scope controls do not claim that a bet
outside the calibrated family is necessarily wrong.

The independent strategy screen flagged 151 bot actions and no coached-player
actions across the two simulations. These are qualitative review candidates,
not failed rules checks or proved strategy errors. Unfiltered histories and
changed betting paths were inspected. Source hashes were unchanged during the
final validation runs.

## Interpretation

Passing these checks establishes agreement with the intended teaching policy and
verified game integrity. It does not establish solver accuracy or optimality.
The exact preflop ranges are authored baselines, not licensed solver exports.
The flop response models, stronger-hand weighting and equity thresholds are
explicit heuristic assumptions. Simulation profit is descriptive only.

The mixed-stack schedule produced 974 graded and 1,009 provisional preflop
decisions. This limited coverage is intentional; it avoids applying the ordinary
baseline to 25/40 BB decisions. Further short-stack and independent strategy
validation remain separate work.

## Reproduce

Choose a fresh output directory for every simulation:

```sh
npm test
npm run test:audit
npm run eval:coach -- evals/new-validation/cases
npm run eval:preflop -- evals/new-validation/preflop
npm run simulate -- 1000 9182 evals/new-validation/seed-9182
npm run simulate -- 1000 424242 evals/new-validation/seed-424242
npm run audit:histories -- evals/new-validation/seed-9182
npm run audit:histories -- evals/new-validation/seed-424242
```

Generated logs, reports and histories stay in ignored `evals/` directories. The
final local run is recorded under
`evals/flop-calibration/validation-ranges-v5/`, including a source-hash manifest,
per-seed expectations, prior-case comparisons and independent audits.
See [coach policy](coach-policy.md) for assumptions and
[evaluation workflow](evaluations.md) for adding cases.
