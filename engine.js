/* Poker Classroom: dependency-free Hold'em engine, also usable from Node for tests. */
(function (root) {
'use strict';
const RANKS = '23456789TJQKA', SUITS = 'cdhs';
const DECK = [...RANKS].flatMap(rank => [...SUITS].map(suit => rank + suit));
const NAMES = ['You', 'Mara', 'Jules', 'Dev', 'Noah', 'Iris'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
const bb = n => n / 2;
const sum = values => values.reduce((a, b) => a + b, 0);
const round1 = n => roundEven(n * 10) / 10;
const roundEven = n => n % 1 === 0.5 ? (Math.floor(n) % 2 ? Math.ceil(n) : Math.floor(n)) : Math.round(n);
const capitalize = s => s[0].toUpperCase() + s.slice(1);
const assert = (condition, message = 'Invalid game state.') => { if (!condition) throw Error(message); };
function chips(value) {
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!(n > 0 && n <= 1000000 && Number.isInteger(n * 2))) throw Error('Use a positive size in increments of 0.5 BB.');
  return n * 2;
}
class Random {
  constructor(seed) {
    if (seed === undefined) seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 4294967296);
    this.value = seed >>> 0;
  }
  random() {
    // Mulberry32; keep the state serializable so reloading continues the same deck.
    this.value = (this.value + 0x6D2B79F5) >>> 0;
    let x = this.value;
    x = Math.imul(x ^ x >>> 15, x | 1);
    x ^= x + Math.imul(x ^ x >>> 7, x | 61);
    return ((x ^ x >>> 14) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.random() * n); }
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) { const j = this.int(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }
  sample(items, count) {
    const copy = items.slice();
    for (let i = 0; i < count; i++) { const j = i + this.int(copy.length - i); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, count);
  }
}
function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const delta = (a[i] || 0) - (b[i] || 0); if (delta) return Math.sign(delta); }
  return 0;
}
function validateCards(cards) {
  if (new Set(cards).size !== cards.length || cards.some(c => !DECK.includes(c))) throw Error('Cards must be valid and distinct.');
}
function straightHigh(values) {
  const present = new Set(values);
  if (present.has(14)) present.add(1);
  for (let high = 14; high >= 5; high--) if ([0, 1, 2, 3, 4].every(offset => present.has(high - offset))) return high;
  return 0;
}
function rankCards(cards) {
  const counts = Array(15).fill(0), suits = {c: [], d: [], h: [], s: []};
  for (const c of cards) { const value = RANKS.indexOf(c[0]) + 2; counts[value]++; suits[c[1]].push(value); }
  const values = [], pairs = [], trips = [], quads = [];
  for (let value = 14; value >= 2; value--) {
    if (counts[value]) values.push(value);
    if (counts[value] >= 2) pairs.push(value);
    if (counts[value] >= 3) trips.push(value);
    if (counts[value] === 4) quads.push(value);
  }
  const flush = Object.values(suits).find(values => values.length >= 5);
  if (flush) { const high = straightHigh(flush); if (high) return [8, high]; }
  if (quads.length) return [7, quads[0], values.find(value => value !== quads[0])];
  if (trips.length && pairs.some(value => value !== trips[0])) return [6, trips[0], pairs.find(value => value !== trips[0])];
  if (flush) return [5, ...flush.sort((a, b) => b - a).slice(0, 5)];
  const straight = straightHigh(values);
  if (straight) return [4, straight];
  if (trips.length) return [3, trips[0], ...values.filter(value => value !== trips[0]).slice(0, 2)];
  if (pairs.length >= 2) return [2, ...pairs.slice(0, 2), values.find(value => !pairs.slice(0, 2).includes(value))];
  if (pairs.length) return [1, pairs[0], ...values.filter(value => value !== pairs[0]).slice(0, 3)];
  return [0, ...values.slice(0, 5)];
}
function evaluate(cards) {
  if (cards.length < 5 || cards.length > 7) throw Error('Evaluate five to seven distinct cards.');
  validateCards(cards);
  return rankCards(cards);
}
function best_five(cards) {
  evaluate(cards);
  let best=null,score=null;
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)
    for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)
      for(let e=d+1;e<cards.length;e++){
        const five=[cards[a],cards[b],cards[c],cards[d],cards[e]],rank=rankCards(five);
        if(!score||compare(rank,score)>0){best=five;score=rank}
      }
  return best;
}
function hand_name(cards) {
  const result = evaluate(cards);
  if (compare(result, [8, 14]) === 0) return 'Royal flush';
  return [0, 4, 5, 8].includes(result[0]) ? `${CATEGORIES[result[0]]} (${RANKS[result[1] - 2]} high)` : CATEGORIES[result[0]];
}
const money = bb => `$${bb.toFixed(2)}`;

// Synthetic stakes: one BB = $1; engine chip units are half a BB.
function format_history(hand, number, timestamp = '2026/10/23 00:00:00 ET', allowIncomplete = false) {
  assert(hand.done || allowIncomplete, 'Only completed hands can be exported');
  const lines = [
    `Poker Classroom Hand #${number}: Hold'em No Limit ($0.50/$1.00 USD) - ${timestamp}`,
    `Table 'Poker Classroom Simulation' ${hand.n}-max Seat #${hand.button + 1} is the button`,
    ...hand.starting_stacks.map((s, i) => `Seat ${i + 1}: ${NAMES[i]} (${money(s / 2)} in chips)`),
    `${NAMES[hand.sb]}: posts small blind ${money(Math.min(1, hand.starting_stacks[hand.sb]) / 2)}`,
    `${NAMES[hand.bb_seat]}: posts big blind ${money(Math.min(2, hand.starting_stacks[hand.bb_seat]) / 2)}`,
    '*** HOLE CARDS ***', `Dealt to You [${hand.holes[0].join(' ')}]`
  ];
  let current = 1;
  for (const entry of hand.log.slice(1)) {
    let m;
    if ((m = entry.match(/^(Flop|Turn|River): (.+)$/))) {
      const cards = m[2].split(' ');
      lines.push(m[1] === 'Flop' ? `*** FLOP *** [${m[2]}]` : `*** ${m[1].toUpperCase()} *** [${cards.slice(0, -1).join(' ')}] [${cards.at(-1)}]`);
      current = 0;
    } else if ((m = entry.match(/^Uncalled ([\d.]+) BB returned to (\w+)\.$/))) {
      lines.push(`Uncalled bet (${money(+m[1])}) returned to ${m[2]}`);
    } else if ((m = entry.match(/^(\w+) (fold|check)\.$/))) {
      lines.push(`${m[1]}: ${m[2]}s`);
    } else if ((m = entry.match(/^(\w+) (call|bet|raise to) ([\d.]+) BB( \(all-in\))?\.$/))) {
      const [, name, action, amount, allin] = m, value = +amount;
      const text = action === 'raise to' ? `raises ${money(value - current)} to ${money(value)}` : `${action}s ${money(value)}`;
      lines.push(`${name}: ${text}${allin ? ' and is all-in' : ''}`);
      if (action !== 'call') current = value;
    } else if (!/^(Main pot|Side pot)/.test(entry)) {
      throw Error(`Unrecognized history entry: ${entry}`);
    }
  }
  if (!hand.done) return lines.join('\n') + '\n';
  if (hand.showdown) {
    lines.push('*** SHOW DOWN ***');
    for (const i of hand.live) lines.push(`${NAMES[i]}: shows [${hand.holes[i].join(' ')}] (${hand_name([...hand.holes[i], ...hand.board])})`);
  }
  hand.awards.forEach((award, index) => {
    const pot = hand.awards.length === 1 ? 'pot' : index === 0 ? 'main pot' : `side pot-${index}`;
    for (const [i, amount] of Object.entries(award.payouts)) lines.push(`${NAMES[i]} collected ${money(amount)} from ${pot}`);
  });
  lines.push('*** SUMMARY ***', `Total pot ${money(hand.settled_pot / 2)} | Rake $0.00`);
  if (hand.board.length) lines.push(`Board [${hand.board.join(' ')}]`);
  hand.players.forEach((p, i) => {
    const role = i === hand.button ? ' (button)' : i === hand.sb ? ' (small blind)' : i === hand.bb_seat ? ' (big blind)' : '';
    const won = hand.awards.reduce((n, a) => n + (a.payouts[i] || 0), 0);
    const result = p.folded ? 'folded' : hand.showdown ? `showed [${hand.holes[i].join(' ')}] and ${won ? `won (${money(won)})` : 'lost'}` : `collected (${money(won)})`;
    lines.push(`Seat ${i + 1}: ${NAMES[i]}${role} ${result}`);
  });
  return lines.join('\n') + '\n';
}

function equity(hole, board, samples, rng, opponents = 1) {
  if (hole.length !== 2 || ![0, 3, 4, 5].includes(board.length)) throw Error("Supply two hole cards and a valid Hold'em board.");
  validateCards([...hole, ...board]);
  if (!Number.isInteger(samples) || samples < 1 || !Number.isInteger(opponents) || opponents < 1 || opponents > 5) throw Error('Use positive samples and one to five opponents.');
  const remaining = DECK.filter(c => !hole.includes(c) && !board.includes(c));
  let score = 0;
  for (let trial = 0; trial < samples; trial++) {
    const draw = rng.sample(remaining, 2 * opponents + 5 - board.length);
    const runout = [...board, ...draw.slice(2 * opponents)], own = rankCards([...hole, ...runout]);
    let ties = 1, beaten = false;
    for (let i = 0; i < opponents; i++) {
      const result = compare(rankCards([...draw.slice(2 * i, 2 * i + 2), ...runout]), own);
      if (result > 0) { beaten = true; break; }
      if (result === 0) ties++;
    }
    if (!beaten) score += 1 / ties;
  }
  return score / samples;
}
class Hand {
  constructor(rng = new Random(), button = 0, stacks = Array(6).fill(200)) {
    if (stacks.length < 2 || stacks.length > 6 || !Number.isInteger(button) || button < 0 || button >= stacks.length) throw Error('Use two to six seats and a valid button.');
    if (stacks.some(s => !Number.isInteger(s) || s < 1)) throw Error('Each seat needs a positive integer stack.');
    this.players = stacks.map(stack => ({stack, street_bet: 0, contributed: 0, folded: false, last_action: ''}));
    this.starting_stacks = stacks.slice(); this.initial_total = sum(stacks); this.n = stacks.length; this.button = button;
    this.sb = this.n === 2 ? button : (button + 1) % this.n; this.bb_seat = (this.sb + 1) % this.n;
    this.deck = rng.shuffle(DECK.slice()); this.holes = stacks.map(() => []);
    for (let round = 0; round < 2; round++) for (let offset = 1; offset <= this.n; offset++) this.holes[(button + offset) % this.n].push(this.deck.pop());
    this.board = []; this.burned = []; this.street = 0; this.current_bet = 2; this.last_full_raise = 2;
    this.acted_at = stacks.map(() => null); this.done = false; this.showdown = false; this.winners = []; this.awards = [];
    this.settled_pot = 0; this.result = ''; this.log = []; this.history = [];
    this._pay(this.sb, Math.min(1, this.players[this.sb].stack)); this._pay(this.bb_seat, Math.min(2, this.players[this.bb_seat].stack));
    this.players[this.sb].last_action = 'Small blind'; this.players[this.bb_seat].last_action = 'Big blind';
    this.log.push(`${NAMES[this.sb]} post SB ${bb(this.players[this.sb].street_bet)}; ${NAMES[this.bb_seat]} post BB ${bb(this.players[this.bb_seat].street_bet)}.`);
    this.pending = new Set(this.players.flatMap((p, i) => p.stack > 0 ? [i] : []));
    this.actor = this.bb_seat; this._progress(this.bb_seat);
  }
  get pot() { return this.done ? 0 : sum(this.players.map(p => p.contributed)); }
  get live() { return this.players.flatMap((p, i) => p.folded ? [] : [i]); }
  position(who) {
    if (this.n === 2) return who === this.button ? 'BTN / SB' : 'BB';
    const labels = ['BTN', 'SB', 'BB', ...({3: [], 4: ['CO'], 5: ['HJ', 'CO'], 6: ['UTG', 'HJ', 'CO']}[this.n])];
    return labels[(who - this.button + this.n) % this.n];
  }
  _next(after, candidates) {
    for (let offset = 1; offset <= this.n; offset++) { const seat = (after + offset) % this.n; if (candidates.has(seat)) return seat; }
    throw Error('No eligible next actor.');
  }
  _pay(who, amount) {
    const p = this.players[who];
    if (!Number.isInteger(amount) || amount < 0 || amount > p.stack) throw Error('Invalid chip contribution.');
    p.stack -= amount; p.street_bet += amount; p.contributed += amount;
  }
  legal() {
    if (this.done) return {};
    const own = this.players[this.actor], call = Math.min(Math.max(0, this.current_bet - own.street_bet), own.stack);
    const maximum = own.street_bet + own.stack, already = this.acted_at[this.actor];
    const reopened = already === null || this.current_bet - already >= this.last_full_raise;
    const responder = this.players.some((p, i) => i !== this.actor && !p.folded && p.stack > 0 && p.street_bet + p.stack > this.current_bet);
    const can_raise = maximum > this.current_bet && reopened && responder;
    const minimum = this.current_bet ? this.current_bet + this.last_full_raise : 2;
    return {check: call === 0, fold: call > 0, call: bb(call), raise: can_raise,
      min_to: can_raise ? bb(Math.min(minimum, maximum)) : null, max_to: can_raise ? bb(maximum) : null,
      raise_is_all_in_only: can_raise && maximum < minimum, current_bet: bb(this.current_bet), reopened};
  }
  action(kind, target = null) {
    if (this.done) throw Error('This hand has finished. Deal another hand.');
    if (typeof kind !== 'string') throw Error('Choose fold, check, call, raise, or allin.');
    const who = this.actor, own = this.players[who], legal = this.legal();
    const event = {actor: who, street: this.street, board: this.board.slice(), position: this.position(who),
      pot: this.pot, bet: this.current_bet, to_call: legal.call * 2, stack: own.stack, street_bet: own.street_bet,
      raises: this.history.filter(e => e.street === this.street && e.kind === 'raise').length};
    const contributed_before = own.contributed;
    if (kind === 'allin' && !legal.raise && legal.call > 0) kind = 'call';
    if (kind === 'fold') {
      if (!legal.fold) throw Error('You can check for free here.');
      own.folded = true; own.last_action = 'Fold'; this.log.push(`${NAMES[who]} fold.`);
    } else if (kind === 'check') {
      if (!legal.check) throw Error('There is a bet to call.');
      own.last_action = 'Check'; this.log.push(`${NAMES[who]} check.`);
    } else if (kind === 'call') {
      if (legal.check) throw Error('There is no bet to call. Choose check.');
      const amount = Math.min(this.current_bet - own.street_bet, own.stack); this._pay(who, amount);
      own.last_action = own.stack === 0 ? 'All-in call' : `Call ${bb(amount)}`;
      this.log.push(`${NAMES[who]} call ${bb(amount)} BB${own.stack === 0 ? ' (all-in)' : ''}.`);
    } else if (kind === 'raise' || kind === 'allin') {
      if (!legal.raise) throw Error('Raising is not available; a short all-in may not have reopened it.');
      const maximum = own.street_bet + own.stack;
      if (kind === 'allin') target = maximum;
      const minimum = this.current_bet ? this.current_bet + this.last_full_raise : 2;
      if (!Number.isInteger(target) || target <= this.current_bet || target > maximum) throw Error(`Raise to a total between ${legal.min_to} and ${legal.max_to} BB.`);
      if (target < minimum && target !== maximum) throw Error(`Minimum raise-to is ${bb(minimum)} BB, or your all-in.`);
      const increase = target - this.current_bet, verb = this.current_bet === 0 ? 'Bet' : 'Raise to';
      this._pay(who, target - own.street_bet);
      if (increase >= this.last_full_raise) this.last_full_raise = increase;
      this.current_bet = target;
      this.players.forEach((p, i) => { if (i !== who && !p.folded && p.stack > 0 && p.street_bet < target) this.pending.add(i); });
      own.last_action = own.stack === 0 ? 'All-in' : `${verb} ${bb(target)}`;
      this.log.push(`${NAMES[who]} ${verb.toLowerCase()} ${bb(target)} BB${own.stack === 0 ? ' (all-in)' : ''}.`);
    } else throw Error('Choose fold, check, call, raise, or allin.');
    event.kind = kind === 'allin' ? 'raise' : kind;
    event.amount = own.contributed - contributed_before;
    event.target = event.kind === 'raise' ? own.street_bet : null;
    const matchable = Math.max(0, ...this.players.filter((p, i) => i !== who && !p.folded).map(p => p.street_bet + p.stack));
    event.effective_amount = Math.min(event.amount, Math.max(0, matchable - event.street_bet));
    this.history.push(event);
    this.acted_at[who] = this.current_bet; this.pending.delete(who); this._progress(who); this.assert_invariants();
  }
  _return_uncalled() {
    const ordered = this.players.map((_, i) => i).sort((a, b) => this.players[b].street_bet - this.players[a].street_bet);
    const high = ordered[0], own = this.players[high], amount = own.street_bet - this.players[ordered[1]].street_bet;
    if (amount > 0) { own.stack += amount; own.street_bet -= amount; own.contributed -= amount; this.log.push(`Uncalled ${bb(amount)} BB returned to ${NAMES[high]}.`); }
  }
  _progress(after) {
    if (this.live.length === 1) { this._return_uncalled(); this._settle(false); return; }
    this.pending = new Set([...this.pending].filter(i => !this.players[i].folded && this.players[i].stack > 0));
    const able = this.live.filter(i => this.players[i].stack > 0);
    if (able.length <= 1 && (!able.length || this.players[able[0]].street_bet >= this.current_bet)) this.pending.clear();
    if (this.pending.size) { this.actor = this._next(after, this.pending); return; }
    this._return_uncalled();
    if (this.street === 3) { this._settle(true); return; }
    this._deal_street();
    const next = new Set(this.live.filter(i => this.players[i].stack > 0));
    if (next.size < 2) { while (this.street < 3) this._deal_street(); this._settle(true); }
    else { this.pending = next; this.actor = this._next(this.button, this.pending); }
  }
  _deal_street() {
    this.street++; this.burned.push(this.deck.pop());
    for (let i = 0; i < (this.street === 1 ? 3 : 1); i++) this.board.push(this.deck.pop());
    for (const p of this.players) { p.street_bet = 0; if (!p.folded && p.stack) p.last_action = ''; }
    this.current_bet = 0; this.last_full_raise = 2; this.acted_at = this.players.map(() => null); this.pending.clear();
    this.log.push(`${STREETS[this.street]}: ${this.board.join(' ')}`);
  }
  pot_layers() {
    const layers = []; let previous = 0;
    for (const level of [...new Set(this.players.map(p => p.contributed).filter(n => n > 0))].sort((a, b) => a - b)) {
      const contributors = this.players.flatMap((p, i) => p.contributed >= level ? [i] : []);
      const amount = (level - previous) * contributors.length, eligible = contributors.filter(i => !this.players[i].folded);
      if (layers.length && JSON.stringify(layers.at(-1).eligible) === JSON.stringify(eligible)) layers.at(-1).amount += amount;
      else layers.push({amount, eligible});
      previous = level;
    }
    return layers;
  }
  _settle(showdown) {
    this.showdown = showdown; this.settled_pot = this.pot;
    const scores = Object.fromEntries(showdown ? this.live.map(i => [i, evaluate([...this.holes[i], ...this.board])]) : []);
    const order = Array.from({length: this.n}, (_, i) => (this.button + i + 1) % this.n);
    const layers = showdown ? this.pot_layers() : [{amount: this.settled_pot, eligible: this.live}];
    layers.forEach((layer, index) => {
      const eligible = layer.eligible; assert(eligible.length, 'A pot has no eligible player.');
      const best = showdown ? eligible.map(i => scores[i]).reduce((a, b) => compare(a, b) >= 0 ? a : b) : null;
      const winners = eligible.filter(i => !showdown || compare(scores[i], best) === 0);
      const share = Math.floor(layer.amount / winners.length); let odd = layer.amount % winners.length;
      const paid = Object.fromEntries(winners.map(i => [i, share]));
      for (const i of order) if (winners.includes(i) && odd) { paid[i]++; odd--; }
      for (const [i, amount] of Object.entries(paid)) this.players[i].stack += amount;
      const label = index === 0 ? 'Main pot' : `Side pot ${index}`;
      this.awards.push({label, amount: bb(layer.amount), winners, eligible, payouts: Object.fromEntries(Object.entries(paid).map(([i, amount]) => [i, bb(amount)]))});
      this.log.push(`${label} ${bb(layer.amount)} BB → ${winners.map(i => NAMES[i]).join(', ')}.`);
    });
    this.winners = [...new Set(this.awards.flatMap(a => a.winners))].sort((a, b) => a - b);
    const main = this.awards[0].winners;
    this.result = main.length > 1 ? 'Split main pot' : `${NAMES[main[0]]} win${main[0] ? 's' : ''} the main pot`;
    if (this.awards.length > 1) this.result += ` · ${this.awards.length - 1} side pot${this.awards.length > 2 ? 's' : ''} settled`;
    this.done = true; this.pending.clear(); this.assert_invariants();
  }
  assert_invariants() {
    assert(sum(this.players.map(p => p.stack)) + this.pot === this.initial_total, 'Chip conservation failed.');
    assert(this.players.every(p => Number.isInteger(p.stack) && p.stack >= 0 && Number.isInteger(p.contributed) && p.street_bet >= 0 && p.street_bet <= p.contributed));
    const cards = [...this.holes.flat(), ...this.board, ...this.burned, ...this.deck];
    assert(cards.length === 52 && new Set(cards).size === 52 && cards.every(c => DECK.includes(c)), 'Deck conservation failed.');
    if (!this.done) assert(this.pending.has(this.actor) && this.players[this.actor].stack > 0 && !this.players[this.actor].folded);
  }
}
// Deterministic six-max, ~100 BB raise-first-in baselines. See docs/coach-policy.md.
const OPENING_CHARTS = {
  UTG: {pair: 5, suited: {14: 2, 13: 9, 12: 9, 11: 9, 10: 9, 9: 8}, offsuit: {14: 10, 13: 11, 12: 11}},
  HJ: {pair: 4, suited: {14: 2, 13: 8, 12: 8, 11: 8, 10: 8, 9: 8, 8: 7, 7: 6}, offsuit: {14: 10, 13: 10, 12: 10, 11: 10}},
  CO: {pair: 2, suited: {14: 2, 13: 5, 12: 6, 11: 7, 10: 8, 9: 7, 8: 6, 7: 6, 6: 5, 5: 4}, offsuit: {14: 8, 13: 9, 12: 10, 11: 9}},
  BTN: {pair: 2, suited: {14: 2, 13: 2, 12: 2, 11: 5, 10: 6, 9: 6, 8: 5, 7: 5, 6: 4, 5: 4}, offsuit: {14: 2, 13: 8, 12: 9, 11: 8, 10: 8}},
  SB: {pair: 2, suited: {14: 2, 13: 2, 12: 2, 11: 5, 10: 6, 9: 6, 8: 5, 7: 5, 6: 4, 5: 4}, offsuit: {14: 2, 13: 7, 12: 8, 11: 8, 10: 8, 9: 8}}
};
function opening_hand(hole, position, isolation = false) {
  const [high, low] = hole.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a), suited = hole[0][1] === hole[1][1];
  const chart = !isolation && OPENING_CHARTS[position];
  if (chart) return high === low ? high >= chart.pair : low >= ((suited ? chart.suited : chart.offsuit)[high] ?? Infinity);
  // Keep the existing, tighter isolation charts when someone has limped.
  if (high === low) return high >= ({UTG: 6, HJ: 5, CO: 3, BTN: 2, SB: 4, BB: 10}[position] ?? 5);
  if (position === 'UTG') return (suited && ((high === 14 && low >= 10) || (high === 13 && low >= 11) || (high === 12 && low === 11))) || (high === 14 && low >= 12) || (high === 13 && low === 12);
  if (position === 'HJ') return (suited && ((high === 14 && low >= 8) || (high === 13 && low >= 10) || (high === 12 && low >= 10) || (high === 11 && low === 10))) || (high === 14 && low >= 11) || (high === 13 && low === 12);
  if (position === 'CO') return (suited && (high === 14 || (high === 13 && low >= 8) || (high === 12 && low >= 9) || (high === 11 && low >= 9) || (high - low === 1 && high >= 7))) || (high === 14 && low >= 10) || (high === 13 && low >= 11) || (high === 12 && low === 11);
  if (['BTN', 'SB'].includes(position)) return (suited && (high === 14 || (high === 13 && low >= 5) || (high === 12 && low >= 8) || (high === 11 && low >= 8) || (high >= 7 && high - low <= 2) || (high === 6 && low === 5))) || (high === 14 && low >= (position === 'BTN' ? 7 : 9)) || (high === 13 && low >= 9) || (high === 12 && low >= 10) || (high === 11 && low === 10);
  return high === 14 && low >= 12;
}
function hand_class(hole) {
  if (hole.length !== 2) throw Error('Supply two distinct valid hole cards.');
  validateCards(hole);
  const [high, low] = hole.map(c => c[0]).sort((a, b) => RANKS.indexOf(b) - RANKS.indexOf(a));
  return high === low ? high + low : high + low + (hole[0][1] === hole[1][1] ? 's' : 'o');
}
function opening_range(position, isolation = false) {
  if (!['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].includes(position)) throw Error('Choose a six-seat position.');
  const ranks = [...RANKS].reverse().join(''), cells = [];
  [...ranks].forEach((first, row) => [...ranks].forEach((second, column) => {
    const hole = [first + 'c', second + (row < column ? 'c' : 'd')];
    cells.push({hand: hand_class(hole), raise: opening_hand(hole, position, isolation), combos: row === column ? 6 : row < column ? 4 : 12});
  }));
  const raise_combos = sum(cells.filter(c => c.raise).map(c => c.combos));
  return {position, title: `${position} ${position === 'BB' || isolation ? 'isolation' : 'opening'} range`, ranks, cells, raise_combos, raise_percent: round1(100 * raise_combos / 1326)};
}
function preflop_limpers(hand, who) {
  return hand.players.filter((p, i) => i !== who && i !== hand.bb_seat && !p.folded && p.street_bet >= 2).length;
}
function entry_size(hand, who) {
  const limpers = preflop_limpers(hand, who);
  return !limpers && hand.position(who) === 'SB' ? 6 : 5 + 2 * limpers;
}
function opponent_advice(hand, who, samples, rng) {
  if (hand.actor !== who || hand.done) throw Error('Advice requires an active decision for this player.');
  const legal = hand.legal(), opponents = hand.live.length - 1;
  const eq = equity(hand.holes[who], hand.board, samples, rng, opponents), call = legal.call * 2;
  const cap = hand.players[who].contributed + call, contestable_after = sum(hand.players.map(p => Math.min(p.contributed, cap))) + call;
  const odds = call && contestable_after ? call / contestable_after : 0, facing = call > 0, position = hand.position(who);
  let action, accepted, reason;
  if (hand.street === 0 && hand.current_bet <= 2) {
    if (legal.raise && opening_hand(hand.holes[who], position, preflop_limpers(hand, who) > 0)) {
      action = 'raise'; accepted = ['raise']; reason = `This hand qualifies for the trainer's ${position} opening or isolation range. Use position to enter with a raise.`;
    } else if (legal.check) {
      action = 'check'; accepted = ['check']; reason = 'Keep the free big-blind option with a hand outside the isolation range.';
    } else {
      action = 'fold'; accepted = ['fold']; reason = `This hand falls outside the trainer's ${position} entry range. Save the chips for a stronger opening hand.`;
      if (position === 'SB' && eq >= odds + 0.06) accepted.push('call');
    }
  } else if (facing) {
    const cushion = 0.04 + 0.01 * (opponents - 1), threshold = Math.max(0.42, 1 / (opponents + 1) + 0.20);
    if (eq < odds + cushion) {
      action = 'fold'; accepted = ['fold']; reason = 'The estimated multiway showdown share gives too little cushion above the calling price. Prefer folding.';
      if (eq >= odds - 0.025) accepted.push('call');
    } else if (legal.raise && eq >= threshold) {
      action = 'raise'; accepted = ['raise']; reason = 'The estimated showdown share clears the multiway value-raise threshold. A raise is a reasonable training default.';
      if (eq < threshold + 0.08) accepted.push('call');
    } else {
      action = 'call'; accepted = ['call']; reason = 'The estimate clears the calling price with a cushion. Call rather than build a larger pot.';
    }
  } else {
    const threshold = Math.max(0.36, 1 / (opponents + 1) + 0.13);
    if (legal.raise && eq >= threshold) {
      action = 'raise'; accepted = ['raise']; reason = "The estimated showdown share clears the trainer's multiway value-betting threshold.";
      if (eq < threshold + 0.05) accepted.push('check');
    } else {
      action = 'check'; accepted = ['check']; reason = 'Take the free card or showdown; the estimate does not clear the multiway value-betting threshold.';
      if (legal.raise && eq >= threshold - 0.04) accepted.push('raise');
    }
  }
  let target = null;
  if (legal.raise) {
    let wanted;
    if (hand.street === 0 && hand.current_bet <= 2) {
      wanted = entry_size(hand, who);
    } else if (facing) wanted = 3 * hand.current_bet;
    else wanted = Math.max(2, roundEven(hand.pot * 0.5));
    target = Math.max(legal.min_to * 2, Math.min(wanted, legal.max_to * 2));
  }
  return {action, accepted: accepted.sort(), target: target ? bb(target) : null,
    display: action === 'raise' ? `${hand.current_bet === 0 ? 'Bet' : 'Raise'} to ${bb(target)} BB` : capitalize(action),
    equity: round1(eq * 100), pot_odds: round1(odds * 100), reason, samples, opponents, position,
    basis: 'Monte Carlo share against all remaining random hands; positional and equity heuristics, not GTO.',
    range: hand.street === 0 && hand.current_bet <= 2 && legal.raise && hand.n === 6 ? {...opening_range(position, preflop_limpers(hand, who) > 0), current_hand: hand_class(hand.holes[who])} : null};
}
// Likelihoods are explicit training assumptions, not solved ranges.
const COACH_VERSION = 'ranges-v1';
const sigmoid = (value, slope = 24) => 1 / (1 + Math.exp(-value * slope));
const COMBOS = DECK.flatMap((a, i) => DECK.slice(i + 1).map(b => [a, b]));
const metric_cache = new Map();
function rank_code(cards) {
  const score = rankCards(cards);
  return Array.from({length: 6}, (_, i) => score[i] || 0).reduce((n, v) => n * 15 + v, 0);
}
function preflop_strength(hole) {
  const [a, b] = hole.map(c => RANKS.indexOf(c[0]) + 2).sort((a, b) => b - a);
  if (a === b) return Math.min(0.995, 0.55 + a * 0.032);
  const broadway = a === 14 && b >= 10 ? 0.12 : a === 13 && b >= 11 ? 0.07 : a === 12 && b === 11 ? 0.05 : 0;
  return Math.min(0.98, (a - 2) / 24 + (b - 2) / 40 + broadway + (hole[0][1] === hole[1][1] ? 0.07 : 0) + (a - b === 1 ? 0.025 : 0));
}
function draw_strength(hole, board) {
  if (board.length >= 5) return 0;
  const cards = hole.concat(board), ranks = new Set(cards.map(c => RANKS.indexOf(c[0]) + 2));
  if (ranks.has(14)) ranks.add(1);
  let draw = SUITS.split('').some(s => hole.some(c => c[1] === s) && cards.filter(c => c[1] === s).length === 4) ? 1 : 0;
  for (let start = 1; start <= 10; start++) {
    const run = Array.from({length: 5}, (_, i) => start + i);
    if (run.filter(v => ranks.has(v)).length === 4 && hole.some(c => run.includes(RANKS.indexOf(c[0]) + 2))) draw = Math.max(draw, 0.65);
  }
  return draw;
}
function board_metrics(hole, board) {
  const key = hole.slice().sort().join('') + ':' + board.join('');
  if (metric_cache.has(key)) return metric_cache.get(key);
  const known = new Set(hole.concat(board));
  const items = COMBOS.filter(pair => pair.every(c => !known.has(c))).map(pair => ({pair, code: rank_code(pair.concat(board))}));
  items.sort((a, b) => a.code - b.code);
  const strengths = new Map();
  for (let i = 0; i < items.length;) {
    let end = i + 1;
    while (end < items.length && items[end].code === items[i].code) end++;
    const percentile = (i + (end - i) / 2) / items.length;
    for (let j = i; j < end; j++) strengths.set(items[j].pair.join(''), percentile);
    i = end;
  }
  const result = {strengths, items};
  if (metric_cache.size >= 32) metric_cache.delete(metric_cache.keys().next().value);
  metric_cache.set(key, result);
  return result;
}
function action_likelihood(pair, event, known_hole, model = 'balanced') {
  const shift = model === 'tight' ? 0.04 : model === 'loose' ? -0.04 : 0;
  if (event.street === 0) {
    const strength = preflop_strength(pair), facing = event.to_call > 0;
    if (event.kind === 'check') return 0.9;
    if (event.kind === 'raise' && event.raises === 0) return opening_hand(pair, event.position, event.pot > 3) ? 0.85 : 0.025;
    if (event.kind === 'raise') {
      const threshold = 0.81 + Math.min(0.13, Math.max(0, event.raises - 1) * 0.065) + shift;
      const suited_ace = pair[0][1] === pair[1][1] && pair.some(c => c[0] === 'A');
      return 0.80 * sigmoid(strength - threshold, 34) + (suited_ace ? 0.035 : 0.008);
    }
    if (event.kind === 'call') {
      const threshold = (event.raises >= 3 ? 0.90 : event.raises === 2 ? 0.78 : facing ? (event.position.includes('BB') ? 0.52 : 0.64) : 0.55) + shift;
      return 0.015 + 0.85 * sigmoid(strength - threshold, 28);
    }
    return 1;
  }
  const strength = board_metrics(known_hole, event.board).strengths.get(pair.slice().sort((a, b) => DECK.indexOf(a) - DECK.indexOf(b)).join(''));
  if (strength === undefined) return 0;
  const draw = draw_strength(pair, event.board);
  if (event.kind === 'check') return 0.90 - 0.55 * sigmoid(strength - 0.82);
  const size = (event.effective_amount ?? event.amount) / Math.max(2, event.pot);
  const size_shift = Math.min(0.06, Math.log2(1 + size) * 0.025);
  if (event.kind === 'call') {
    const threshold = 0.43 + event.street * 0.035 + Math.max(0, event.raises - 1) * 0.14 + size_shift + shift;
    return 0.015 + 0.80 * sigmoid(strength - threshold) + 0.16 * draw;
  }
  if (event.kind === 'raise') {
    const threshold = (event.raises === 0 ? 0.67 : event.raises === 1 ? 0.88 : 0.965) + size_shift + shift;
    const bluff = (model === 'loose' ? 0.035 : model === 'tight' ? 0.008 : 0.018) * (1 - strength) + draw * 0.14;
    return 0.82 * sigmoid(strength - threshold, 38) + bluff;
  }
  return 1;
}
function opponent_range(hand, who, opponent, model = 'balanced', continuing = false) {
  const known = new Set(hand.holes[who].concat(hand.board));
  const events = hand.history.filter(e => e.actor === opponent && e.kind !== 'fold');
  const items = [];
  let total = 0, squared = 0;
  for (const pair of COMBOS) {
    if (pair.some(c => known.has(c))) continue;
    let log_weight = 0;
    for (const event of events) log_weight += Math.log(Math.max(1e-12, action_likelihood(pair, event, hand.holes[who], model)));
    let weight = Math.exp(Math.max(-600, log_weight));
    // Stress range composition, not just the overall calling threshold.
    // Public actions may leave more slow-played strong hands than the
    // baseline likelihoods assume. Never consult the opponent's real cards.
    if (['value-heavy', 'cautious'].includes(model) && hand.street === 3 && rankCards(pair.concat(hand.board))[0] >= 3) weight *= 3;
    if (continuing) {
      if (!hand.street) weight *= 0.01 + sigmoid(preflop_strength(pair) - 0.84, 32);
      else {
        const strength = board_metrics(hand.holes[who], hand.board).strengths.get(pair.slice().sort((a, b) => DECK.indexOf(a) - DECK.indexOf(b)).join(''));
        weight *= 0.015 + sigmoid(strength - (hand.street === 3 ? 0.86 : 0.80), 30) + 0.15 * draw_strength(pair, hand.board);
      }
    }
    total += weight; squared += weight * weight;
    items.push({pair, weight, cumulative: total});
  }
  assert(total > 0, 'No possible opponent holdings.');
  return {opponent, model, items, total, effective_combos: total * total / squared};
}
function weighted_pick(range, rng) {
  const target = rng.random() * range.total;
  let low = 0, high = range.items.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (range.items[mid].cumulative > target) high = mid; else low = mid + 1; }
  return range.items[low].pair;
}
function range_scenarios(hand, who, samples, rng, model = 'balanced', continuing = false) {
  const ranges = hand.live.filter(i => i !== who).map(i => opponent_range(hand, who, i, model, continuing));
  // Heads-up river: enumerate every legal holding, with no sampling error.
  if (hand.street === 3 && ranges.length === 1) return {ranges, exact: true, scenarios: ranges[0].items.map(item => ({
    holes: {[ranges[0].opponent]: item.pair}, board: hand.board, weight: item.weight / ranges[0].total,
    uniforms: hand.players.map(() => rng.random())
  }))};
  const scenarios = [];
  let attempts = 0;
  while (scenarios.length < samples) {
    // Reject the whole tuple on collision; sequential conditioning biases joint ranges.
    if (++attempts > samples * 10000) throw Error('Opponent ranges could not produce distinct hands.');
    const used = new Set(hand.holes[who].concat(hand.board)), holes = {};
    let collision = false;
    for (const range of ranges) {
      const pair = weighted_pick(range, rng);
      if (pair.some(c => used.has(c))) { collision = true; break; }
      pair.forEach(c => used.add(c)); holes[range.opponent] = pair;
    }
    if (collision) continue;
    const runout = rng.sample(DECK.filter(c => !used.has(c)), 5 - hand.board.length);
    scenarios.push({holes, board: hand.board.concat(runout), weight: 1 / samples, uniforms: hand.players.map(() => rng.random())});
  }
  return {ranges, scenarios, exact: false};
}
function scenario_equity(hand, who, scenarios) {
  let eq = 0, squared = 0;
  for (const scenario of scenarios) {
    const own = rank_code(hand.holes[who].concat(scenario.board));
    const scores = Object.values(scenario.holes).map(pair => rank_code(pair.concat(scenario.board)));
    const value = scores.some(score => score > own) ? 0 : 1 / (1 + scores.filter(score => score === own).length);
    eq += scenario.weight * value; squared += scenario.weight * value * value;
  }
  return {equity: eq, variance: Math.max(0, squared - eq * eq)};
}
function range_equity(hand, who, samples, rng, model = 'balanced', continuing = false) {
  const draw = range_scenarios(hand, who, samples, rng, model, continuing);
  return {...scenario_equity(hand, who, draw.scenarios), ...draw};
}
const RIVER_STRESS_MODELS = ['tight', 'loose', 'sticky', 'value-heavy', 'cautious', 'bot-policy'];
const BOT_RIVER_SAMPLES = 53, BOT_PASSIVE_RATE = 0.12;
const BOT_RIVER_TOTAL = 2 * BOT_RIVER_SAMPLES;
const bot_river_cache = new Map();
function bot_river_distribution(pair, board) {
  // The bot samples 53 random opponents on a heads-up river. Enumerate its
  // possible sample totals (wins=2, ties=1) rather than adding Monte Carlo noise.
  const key = board.slice().sort().join('');
  let cached = bot_river_cache.get(key);
  if (!cached) {
    const items = COMBOS.filter(p => !p.some(c => board.includes(c))).map(pair => ({pair, score: rank_code(pair.concat(board))}));
    cached = {items, distributions: new Map()};
    if (bot_river_cache.size >= 8) bot_river_cache.delete(bot_river_cache.keys().next().value);
    bot_river_cache.set(key, cached);
  }
  const pairKey = pair.slice().sort().join('');
  if (cached.distributions.has(pairKey)) return cached.distributions.get(pairKey);
  const score = rank_code(pair.concat(board)); let wins = 0, ties = 0, count = 0;
  for (const item of cached.items) {
    if (item.pair.some(c => pair.includes(c))) continue;
    count++; wins += Number(score > item.score); ties += Number(score === item.score);
  }
  const probabilities = [(count - wins - ties) / count, ties / count, wins / count];
  let distribution = new Float64Array(BOT_RIVER_TOTAL + 1); distribution[0] = 1;
  for (let sample = 0; sample < BOT_RIVER_SAMPLES; sample++) {
    const next = new Float64Array(BOT_RIVER_TOTAL + 1);
    for (let total = 0; total <= sample * 2; total++) for (let value = 0; value <= 2; value++) next[total + value] += distribution[total] * probabilities[value];
    distribution = next;
  }
  const tail = new Float64Array(BOT_RIVER_TOTAL + 2);
  for (let total = BOT_RIVER_TOTAL; total >= 0; total--) tail[total] = tail[total + 1] + distribution[total];
  cached.distributions.set(pairKey, tail); return tail;
}
function river_response(hand, who, opponent, pair, target, model) {
  const own = hand.players[opponent], cost = Math.min(own.stack, Math.max(0, target - own.street_bet));
  if (!cost) return {fold: 0, call: 1, reraise: 0, shove: 0};
  const fullRaise = Math.max(hand.last_full_raise, target - hand.current_bet);
  const reopened = hand.acted_at[opponent] == null || target - hand.acted_at[opponent] >= fullRaise;
  const can_reraise = reopened && own.stack + own.street_bet > target && hand.players[who].stack + hand.players[who].street_bet > target;
  const reraise_to = Math.min(own.stack + own.street_bet, Math.max(target + fullRaise, 3 * target));
  if (model === 'bot-policy' && hand.live.length === 2) {
    const heroCost = Math.min(hand.players[who].stack, Math.max(0, target - hand.players[who].street_bet));
    const cap = own.contributed + cost;
    const contestable = sum(hand.players.map((p, i) => Math.min(p.contributed + (i === who ? heroCost : 0), cap))) + cost;
    const odds = contestable ? cost / contestable : 0;
    const tail = bot_river_distribution(pair, hand.board);
    const continueProbability = tail[Math.min(BOT_RIVER_TOTAL + 1, Math.ceil((odds + 0.04) * BOT_RIVER_TOTAL - 1e-9))];
    const reraise = can_reraise ? (1 - BOT_PASSIVE_RATE) * tail[Math.ceil(Math.max(0.70, odds + 0.04) * BOT_RIVER_TOTAL - 1e-9)] : 0;
    return {fold: Math.max(0, 1 - continueProbability), call: Math.max(0, continueProbability - reraise), reraise, shove: 0, reraise_to};
  }
  const strength = board_metrics(hand.holes[who], hand.board).strengths.get(pair.slice().sort((a, b) => DECK.indexOf(a) - DECK.indexOf(b)).join(''));
  const raises = hand.history.filter(e => e.street === 3 && e.kind === 'raise').length + 1;
  const price = cost / Math.max(1, hand.pot + cost + Math.max(0, target - hand.players[who].street_bet));
  // Tiny bets offer a very different price from ordinary bets. A fixed
  // strength cutoff made plausible bluff-catchers fold too often to min-bets.
  const fraction = cost / Math.max(2, hand.pot);
  const smallBetDiscount = hand.current_bet === 0 ? 0.30 * Math.max(0, 1 - fraction / 0.5) : 0;
  // Pot odds approach 50% for both large and enormous bets. That alone
  // cannot model how much narrower a range calls a many-pot overbet.
  const overbetPremium = 0.08 * Math.log2(Math.max(1, fraction));
  const threshold = Math.min(0.90, 0.50 + 0.07 * Math.min(raises, 3) + 0.25 * price - smallBetDiscount + overbetPremium + (model === 'tight' ? 0.04 : model === 'loose' ? -0.04 : model === 'sticky' ? -0.12 : 0));
  const continue_probability = 0.015 / Math.max(1, fraction) + 0.97 * sigmoid(strength - threshold, 30);
  const shove = can_reraise ? continue_probability * 0.70 * sigmoid(strength - 0.975, 90) : 0;
  const normal = reraise_to < own.stack + own.street_bet ? shove / 2 : 0;
  const call = continue_probability - shove;
  // Stress thinner value: fewer worse hands pay, while better hands retain
  // their responses. This is uncertainty testing, not an opponent read.
  const weaker = model === 'cautious' && compare(rankCards(pair.concat(hand.board)), rankCards(hand.holes[who].concat(hand.board))) < 0;
  const retainedCall = weaker ? call * 0.5 : call;
  return {fold: 1 - continue_probability + call - retainedCall, call: retainedCall, reraise: normal, shove: shove - normal, reraise_to};
}
function river_payout(hand, who, contributions, folded, scores) {
  const layers = []; let previous = 0;
  for (const level of [...new Set(contributions.filter(n => n > 0))].sort((a, b) => a - b)) {
    const contributors = contributions.flatMap((v, i) => v >= level ? [i] : []);
    const eligible = contributors.filter(i => !folded.has(i));
    const amount = (level - previous) * contributors.length; previous = level;
    // A sole contributor's unmatched chips are refunded even if they folded later.
    if (contributors.length === 1) { if (contributors[0] === who) layers.push({refund: amount}); continue; }
    if (layers.length && JSON.stringify(layers.at(-1).eligible) === JSON.stringify(eligible)) layers.at(-1).amount += amount;
    else layers.push({amount, eligible});
  }
  let payout = 0;
  for (const layer of layers) {
    if (layer.refund) { payout += layer.refund; continue; }
    if (!layer.eligible.includes(who)) continue;
    const best = Math.max(...layer.eligible.map(i => scores[i]));
    const winners = layer.eligible.filter(i => scores[i] === best);
    if (!winners.includes(who)) continue;
    const share = Math.floor(layer.amount / winners.length), odd = layer.amount % winners.length;
    const order = Array.from({length: hand.n}, (_, i) => (hand.button + 1 + i) % hand.n).filter(i => winners.includes(i));
    payout += share + Number(order.indexOf(who) < odd);
  }
  return payout;
}
function river_outcome(hand, who, scenario, choice, model, forced = null) {
  const contributions = hand.players.map(p => p.contributed), bets = hand.players.map(p => p.street_bet);
  const stacks = hand.players.map(p => p.stack), folded = new Set(hand.players.flatMap((p, i) => p.folded ? [i] : []));
  const scores = {[who]: rank_code(hand.holes[who].concat(hand.board))};
  for (const [i, pair] of Object.entries(scenario.holes)) scores[i] = rank_code(pair.concat(hand.board));
  let spent = 0;
  const pay_to = (i, target) => { const amount = Math.min(stacks[i], Math.max(0, target - bets[i])); stacks[i] -= amount; bets[i] += amount; contributions[i] += amount; if (i === who) spent += amount; };
  if (choice.action === 'fold') return 0;
  pay_to(who, choice.action === 'raise' ? choice.target * 2 : hand.current_bet);
  let reraise_target = 0;
  const order = Array.from({length: hand.n - 1}, (_, k) => (who + k + 1) % hand.n).filter(i => !folded.has(i) && stacks[i] > 0);
  if (choice.action === 'raise') {
    for (const i of order) {
      const response = river_response(hand, who, i, scenario.holes[i], bets[who], model);
      const u = scenario.uniforms[i];
      const kind = forced?.opponent === i ? forced.kind : u < response.fold ? 'fold' : u < response.fold + response.call ? 'call' : u < response.fold + response.call + response.reraise ? 'reraise' : 'shove';
      if (kind === 'fold') folded.add(i);
      else if (kind === 'shove' || kind === 'reraise') { reraise_target = kind === 'reraise' ? response.reraise_to : bets[i] + stacks[i]; pay_to(i, reraise_target); break; }
      else pay_to(i, bets[who]);
    }
  } else {
    // Terminal call/check approximation: pending players may call or fold;
    // this branch does not invent additional bets after a check.
    for (const i of order) if (hand.pending.has(i) && bets[i] < hand.current_bet) {
      const response = river_response(hand, who, i, scenario.holes[i], hand.current_bet, model);
      if (scenario.uniforms[i] < response.fold) folded.add(i); else pay_to(i, hand.current_bet);
    }
  }
  if (reraise_target) {
    if (choice.plan === 'call_reraise') pay_to(who, reraise_target); else folded.add(who);
    for (const i of order) if (!folded.has(i) && stacks[i] > 0 && bets[i] < reraise_target) {
      const response = river_response(hand, who, i, scenario.holes[i], reraise_target, model);
      if (scenario.uniforms[i] < response.fold) folded.add(i); else pay_to(i, reraise_target);
    }
  }
  return (river_payout(hand, who, contributions, folded, scores) - spent) / 2;
}
function river_values(hand, who, draw, model = 'balanced') {
  const legal = hand.legal(), choices = [{action: legal.check ? 'check' : 'fold', target: null}];
  if (!legal.check) choices.push({action: 'call', target: null});
  if (legal.raise) {
    const min = legal.min_to * 2, max = legal.max_to * 2;
    const cover = Math.max(...hand.live.filter(i => i !== who).map(i => hand.players[i].street_bet + hand.players[i].stack));
    const cap = Math.max(min, Math.min(max, cover));
    const potAfterCall = hand.pot + legal.call * 2;
    const wanted = [min, hand.current_bet * 3,
      ...[0.5, 1, 1.5].map(fraction => hand.current_bet + fraction * potAfterCall), cap];
    const targets = [...new Set(wanted.map(target => Math.max(min, Math.min(cap, Math.round(target)))))];
    for (const target of targets) for (const plan of target === max ? ['call_reraise'] : ['fold_to_reraise', 'call_reraise']) choices.push({action: 'raise', target: target / 2, plan});
  }
  return choices.map(choice => {
    let ev = 0, second = 0;
    for (const scenario of draw.scenarios) {
      let value;
      if (draw.exact && choice.action === 'raise') {
        const opponent = draw.ranges[0].opponent;
        const response = river_response(hand, who, opponent, scenario.holes[opponent], choice.target * 2, model);
        value = ['fold', 'call', 'reraise', 'shove'].reduce((n, kind) => n + response[kind] * river_outcome(hand, who, scenario, choice, model, {opponent, kind}), 0);
      } else value = river_outcome(hand, who, scenario, choice, model);
      ev += scenario.weight * value; second += scenario.weight * value * value;
    }
    return {...choice, ev_bb: ev, standard_error_bb: draw.exact ? 0 : Math.sqrt(Math.max(0, second - ev * ev) / draw.scenarios.length)};
  });
}
function advice(hand, who, samples, rng) {
  if (hand.actor !== who || hand.done) throw Error('Advice requires an active decision for this player.');
  assert(Number.isInteger(samples) && samples >= 1 && samples <= 5000, 'Use one to 5000 equity samples.');
  const legal = hand.legal(), opponents = hand.live.length - 1, position = hand.position(who), call = legal.call * 2;
  const cap = hand.players[who].contributed + call;
  const contestable = sum(hand.players.map(p => Math.min(p.contributed, cap))) + call;
  const odds = call && contestable ? call / contestable : 0;
  const preflopRaises = hand.history.filter(event => event.street === 0 && event.kind === 'raise').length;
  const facingPreflopRaise = hand.street === 0 && hand.current_bet > 2;
  const minimumSamples = facingPreflopRaise ? (preflopRaises >= 2 ? 2048 : 640) : 160;
  let used = Math.max(minimumSamples, samples), estimate = range_equity(hand, who, used, rng);
  const error = estimate.exact ? 0 : Math.sqrt(estimate.variance / used);
  if (!estimate.exact && Math.abs(estimate.equity - odds - 0.04) < 2 * error) {
    used = Math.min(5000, Math.max(used, 640)); estimate = range_equity(hand, who, used, rng);
  }
  let action, accepted, reason, target = null, values = [], sensitivity = [], confidence = 'clear', review_evidence = null;
  if (hand.street === 0 && hand.current_bet <= 2) {
    action = legal.raise && opening_hand(hand.holes[who], position, preflop_limpers(hand, who) > 0) ? 'raise' : legal.check ? 'check' : 'fold';
    accepted = [action];
    reason = action === 'raise' ? `Enter with the trainer's ${position} opening or isolation range.` : action === 'check' ? 'Take the free big-blind option.' : `This hand is outside the trainer's ${position} entry range.`;
  } else if (hand.street === 3) {
    values = river_values(hand, who, estimate);
    const sorted = values.slice().sort((a, b) => b.ev_bb - a.ev_bb);
    const best = sorted[0]; action = best.action; target = best.target;
    const tolerance = Math.max(0.25, bb(hand.pot) * 0.02, best.standard_error_bb * 2);
    const responseValues = [values];
    accepted = [...new Set(values.filter(v => v.ev_bb >= best.ev_bb - tolerance).map(v => v.action))];
    for (const model of (opponents === 1 ? RIVER_STRESS_MODELS : RIVER_STRESS_MODELS.filter(m => m !== 'bot-policy'))) {
      const alt = range_equity(hand, who, Math.min(used, 320), rng, model);
      const alternatives = river_values(hand, who, alt, model).sort((a, b) => b.ev_bb - a.ev_bb);
      responseValues.push(alternatives);
      sensitivity.push({model, action: alternatives[0].action, target: alternatives[0].target, equity: round1(alt.equity * 100)});
      const alternativeTolerance = Math.max(0.25, bb(hand.pot) * 0.02, alternatives[0].standard_error_bb * 2);
      for (const candidate of alternatives.filter(v => v.ev_bb >= alternatives[0].ev_bb - alternativeTolerance)) {
        if (!accepted.includes(candidate.action)) accepted.push(candidate.action);
      }
    }
    // Only exact heads-up river values can support the strongest review label.
    // Score action categories using their best size/plan, never a custom sizing error.
    if (estimate.exact && opponents === 1) {
      const losses = {};
      for (const candidate of new Set(values.map(v => v.action))) {
        losses[candidate] = Math.min(...responseValues.map(modelValues => {
          const best = modelValues.reduce((a, b) => a.ev_bb > b.ev_bb ? a : b);
          const chosen = modelValues.filter(v => v.action === candidate).reduce((a, b) => a.ev_bb > b.ev_bb ? a : b);
          return best.ev_bb - chosen.ev_bb - 2 * Math.hypot(best.standard_error_bb, chosen.standard_error_bb);
        }));
      }
      review_evidence = {losses, threshold_bb: Math.max(2, bb(hand.pot) * 0.20), models: responseValues.length};
    }
    // Compare the SAME size and response plan across models. Picking a
    // different winning size in each model can hide a fragile recommendation.
    for (const choice of values.filter(v => v.action === 'raise')) {
      choice.worst_case_advantage_bb = Math.min(...responseValues.map(modelValues => {
        const candidate = modelValues.find(v => v.action === 'raise' && v.target === choice.target && v.plan === choice.plan);
        const passive = modelValues.filter(v => v.action !== 'raise').sort((a,b) => b.ev_bb-a.ev_bb)[0];
        return candidate.ev_bb - passive.ev_bb - 2 * Math.hypot(candidate.standard_error_bb, passive.standard_error_bb);
      }));
    }
    const robustRaise = values.filter(v => v.action === 'raise' && v.worst_case_advantage_bb > Math.max(0.25, bb(hand.pot) * 0.02))
      .sort((a,b) => b.worst_case_advantage_bb-a.worst_case_advantage_bb)[0];
    if (action === 'raise') {
      if (robustRaise) target = robustRaise.target;
      else {
        const passive = sorted.find(v => v.action !== 'raise');
        action = passive.action; target = null;
        if (!accepted.includes(action)) accepted.push(action);
      }
    }
    confidence = accepted.length > 1 || sensitivity.some(v => v.action !== action) ? 'close' : 'clear';
    reason = action === 'raise' ? `This river size improves on calling or checking across the tested range and response assumptions. Plan to ${(robustRaise || best).plan === 'call_reraise' ? 'call' : 'fold to'} a further raise.` : action === 'fold' ? 'Folding avoids a commitment that is not supported consistently by the modeled ranges and responses.' : action === 'call' ? (accepted.includes('raise') ? 'Calling keeps showdown value. A raise may work under some assumptions, but its advantage depends on uncertain calls or folds from the opponent.' : 'Calling has a better modeled return than folding or raising against the ranges likely to continue.') : (accepted.includes('raise') ? 'Checking takes the free showdown. Betting is also reasonable under some assumptions, but its advantage depends on how often the opponent calls or folds.' : 'Checking has the best modeled showdown return; a raise does not gain enough from worse continuing hands.');
  } else {
    const cushion = 0.04 + 0.015 * (opponents - 1), eq = estimate.equity;
    action = legal.check ? 'check' : eq >= odds + cushion ? 'call' : 'fold';
    accepted = [action];
    reason = action === 'fold' ? 'The estimated share against action-weighted ranges does not justify the price with a cushion for future betting.' : action === 'call' ? 'The estimate against action-weighted ranges clears the calling price; keep the pot manageable.' : 'Take the free card or showdown with this hand.';
    if (legal.raise && eq > 0.58) {
      const continuing = range_equity(hand, who, used, rng, 'balanced', true);
      if (continuing.equity > 0.60 + 0.025 * (opponents - 1)) {
        action = 'raise'; accepted = ['raise']; reason = 'The hand also has strong estimated equity against the narrower ranges likely to continue to a raise.';
      }
    }
    if (action !== 'raise' && !legal.check && Math.abs(eq - odds - cushion) < Math.max(0.025, 2 * Math.sqrt(estimate.variance / used))) {
      accepted = ['call', 'fold']; confidence = 'close';
    }
    if (facingPreflopRaise && action !== 'raise') {
      for (const model of ['tight', 'loose']) {
        const alt = range_equity(hand, who, Math.max(640, Math.floor(used / 2)), rng, model);
        const alternativeAction = alt.equity >= odds + cushion ? 'call' : 'fold';
        sensitivity.push({model, action: alternativeAction, target: null, equity: round1(alt.equity * 100)});
        const close = Math.abs(alt.equity - odds - cushion) < Math.max(0.025, 2 * Math.sqrt(alt.variance / alt.scenarios.length));
        for (const candidate of close ? ['call', 'fold'] : [alternativeAction]) if (!accepted.includes(candidate)) accepted.push(candidate);
      }
      if (accepted.length > 1) confidence = 'close';
    }
  }
  if (action === 'raise' && target === null) {
    const wanted = hand.street === 0 && hand.current_bet <= 2 ? entry_size(hand, who) : call ? 3 * hand.current_bet : Math.max(2, roundEven(hand.pot * 0.5));
    target = bb(Math.max(legal.min_to * 2, Math.min(wanted, legal.max_to * 2)));
  }
  const range = hand.street === 0 && hand.current_bet <= 2 && legal.raise && hand.n === 6 ? {...opening_range(position, preflop_limpers(hand, who) > 0), current_hand: hand_class(hand.holes[who])} : null;
  return {action, accepted: accepted.sort(), target, display: action === 'raise' ? `${hand.current_bet === 0 ? 'Bet' : 'Raise'} to ${target} BB` : capitalize(action),
    equity: round1(estimate.equity * 100), pot_odds: round1(odds * 100), reason, samples: estimate.scenarios.length, requested_samples: samples,
    opponents, position, range, confidence, uncertainty_note: confidence === 'close' ? 'Reasonable range and response assumptions or sampling uncertainty allow more than one action.' : null,
    basis: 'Equity against public-action-weighted ranges. River values use a terminal response model with folds, calls and one normal-sized or all-in reraise; not a solver.',
    model: COACH_VERSION,
    range_summary: estimate.ranges.map(r => ({seat: r.opponent, effective_combos: Math.round(r.effective_combos)})),
    action_values: values, range_sensitivity: sensitivity, review_evidence};
}

function decision_review(report, chosen) {
  if (report.accepted.includes(chosen)) return report.confidence === 'close'
    ? {level: 'close', label: 'Close', explanation: 'Both reasonable.'}
    : {level: 'good', label: 'Good', explanation: 'Matches an accepted action.'};
  const evidence = report.review_evidence;
  if (evidence?.models === RIVER_STRESS_MODELS.length + 1 && Number.isFinite(evidence.losses[chosen]) && evidence.losses[chosen] > evidence.threshold_bb)
    return {level: 'big-mistake', label: 'Big mistake', explanation: 'This action gives up substantial estimated value across all tested models.'};
  return {level: 'mistake', label: 'Mistake', explanation: report.reason};
}

class Trainer {
  constructor(seed, samples = 160) {
    this.rng = new Random(seed); this.coach_rng = new Random(seed === undefined ? undefined : seed + 101); this.bot_rng = new Random(seed === undefined ? undefined : seed + 202);
    this.completed_histories = []; this.hand_timestamp = null;
    this.samples = samples; this.hand = null; this.hand_number = 0; this.stack_mode = 'equal'; this.decisions = 0; this.correct = 0;
    this.feedback = []; this.pending = null; this.hints = false; this.range_revealed = false; this.decision_was_hinted = false; this.hinted_decisions = 0;
  }
  new_hand(stack_mode = null) {
    if (this.hand && !this.hand.done) throw Error('Finish the current hand before dealing again.');
    if (stack_mode !== null) {
      if (!['equal', 'mixed'].includes(stack_mode)) throw Error('Choose equal or mixed starting stacks.');
      this.stack_mode = stack_mode;
    }
    if (this.hand) this.completed_histories.push(this.current_history());
    this.hand_timestamp = new Date().toISOString().slice(0,19).replaceAll('-', '/').replace('T', ' ')+' UTC';
    this.hand = new Hand(this.rng, this.hand_number % 6, this.stack_mode === 'mixed' ? [200, 50, 80, 150, 200, 300] : Array(6).fill(200));
    this.hand_number++; this.feedback = []; this.pending = null; this._advance(); return this.state();
  }
  _advance() {
    const hand = this.hand; let actions = 0;
    while (!hand.done && hand.actor !== 0) {
      const report = opponent_advice(hand, hand.actor, Math.max(40, Math.floor(this.samples / 3)), this.bot_rng);
      let action = report.action;
      const unopenedPreflop = hand.street === 0 && hand.current_bet <= 2 && preflop_limpers(hand, hand.actor) === 0;
      if (action === 'raise' && !unopenedPreflop && this.bot_rng.random() < BOT_PASSIVE_RATE) action = hand.legal().check ? 'check' : 'call';
      hand.action(action, action === 'raise' ? report.target * 2 : null);
      if (++actions > 2048) throw Error('Opponent action loop failed to finish.');
    }
    this.pending = hand.done ? null : advice(hand, 0, this.samples, this.coach_rng);
    this.decision_was_hinted = false; this.range_revealed = false;
  }
  reveal_range() {
    if (!this.pending?.range) throw Error('An opening range is available in unraised preflop pots.');
    this.range_revealed = true; this.decision_was_hinted = true; return this.state();
  }
  act(action, size = null) {
    const hand = this.hand;
    if (!hand || hand.done || hand.actor !== 0) throw Error('Deal a hand to start a decision.');
    const report = this.pending, street = STREETS[hand.street], board = hand.board.slice(), was_bet = hand.current_bet === 0, requested = action;
    let normalized = action === 'allin' ? 'raise' : action;
    if (action === 'allin' && !hand.legal().raise && hand.legal().call > 0) action = normalized = 'call';
    hand.action(action, action === 'raise' ? chips(size) : null);
    const ok = report.accepted.includes(normalized), hinted = this.hints || this.decision_was_hinted;
    if (hinted) this.hinted_decisions++; else { this.decisions++; this.correct += Number(ok); }
    this.feedback.unshift({...report, street, board, chosen: normalized,
      chosen_label: requested === 'allin' && normalized === 'raise' ? 'All-in' : normalized === 'raise' && was_bet ? 'Bet' : capitalize(normalized),
      correct: ok, hinted, review: decision_review(report, normalized), message: ok ? 'Matches the training policy' : 'Review this decision',
      sizing_note: 'Scoring checks the action category; legal raise sizes are not graded.'});
    this.feedback = this.feedback.slice(0, 20); this._advance(); return this.state();
  }
  current_history() {
    return this.hand ? format_history(this.hand, this.hand_number, this.hand_timestamp, true) : '';
  }
  session_history() {
    return [...this.completed_histories, ...(this.hand ? [this.current_history()] : [])].join('\n');
  }
  reset_session() {
    const {hints,stack_mode}=this;
    Object.assign(this,new Trainer(undefined,this.samples));
    this.hints=hints;this.stack_mode=stack_mode;
    return this.state();
  }
  stats() { return {decisions: this.decisions, correct: this.correct, accuracy: this.decisions ? roundEven(100 * this.correct / this.decisions) : null, hinted: this.hinted_decisions}; }
  state() {
    const hand = this.hand;
    if (!hand) return {started: false, hand_number: this.hand_number, hints: this.hints, stats: this.stats(), stack_mode: this.stack_mode};
    if (this.hints && !hand.done) this.decision_was_hinted = true;
    const current_range = this.pending?.range, show_current_range = !!(current_range && (this.hints || this.range_revealed));
    const review_range = this.feedback.find(item => item.range)?.range || null;
    const seats = hand.players.map((p, i) => ({id: i, name: NAMES[i], position: hand.position(i),
      cards: i === 0 || (hand.showdown && !p.folded) ? hand.holes[i].slice() : ['??', '??'],
      stack: bb(p.stack), bet: bb(p.street_bet), contributed: bb(p.contributed), button: i === hand.button, folded: p.folded,
      all_in: p.stack === 0 && !p.folded && !hand.done, acting: !hand.done && hand.actor === i, last_action: p.last_action,
      winning_cards: hand.done && hand.showdown && hand.winners.includes(i) ? best_five([...hand.board, ...hand.holes[i]]) : [],
      hand_name: hand.showdown && !p.folded ? hand_name([...hand.holes[i], ...hand.board]) : null, won: hand.done && hand.winners.includes(i)}));
    return {started: true, hand_number: this.hand_number, street: STREETS[hand.street], board: hand.board.slice(), seats, hero: seats[0], player_count: hand.n,
      remaining: hand.live.length, current_bet: bb(hand.current_bet), pot: bb(hand.done ? hand.settled_pot : hand.pot), done: hand.done,
      export_history: this.current_history(),
      history_count: this.completed_histories.length + 1,
      result: hand.result, awards: hand.awards, legal: hand.legal(), log: hand.log.slice(), profit: hand.done ? bb(hand.players[0].stack - hand.starting_stacks[0]) : null,
      feedback: this.feedback, hints: this.hints, stack_mode: this.stack_mode, coach: this.hints ? this.pending : null, stats: this.stats(),
      range_available: !!current_range, range: show_current_range ? current_range : review_range, range_current: show_current_range};
  }
  snapshot() {
    return {version: 1, trainer: {...this, rng: this.rng.value, coach_rng: this.coach_rng.value, bot_rng: this.bot_rng.value,
      hand: this.hand ? {...this.hand, pending: [...this.hand.pending]} : null}};
  }
  static restore(snapshot) {
    if (snapshot?.version !== 1 || !snapshot.trainer) throw Error('Saved progress is not compatible.');
    const saved = snapshot.trainer, trainer = Object.assign(new Trainer(0), saved);
    for (const name of ['rng', 'coach_rng', 'bot_rng']) {
      assert(Number.isInteger(saved[name]) && saved[name] >= 0 && saved[name] <= 4294967295);
      trainer[name] = new Random(0); trainer[name].value = saved[name];
    }
    assert(Number.isInteger(trainer.samples) && trainer.samples >= 1 && trainer.samples <= 5000);
    for (const name of ['hand_number', 'decisions', 'correct', 'hinted_decisions']) assert(Number.isInteger(trainer[name]) && trainer[name] >= 0);
    assert(trainer.correct <= trainer.decisions && ['equal', 'mixed'].includes(trainer.stack_mode) && Array.isArray(trainer.feedback));
    assert(Array.isArray(saved.completed_histories) && saved.completed_histories.every(text => typeof text === 'string'));
    assert(trainer.completed_histories.length === trainer.hand_number - (saved.hand ? 1 : 0));
    if (saved.hand) {
      trainer.hand = Object.assign(Object.create(Hand.prototype), saved.hand, {pending: new Set(saved.hand.pending)});
      assert(trainer.hand.n === 6 && trainer.hand.players.length === 6 && trainer.hand.holes.every(hole => hole.length === 2));
      trainer.hand.assert_invariants();
      assert(Array.isArray(saved.hand.history));
      assert(typeof saved.hand_timestamp === 'string' && saved.hand_timestamp.length > 0);
      assert(trainer.hand.done || (trainer.hand.actor === 0 && trainer.pending?.model === COACH_VERSION && Array.isArray(trainer.pending.accepted)));
    }
    return trainer;
  }
}
const api = {RANKS, DECK, NAMES, STREETS, Random, Hand, Trainer, chips, evaluate, best_five, compare, hand_name, format_history, equity, opening_hand, hand_class, opening_range, advice, opponent_advice, opponent_range, range_equity, river_values, river_response, decision_review, COACH_VERSION};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PokerClassroom = api;
})(globalThis);
