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

Opening decisions use deterministic position charts for six-max cash games,
roughly 100 BB deep, with no antes. An unopened pot means everyone before the
actor folded: blind posts do not count as voluntary entry. These are simplified
raise-or-fold training baselines, not solver-certified ranges or mixed strategies.
Percentages count card combinations (out of 1,326), not equally weighted classes.

| Position | Target | Implemented | Combinations |
| --- | ---: | ---: | ---: |
| UTG / Lojack | ~18% | 17.8% | 236 |
| HJ | ~23% | 22.8% | 302 |
| CO | ~30% | 30.3% | 402 |
| BTN | ~45% | 44.8% | 594 |
| SB | 40–50% | 47.5% | 630 |

The SB baseline uses the 40–50% band. Whole hand classes produce small
differences from the other percentage targets. Exact selections:

| Position | Pairs | Suited hands | Offsuit hands |
| --- | --- | --- | --- |
| UTG | 55+ | A2s+, K9s+, Q9s+, J9s+, T9s, 98s | ATo+, KJo+, QJo |
| HJ | 44+ | A2s+, K8s+, Q8s+, J8s+, T8s+, 98s, 87s, 76s | ATo+, KTo+, QTo+, JTo |
| CO | 22+ | A2s+, K5s+, Q6s+, J7s+, T8s+, 97s+, 86s+, 76s, 65s, 54s | A8o+, K9o+, QTo+, J9o+ |
| BTN | 22+ | A2s+, K2s+, Q2s+, J5s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s | A2o+, K8o+, Q9o+, J8o+, T8o+ |
| SB | 22+ | Same as BTN | A2o+, K7o+, Q8o+, J8o+, T8o+, 98o |

`s` means suited, `o` means offsuit. For nonpairs, `+` keeps the high card fixed
and improves the kicker (K9s+ = K9s, KTs, KJs, KQs). For pairs, 55+ = 55–AA.
An unopened raise targets 2.5 BB from UTG through BTN and 3 BB from SB, clipped
to legal stack limits. The BB has no raise-first-in opportunity: if everyone
folds, it wins the pot.

Computer opponents follow these raise-or-fold charts in unopened preflop pots,
including the SB. Their 12% random substitution of a call/check for a raise is
disabled in that situation, preventing accidental open-limps. The substitution
remains available against limpers, against raises and postflop.

Pots with limpers retain the previous, tighter isolation charts: UTG 8.9%, HJ
11.8%, CO 19.6%, BTN 29.4%, SB 26.7%. Isolation sizing remains 2.5 BB plus
1 BB per limper. BB isolation retains its existing chart. Advice, displayed
charts, computer entry decisions and public first-raise likelihoods use the
same unopened-versus-isolation distinction. Public history stores pot sizes in
half-BB chip units; a first raise with a pot above 3 units implies prior limping
under the trainer's no-ante rules.

The targets are practical teaching choices. Published charts vary with rake,
raise size, stack depth and opponents. See
[PokerStars' six-max opening lesson](https://www.pokerstars.com/poker/learn/lesson/opening-the-pot/)
and [Upswing's SB guide](https://upswingpoker.com/small-blind-poker-strategy-tips/),
which recommends a 40–50% SB raise-or-fold starting range and roughly 3 BB sizing.
The exact selections above are our simplified baseline, not a copied solver chart.
The trainer does not dynamically adjust these opening charts for short stacks,
opponent tendencies or rake; those conditions need separate strategy work.

Facing preflop
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

Raises model opponent folds, calls and one possible normal-sized or all-in
reraise. Each size has plans to fold or call against the reraise. Normal reraises
target three times the new bet, clipped to the legal minimum and opponent stack.
Reraises require betting to be reopened and a responder with chips remaining.
Generic response models split their aggression between normal reraises and
shoves; if the normal size already reaches all-in, only the shove branch remains.
The response model accounts for the price offered by small bets and a narrower
continuing range against overbets.
Above pot size, the size premium grows logarithmically. The strength threshold
is capped at 0.90 to avoid assuming strong bluff-catchers always fold, and the
random-call floor decreases with size. These coefficients are heuristic.

Each exact size and response plan is tested against the best passive option
under balanced, tight, loose, sticky, value-heavy and cautious models, plus a
heads-up bot-policy stress model. A recommended raise must improve on passive play in every model by more than max(0.25 BB, 2% of pot),
after subtracting two combined sampling standard errors. The coach selects the
qualifying size with the highest worst-case advantage. If none qualifies, it
prefers passive play and accepts reasonable alternatives. Large value bets and
profitable modeled bluffs remain available.

The value-heavy model triples the relative weight of holdings making trips or
better, testing sensitivity to slow plays and stronger made hands. It changes
range composition while retaining baseline response behavior. The multiplier
is a stress assumption, not an estimate of an opponent's actual frequencies.
It has no effect before the river. The cautious model uses the same 3× strong-hand
weighting and halves calls from hands worse than the player's hand, assigning
the removed call probability to folds. This tests thin-value assumptions; it is
not a claim that the opponent can see the player's cards.

The heads-up bot-policy stress model enumerates the distribution of the default
bot's 53 independent random-hand equity samples (including ties), applies its
calling-price-plus-4% and 70% value-raise thresholds, and retains its 12% random
raise-to-call substitution. It models legal normal reraises, not automatic shoves.
Only the hypothetical responding hand and public board enter the bot's equity
calculation; actual hidden cards and future cards are never consulted. This
response stress assumes the default 53-sample bot setting; other sample settings
and multiway bot equity distributions are not reproduced. Opponent holdings
still come from inferred public-action ranges, not calibrated bot frequencies.

Heads-up river holdings and responses are enumerated exactly. Multiway rivers
use sampled disjoint holdings and responses. The passive baseline lets pending
players call or fold but does not model fresh bets after a check. Raise branches
model at most one reraise, not an unbounded betting tree. These approximations
can bias values even when sampling error is zero.

## Feedback and evaluation

Decision reviews show one label and a short explanation: **Good**, **Close**,
**Mistake**, or **Big mistake**. Accepted actions are Good, or Close when the
existing close-decision logic allows reasonable alternatives (shown as “Both
reasonable”). Rejected actions are Mistake by default. The labels do not change
accuracy scoring or hinted-decision handling.

Big mistake requires exact heads-up river action values from all seven tested
models. In every model, the best value for the chosen action category must trail
that model's best action by more than max(2 BB, 20% of the current pot), after
subtracting two combined sampling standard errors. Accepted alternatives always
remain Good or Close. Raises use the best evaluated size and response plan for
that category, so the label does not grade a custom raise size. Preflop charts,
earlier streets and sampled multiway rivers cannot receive Big mistake. This is
a conservative model-based severity label, not a solver-certified loss estimate;
no numerical loss score is displayed. Older saved reviews receive the ordinary
Good/Close/Mistake presentation when they lack a label.

Close decisions accept alternatives within the largest of 0.25 BB, 2% of pot,
or two sampling standard errors of a model's best value. Accepted alternatives
appear as “Both reasonable.” Scoring checks action categories; every possible
custom raise size is not independently graded.

Reports include the model identifier, range summaries, action values, targets,
response plans and sensitivity results. Raise values expose
`worst_case_advantage_bb` for inspection.

`npm run eval:coach` evaluates 39 public observations in
`tests/fixtures/coach-decisions.json`. Cases cover weak bluff-catchers, thin
value, large sizing, strong-made-hand concentration, preflop uncertainty and
positive controls. Tests also cover side pots, short stacks, odd chips,
hidden-card isolation, exact session restoration and browser workers.

Review judgments are not solver-certified labels. Changes in recommended
actions, profits or automatic review-flag counts do not establish stronger
strategy. Use the [evaluation workflow](evaluations.md) and independent expert
or solver references before drawing strategic conclusions.
