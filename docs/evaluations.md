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
Strategy candidates alone do not fail an audit. The evaluator is diagnostic;
`npm test` contains the explicit regression assertions.

## Add a decision case

`tests/fixtures/coach-decisions.json` is the single collection of public decision
observations. For each case:

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
