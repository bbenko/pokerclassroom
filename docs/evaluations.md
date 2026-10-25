# Poker evaluation workflow

Use this workflow for engine, range, sizing and coaching changes. Evaluate
rules integrity, strategy regressions and new hands separately. Coach agreement
or a profitable simulation does not establish strategic correctness.

Requires Node.js 20+ and Python 3.10+. No package installation or external model
API is needed. Commands run from the repository root.

## Run checks

Choose a new output name for each experiment:

```sh
npm test
npm run test:audit
npm run eval:coach -- evals/example-run/cases
npm run eval:preflop -- evals/example-run/preflop
npm run simulate -- 1000 9182 evals/example-run/hands
npm run audit:histories -- evals/example-run/hands
```

The simulator rejects an existing output directory. The evaluator and auditor
replace their report files, so use separate experiment folders to retain results.

| Command | Arguments after `--` | Default output |
|---|---|---|
| `npm test` | None | Regression test results |
| `npm run test:audit` | None | Independent Python auditor tests |
| `npm run eval:coach` | Optional output folder | `evals/coach/review-case-results.json` |
| `npm run simulate` | Count, seed, output folder | 1,000 hands, seed 9182, `evals/latest` |
| `npm run audit:histories` | Optional history folder | `evals/latest/review/audit.json` |

The simulator follows coach recommendations against equity-based opponents.
It requests 160 hero equity samples, with adaptive effort and exact heads-up
river enumeration. Opponents use 53 samples by default. The button rotates,
stacks alternate between equal and mixed, and stacks reset each hand. Synthetic
stakes are $0.50/$1.00 with no rake. Export dates are fixed for reproducibility.

Outputs include:

- Individual text histories: actions, visible cards, returns, payouts and summary.
  Folded opponent cards stay hidden. Third-party importer compatibility is unverified.
- `summary.json`: settings, outcome coverage, actions, profit and integrity counters.
- `review/audit.json`: checked files/actions, rules failures and strategy candidates.
- `preflop-results.json`: Position/action specifications under three seeds,
  coverage/grading assertions, size bounds and failures. Failing specifications
  return exit status 1. No solver-EV accuracy is implied.
- `review-case-results.json`: case IDs, concerns, recommended actions and sizes,
  accepted alternatives, equity, confidence, explanations and sensitivity results.

## Compare a change

Record the hypothesis before implementation, then run the same cases, seeds
and stack schedule before and after the change. Keep outputs in separate folders
and record the Git revision or diff for each run. Keep opponent behavior fixed
when evaluating coaching changes.

Run an additional seed after implementing the change:

```sh
npm run simulate -- 1000 424242 evals/example-run/additional-seed
npm run audit:histories -- evals/example-run/additional-seed
```

Seeds 9182 and 424242 are development benchmarks. Use fresh seeds for holdout
validation. Changing hero decisions can change consumption of opponent random
numbers and therefore later action paths, even with identical deal seeds.

Review these results separately:

1. Rules and data integrity: all requested hands finish, chip/deck/payout counters
   equal the requested count, and the independent auditor finds no rules failures.
2. Strategy cases: compare actions, sizes, accepted alternatives and explanations.
   Investigate changes to positive controls, not only suspect hands.
3. New hands: inspect full histories around strategy candidates and an unfiltered
   sample of unflagged decisions. Automatic screens can miss mistakes.
4. Coverage and profit: record showdowns, side pots, split pots and profit as
   descriptive measures, not strategy pass/fail labels.

The simulator throws on incomplete hands or invariant failures. The auditor
returns status 1 for rules failures or missing/empty input, and 0 otherwise.
Strategy candidates alone do not fail an audit. The evaluator reports all public observations and enforces explicit expectations
for the new postflop calibration under three seeds. Failed expectations return
status 1. `npm test` also contains regression assertions and analytic caller-branch
checks. Existing cases without expectation metadata remain diagnostic.

## Add a decision case

`tests/fixtures/coach-decisions.json` holds public decision observations.
`tests/fixtures/preflop-decisions.json` holds independently specified positional
scenarios reconstructed through legal actions. Its contrast cases were specified
before the first run; after use they are public regression cases, not an unseen
benchmark. Keep expected actions and rationale independent of the policy tables. For each case:

1. Capture state before the decision: positions, stacks, contributions, board,
   current bet, last full raise, `acted_at`, `pending` and public history events.
2. Keep only the acting player's hole cards. Remove future deck, unrevealed cards
   and later actions. These are decision observations, not full deals for deck checks.
3. Add a unique descriptive ID, category, review rationale and source hand number.
   The evaluator uses `10000 + hand` as its deterministic sampling seed.
4. Add assertions in `tests/coach.test.cjs`. Accept alternatives for uncertain
   decisions and test size/value properties when action category is insufficient.
5. Include a contrasting control: a valid value raise, cheap call, bluff or
   stack-constrained decision. Losing a pot does not establish a strategy error.

Support strategy judgments with independent expert or solver evidence when
available. Explain corrections to previous expectations in the commit rather
than weakening tests to make a new model pass.

The small `tests/fixtures/hand-000196.txt` fixture tests the independent auditor.
Its tests deliberately corrupt payouts, calls, raises, turn order and pot totals.
Keep it tracked so audits work without generated simulation output.

## What belongs in Git

Commit code, evaluation scripts, regression tests, public fixtures and current
policy documentation. Keep bulk histories, generated reports and temporary
review notes in ignored `evals/` directories. Describe settings, coverage,
failures, reviewed behavior and limitations in the commit or release notes.

The automatic strategy screen flags suspicious patterns, not proven mistakes.
Review only information available at the decision, separate rules failures from
strategic concerns, and state the assumptions supporting an alternative action.

## Preflop replacement evaluation

Before implementation, preserve existing case reports and run 1,000 hands with
seed 9182. Keep opponent strategy fixed. After implementation, run the full test
suite, both evaluation suites, the independent auditor tests and two 1,000-hand
simulations (9182 and 424242), auditing every exported history. Report provisional
preflop coverage separately from graded decisions. Profit changes are descriptive,
not evidence of strategic accuracy.

Failure analysis must distinguish policy errors from invalid specifications. For
example, BB versus SB is in position and should use the in-position size; a cold
four-bet from BB over SB still has the original BTN raiser to consider. Legacy
assertions requiring thousands of preflop Monte Carlo samples are obsolete when
the decision comes from a deterministic positional policy. A 40-BB defense should
be provisional rather than forced into a 100-BB range. Record any changed action
expectation and its strategic rationale; do not weaken checks to make a run pass.

## Flop overpair calibration

Hand 13 (KK on 8c 3d 2h after a BTN three-bet, BB/CO calls and two checks) is a
permanent public observation with no opponent private cards or future board.
The old check-only rejection was reproduced before integration. New cases add
AA/QQ/JJ variants and controls for an underpair, an ace above KK, unpaired AK,
board textures, shallow stacks and a player still to act. Scope-only controls do
not assert that a bet outside the calibration would be a strategic mistake.

Expected actions, calibration eligibility and size bounds live in each new
case's `expectation` field. `eval:coach` runs these expectations under seeds 13,
71 and 2026 and saves the per-seed results in `checks` beside the ordinary case
reports. These are public regression checks, not unseen strategy validation.
Inspect `value_bet_evidence` separately from river action EVs: it contains
conditional sampled showdown shares, not a future-betting EV calculation.
