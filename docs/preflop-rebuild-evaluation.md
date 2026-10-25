# Preflop coach replacement: evaluation record

Historical checkpoint for the initial preflop replacement. Later regression fixes,
explanations and flop calibration are covered by the
[latest validation record](coaching-evaluation.md).

Date: 2026-10-24. Baseline Git revision: `a01c225`. Implementation is the working
change relative to that revision. Profile: six-max no-rake cash, no ante.

## Change and hypothesis

Replace raw-equity preflop gates with an original, reference-informed positional
teaching policy. Separate first entry, responding to an open, squeezes, defending
an earlier open, cold four-bets and further raises. Hypothesis: this fixes missed
premium aggression and inappropriate folds without turning marginal opening
hands into mandatory raises. The exact tables are simplified authored ranges,
not licensed solver exports. Passing these checks does not establish GTO accuracy.

The ordinary graded response scope is 75–150 BB effective with documented sizing
bands. Other situations receive provisional suggestions, are marked Not graded,
and do not affect accuracy. Preflop equity percentages are hidden because these
policy decisions do not depend on guaranteed-showdown simulations.

## Results

| Check | Result |
| --- | --- |
| Baseline automated tests | 93 passed, 0 failed |
| Final automated tests | 152 passed, 0 failed |
| Independent history-auditor tests | 8 passed, 0 failed |
| Preflop specifications | 50 cases × 3 seeds: 150 passed, 0 failed |
| Full hand-class sweep | 169 classes × 15 positional matchups: 2,535 legal deterministic decisions |
| Existing postflop observations | All 32 results unchanged from baseline |
| Simulation seed 9182 | 1,000 hands completed; 11,094 actions independently audited; 0 rules/payout failures |
| Simulation seed 424242 | 1,000 hands completed; 11,039 actions independently audited; 0 rules/payout failures |
| Local browser smoke check | ATs BTN versus CO shows Raise to 8 BB without an equity percentage; short-stack feedback shows Not graded; no browser runtime errors |

Of the 50 specifications, 44 concern supported behavior. Comparing only preferred
and accepted actions, sizing and legality (excluding new coverage metadata), the
old coach passed 13/44 and the new coach passed 44/44. This measures agreement with
our intended teaching specifications, not independent solver quality. Ten contrast
cases were specified before the first run; following use, they are public regression
cases rather than an unseen benchmark.

## Failure analysis and corrections

The initial preflop evaluation passed 141/150 runs. Nine failures represented
three cases repeated under three seeds:

1. BB versus SB expected an out-of-position size even though BB is in position.
   Corrected that size expectation. Also allowed calling with TT as a reasonable
   alternative to the preferred three-bet rather than enforcing one action.
2. BB cold-four-betting over SB ignored the original BTN raiser when selecting
   its position-based size. Corrected the coach to consider every involved player.
3. A player who called an open and then faced a squeeze was classified as making
   a fresh cold-four-bet decision. Added a separate provisional context.

Two legacy unit assertions also failed. One required thousands of Monte Carlo
samples for a 40-BB J9s defense. Replaced it with checks for explicit unsupported
coverage, zero sampling and no mistake grading. The other accepted calling A9o
against a three-bet based on raw equity. Changed it to a fold under the positional
baseline, retaining hidden-card isolation checks. Fixture rationales document both
changes. Small suited-ace defenses against modest three-bets still accept folding
and calling where covered; those alternatives were not removed just to pass tests.

A final edge-case check ensures premium hands too short to raise can call rather
than receiving fold advice. That safeguard concerns sub-blind stacks outside the
simulation's 25–150 BB starting-stack schedule.

## Simulation coverage and limits

| Seed | Graded preflop decisions | Provisional preflop decisions | Hero profit (descriptive only) |
| --- | ---: | ---: | ---: |
| 9182 | 489 | 504 | +439.5 BB |
| 424242 | 485 | 503 | +245 BB |

The baseline seed-9182 run produced +539 BB. Do not interpret the change in profit
as evidence for or against the replacement: these are small samples, changed hero
actions change subsequent paths, and bot behavior is not a solver benchmark.
Opponent policy was held fixed. Mixed-stack hands intentionally contribute many
provisional decisions rather than extrapolating 100-BB advice to 25/40-BB play.

The independent auditor also flagged 64 and 80 strategy-review candidates across
the two runs. All concerned bots; none concerned hero. These broad triggers are
not proven mistakes and are separate from the zero rules-failure result. No bot or
postflop strategy changes were made to reduce those counts.

## Reproduction and artifacts

- `npm test`
- `npm run test:audit`
- `npm run eval:coach -- evals/preflop-after/release`
- `npm run eval:preflop -- evals/preflop-after/preflop-only`
- `npm run simulate -- 1000 9182 evals/preflop-after/seed-9182`
- `npm run simulate -- 1000 424242 evals/preflop-after/seed-424242`
- `npm run audit:histories -- evals/preflop-after/seed-9182`
- `npm run audit:histories -- evals/preflop-after/seed-424242`

Choose fresh output directories when rerunning simulations. Generated reports and
histories are ignored by Git. Final case reports are in
`evals/preflop-after/release/`; action/sizing comparison is in
`evals/preflop-after/behavior-comparison.json`. Baseline reports and histories are
in `evals/preflop-before/`. Sources and full coverage details are in
[coach-policy.md](coach-policy.md).
