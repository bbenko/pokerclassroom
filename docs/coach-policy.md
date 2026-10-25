# Coaching policy

The coach uses an explicit positional preflop policy and estimates opponent
ranges from public actions after the flop to compare legal choices. It is a training heuristic, not a poker solver or a GTO strategy.
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

### Responding to preflop raises

`positional-preflop-v1` replaces the old raw-equity raise gates. It is an original,
reference-informed teaching policy, **not imported solver data**. The exact ranges
in `PREFLOP_RESPONSES` are our simplified choices; the sources below support the
principles, not every hand-class boundary. No licensed charts are bundled and no
precise mixed frequencies or numerical preflop EVs are claimed.

The default profile matches the simulator: six seats, no rake, no ante. The graded
response baseline covers 75–150 BB effective, opens to 2–3.5 BB, three-bets to
6–15 BB and four-bets to 16–35 BB. Every live opponent must have at least 75 BB
effective with the actor. Five-bet-plus suggestions above 50 BB are provisional.
Limp-reraises, callers facing squeezes, cold five-bets, other seat counts and
out-of-band sizes/depths are also provisional. The coach labels them **Not graded**,
excludes them from accuracy and suppresses mistake sounds. Provisional suggestions
are conservative defaults, not evidence that other legal actions are mistakes.
Opening/isolation charts also become ungraded outside their stack/seat coverage.

Public action order identifies unopened pots, isolation, facing an open, squeezing,
defending an earlier open against a three-bet, cold-four-betting, and facing further
raises. Effective stacks include chips already committed. Sizing uses position
relative to all involved opponents, so a BB cold-four-bet over SB still recognizes
an original BTN raiser. Players yet to act remain part of the decision context;
they are **not** assumed to reach showdown to justify a preflop fold.

Facing one open, separate response rows cover early opens (UTG/HJ) against
nonblind positions, SB and BB; CO opens against BTN/SB/BB; BTN against SB/BB;
and SB against BB. UTG/HJ and some nonblind defender positions deliberately share
simplified rows. Each row specifies value raises, raise/call alternatives,
raise/fold candidates, calls and marginal call/folds. Earlier-listed categories
take precedence when notation overlaps. The preferred action is a teaching
default, not the result of drawing a random mixed strategy. All listed alternatives
receive the same accepted-action treatment; no frequencies are manufactured.

Examples:

- TT in BB versus early opens defaults to calling and accepts three-betting;
  versus CO/BTN/SB it defaults to three-betting and accepts calling.
- AKs facing an ordinary open and three-bet defaults to a cold four-bet.
- ATs on BTN versus CO defaults to three-betting and accepts calling.
- A9o in SB versus HJ folds. A9o after a BTN open facing a three-bet also folds;
  the old raw-equity call/fold label is intentionally retired.
- SB retains selected calls for this no-rake profile, including K9s versus BTN as
  an alternative to raising or folding. A universal raked-game SB rule would not
  match this simulator.
- Small pairs outside BB are position-dependent calls or marginal call/folds;
  their set potential is not a universal reason to continue.

Closing BB overcalls have a separate borderline suited-hand rule when there is
exactly one caller and the immediate calling requirement is at most 22.5%. It
accepts both calling and folding, with tighter selections against early opens
than CO or BTN opens. For example, Q6s facing BTN 2.5 BB plus an SB call is a
Close call/fold decision: 1.5 BB more into 6 BB, or 20% of the final 7.5 BB pot.
This does not claim that pot odds alone establish a profitable call. The authored
range allows suited playability and the closing-action discount while recognizing
poor multiway equity realization and non-nut-flush risk. Unsuitable offsuit hands,
more expensive calls and other defender positions do not inherit this exception.
See [GTO Wizard's overcalling discussion](https://blog.gtowizard.com/overcalling-from-the-bb/)
for the general tradeoff; its tournament examples are not an exact solved range
for our no-rake cash configuration. Regression cases cover adjacent suited hands,
offsuit controls, earlier openers, price boundaries, short stacks and saved advice.
The coach model is now `ranges-v5`; active advice from earlier versions is refreshed
on restore, preserving session histories and scores.

Heads-up BB defense also permits call/fold alternatives with 98o, 87o, 76o and
65o against BTN opens no larger than 2.5 BB, or SB opens no larger than 3 BB,
when calling closes the action. This fills an omitted offsuit-connector class;
it does not expand those hands into early-position or multiway calling ranges.
[Upswing's cash-game connector guide](https://upswingpoker.com/offsuit-connectors/)
explicitly permits mixed defenses in those spots even in its high-rake baseline.
We use an accepted call/fold set rather than importing exact frequencies or
claiming a solve for our no-rake game. The explanation distinguishes straight
potential from suited flush potential. Hand 71 (87o versus BTN 2.5 BB with SB
folding) is a permanent preflop evaluation, with neighboring hand classes, price
limits, earlier-open controls, and a separate test for its river decision.

Three-bets target 3.25× the open in position or 4× out of position, plus one open
size per caller when squeezing. Four-bets target 2.4× in position or 2.8× out of
position. Further value raises use the legal all-in. Targets round to half-BB
chips and respect minimums, maximums and reopening rules. These sizes are training
defaults; scoring still evaluates action categories, not every custom size.

Preflop policy decisions use no Monte Carlo samples and return `equity: null`.
The UI hides the equity metric rather than displaying guaranteed-showdown equity
as a justification for the policy. Reports include `policy`, public `context`,
`graded`, supported alternatives and coverage notes. Existing saved histories and
scores remain intact; active advice from earlier coach models is regenerated on restore.

References, used as strategic guidance rather than copied datasets:

- [Upswing: pocket tens](https://upswingpoker.com/pocket-tens-cash-games/)
- [Upswing: ace-king](https://upswingpoker.com/how-to-play-ace-king-big-slick/)
- [Upswing: small-blind preflop and the effect of rake](https://upswingpoker.com/podcast/ep16-small-blind-preflop/)
- [Upswing: small-pair calls and table conditions](https://upswingpoker.com/pocket-threes/)
- [GTO Wizard: equity realization](https://blog.gtowizard.com/equity-realization/)
- [GTO Wizard: game assumptions, positions and sizing](https://help.gtowizard.com/how-to-build-custom-solutions/)

### Postflop before the river

Before the river, range-weighted equity guides calls with a cushion for future
betting and multiway uncertainty. Raises require strong equity against the
narrower ranges likely to continue. Raw equity does not fully capture equity
realization or future betting. Extra samples reduce sampling error, not model
error.

### Checked-to flop overpairs

Hand 13 exposed two overly restrictive assumptions in the old value gate: it
reweighted every opponent toward near-top-percentile holdings regardless of the
small bet size, and required hero to do well when **all** opponents continued.
KK on 8c 3d 2h had roughly 75–77% range equity but only about 54% against that
joint continuing model, so a reasonable value bet was rejected outright.

The bounded replacement applies only to the last preflop raiser acting last on
the flop, after all live opponents check. It requires a private overpair, one or
two opponents, 75–150 BB effective, no side with too few chips to cover the tested
bet, and an unpaired rainbow flop whose three ranks do not fit inside one
five-rank straight window. It does not extend to turns, paired/two-tone/monotone
or connected flops, players still to act, or facing bets and raises. Existing
policies continue to handle those situations; exclusion is not a claim that
betting those boards is wrong.

For eligible spots, at least 640 joint range/runout samples test rounded one-third
and half-pot bets. Existing public call likelihoods supply bounded response weights
based only on the current board and initial offered price. The model enumerates
one-caller and two-caller subsets, conditioning on **at least one** call instead
of assuming everyone calls. Balanced, tight and loose call assumptions are tested,
plus a stress model with 3× weight on hypothetical holdings already making trips
or better. None of these are calibrated population frequencies.

A preferred value bet must exceed the existing 60% + 2.5% per extra opponent share
gate in every model after two sampling standard errors. If only some model means
clear the gate, checking stays preferred and betting is accepted as an alternative.
Checking is always accepted when the calibration recommends betting. A qualifying
one-third-pot size is preferred to half pot. Hand 13 recommends 4 BB into 12.5 BB;
the half-pot candidate also qualifies. Reviews still grade action categories, so
this does not certify every custom bet size or authorize an automatic stack-off.

`value_bet_evidence` reports candidate sizes, conditional showdown shares, sampling
errors, all-fold weights and the strongest lower-bound share across models. It
is **not EV**: future betting, check-raises, side-pot branches and sequential price
changes after another call are not modeled. All-fold weights are recorded for
inspection, not added to a claimed full-hand return. Greater sample counts reduce
sampling noise, not these structural uncertainties.

The regression suite includes the actual hand, AA/QQ/JJ variants, underpairs,
unpaired overcards, board-texture and position controls, short stacks, hidden-card
isolation, and exact hypothetical caller branches. The evaluator checks the new
cases under three seeds and returns a nonzero status on expectation failures.
Strategic guidance: [GTO Wizard on multiway selectivity and smaller bets](https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/).
This remains an authored heuristic calibration, not an imported solver solution.

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

Reports include a structured `explanation`: the public decision `situation`, the
reason for the preferred action (`why`), one explanation for each accepted
alternative, a `sizing` note for suggested raises, and a `coverage` note for
ungraded preflop situations. Reasons distinguish premium value aggression,
selective suited bluffs, offsuit domination, the BB discount, players yet to act,
callers in squeeze pots, and defending an earlier open. Unsupported advice names
the actual stack, size or sequence outside coverage. Before the river, call/fold
explanations compare estimated equity with the immediate price while noting the
future-betting cushion. Postflop explanations use only the current board and the
acting player's best hand; they do not infer actual hidden cards or future cards.

Explanations decorate an already selected decision and consume no random numbers.
They do not change action recommendations, alternatives, sizing or accuracy.
The review UI displays each accepted alternative separately. Existing saved active
advice gains an explanation on restore without resampling; older completed reviews
retain their original text. No mixed-action percentages or solver EV claims are
introduced by the explanatory text.


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

`npm run eval:coach` evaluates 52 public observations in
`tests/fixtures/coach-decisions.json` and 74 preflop behavior specifications in
`tests/fixtures/preflop-decisions.json`, each under three seeds. Preflop failures and new postflop expectation failures
produce a nonzero exit status. `npm run eval:preflop` runs that suite alone. Cases cover weak bluff-catchers, thin
value, large sizing, strong-made-hand concentration, preflop uncertainty and
positive controls. Tests also cover side pots, short stacks, odd chips,
hidden-card isolation, exact session restoration and browser workers.

Review judgments are not solver-certified labels. Changes in recommended
actions, profits or automatic review-flag counts do not establish stronger
strategy. Use the [evaluation workflow](evaluations.md) and independent expert
or solver references before drawing strategic conclusions.
