# Coaching policy

The coach estimates opponent ranges from public actions and compares legal
choices. It is a training heuristic, not a poker solver or a GTO strategy.
Computer opponents use a separate, equity-based strategy and random stream.

## Information and ranges

Each successful action records a public event: seat, position, street, exposed
board, pot, amount to call, stack, earlier raises, action and amount committed.
Illegal actions add no events. Events contain no private cards or future deck.

For each live opponent, the coach weights legal two-card combinations by the
likelihood of the observed actions. Preflop priors use position charts; calls
and reraises favor stronger holdings while retaining some bluff weight.
Postflop likelihoods use board-relative strength, draws, sizing and aggression.
Checks retain some strong hands, and aggression retains some bluffs.
These likelihoods are explicit assumptions, not calibrated opponent frequencies.

Inference uses only the acting player's cards and public information. Each
past action is evaluated with the board available at that time. Multiway
sampling rejects an entire joint draw if cards overlap, avoiding biased ranges
for later opponents.

## Preflop and earlier streets

Opening and isolation decisions use fixed position charts. Facing preflop
aggression uses at least 640 equity samples; facing a three-bet or further raise
uses at least 2,048. Calling decisions also test tighter and looser ranges and
accept call/fold alternatives near the decision boundary.

Before the river, range-weighted equity guides calls with a cushion for future
betting and multiway uncertainty. Raises require strong equity against the
narrower ranges likely to continue. Raw equity does not fully capture equity
realization or future betting. Extra samples reduce sampling error, not model
error.

## River decisions and sizing

The coach compares fold, call/check and legal raise sizes. Candidates include
the minimum, three times the current bet, half-pot, pot, 1.5-pot and the effective
all-in. Pot-based targets equal the current bet plus a fraction of the pot after
calling. Sizes are rounded to chip increments and clipped to legal stack limits.

Values measure expected change in stack from the decision; earlier contributions
are sunk. Settlement accounts for contribution layers, stack caps, uncalled
refunds, folded dead money and odd-chip order.

Raises model opponent folds, calls and one possible shove reraise. Each size
has plans to fold or call against a shove. The response model accounts for the
price offered by small bets and a narrower continuing range against overbets.
Above pot size, the size premium grows logarithmically. The strength threshold
is capped at 0.90 to avoid assuming strong bluff-catchers always fold, and the
random-call floor decreases with size. These coefficients are heuristic.

Each exact size and response plan is tested against the best passive option
under balanced, tight, loose, sticky and value-heavy models. A recommended raise
must improve on passive play in every model by more than max(0.25 BB, 2% of pot),
after subtracting two combined sampling standard errors. The coach selects the
qualifying size with the highest worst-case advantage. If none qualifies, it
prefers passive play and accepts reasonable alternatives. Large value bets and
profitable modeled bluffs remain available.

The value-heavy model triples the relative weight of holdings making trips or
better, testing sensitivity to slow plays and stronger made hands. It changes
range composition while retaining baseline response behavior. The multiplier
is a stress assumption, not an estimate of an opponent's actual frequencies.
It has no effect before the river.

Heads-up river holdings and responses are enumerated exactly. Multiway rivers
use sampled disjoint holdings and responses. The passive baseline lets pending
players call or fold but does not model fresh bets after a check. Raise branches
model one shove, not an unbounded betting tree. These approximations can bias
values even when sampling error is zero.

## Feedback and evaluation

Close decisions accept alternatives within the largest of 0.25 BB, 2% of pot,
or two sampling standard errors of a model's best value. Accepted alternatives
appear as “Both reasonable.” Scoring checks action categories; every possible
custom raise size is not independently graded.

Reports include the model identifier, range summaries, action values, targets,
response plans and sensitivity results. Raise values expose
`worst_case_advantage_bb` for inspection.

`npm run eval:coach` evaluates 34 public observations in
`tests/fixtures/coach-decisions.json`. Cases cover weak bluff-catchers, thin
value, large sizing, strong-made-hand concentration, preflop uncertainty and
positive controls. Tests also cover side pots, short stacks, odd chips,
hidden-card isolation, exact session restoration and browser workers.

Review judgments are not solver-certified labels. Changes in recommended
actions, profits or automatic review-flag counts do not establish stronger
strategy. Use the [evaluation workflow](evaluations.md) and independent expert
or solver references before drawing strategic conclusions.
