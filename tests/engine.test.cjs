'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {DECK, Random, Hand, Trainer, chips, evaluate, compare, equity, advice, opening_hand, hand_class, opening_range} = require('../engine.js');
const cards = text => text.split(' ');
const hand = (stacks, button = 0) => new Hand(new Random(7), button, stacks);
function checkDown(h) {
  for (let i = 0; !h.done && i < 500; i++) h.action(h.legal().check ? 'check' : 'call');
  assert.ok(h.done); h.assert_invariants();
}
function rig(h, holes, board = '2c 3d 7h 9s Jc') {
  h.holes = holes.map(cards); h.board = cards(board); h.burned = []; h.street = 3;
  const known = [...h.holes.flat(), ...h.board]; assert.equal(new Set(known).size, known.length);
  h.deck = DECK.filter(c => !known.includes(c));
}
function finishTrainer(t) {
  for (let i = 0; !t.hand.done && i < 250; i++) t.act(t.pending.action, t.pending.target);
  assert.ok(t.hand.done); t.hand.assert_invariants();
}
test('all nine hand categories and comparisons', () => {
  const examples = ['Ac Jd 9s 6h 3c', 'Ac Ad 9s 6h 3c', 'Ac Ad 9s 9h 3c', 'Ac Ad As 6h 3c', '9c 8d 7s 6h 5c', 'Ac Jc 9c 6c 3c', 'Ac Ad As 6h 6c', 'Ac Ad As Ah 3c', 'Ac Kc Qc Jc Tc'];
  const results = examples.map(s => evaluate(cards(s)));
  assert.deepEqual(results.map(r => r[0]), [0,1,2,3,4,5,6,7,8]);
  for (let i = 1; i < results.length; i++) assert.equal(compare(results[i], results[i - 1]), 1);
});
test('wheel, wheel straight flush, and board royal flush', () => {
  assert.deepEqual(evaluate(cards('Ac 2d 3s 4h 5c')), [4,5]);
  assert.deepEqual(evaluate(cards('Ac 2c 3c 4c 5c Kd Qd')), [8,5]);
  assert.deepEqual(evaluate(cards('Ac Kc Qc Jc Tc 2d 3d')), [8,14]);
});
test('two trips, three pairs, quads, flush and pair kickers', () => {
  assert.deepEqual(evaluate(cards('Ac Ad As Kc Kd Ks 2h')), [6,14,13]);
  assert.deepEqual(evaluate(cards('Ac Ad Kc Kd Qc Qd Js')), [2,14,13,12]);
  assert.deepEqual(evaluate(cards('9c 9d 9s 9h Ac 2c 3d')), [7,9,14]);
  assert.equal(compare(evaluate(cards('Ac Jc 9c 6c 3c')), evaluate(cards('Ac Tc 9c 6c 3c'))), 1);
  assert.equal(compare(evaluate(cards('Ac Ad Ks Qh 9c')), evaluate(cards('Ac Ad Ks Jh 9c'))), 1);
});
test('invalid cards and chip sizes fail', () => {
  for (const s of ['Ac Ac Qc Jc Tc', 'Ac Xd Qc Jc Tc', 'Ac Kc Qc Jc']) assert.throws(() => evaluate(cards(s)));
  assert.equal(chips('2.5'), 5);
  for (const value of ['nan','inf',-1,2.25,true,null,{},'',Infinity]) assert.throws(() => chips(value));
});
test('equity wins and board ties against one to five opponents', () => {
  assert.equal(equity(cards('Ac Kc'), cards('Qc Jc Tc 2d 3d'), 40, new Random(7), 5), 1);
  for (const opponents of [1,2,5]) assert.ok(Math.abs(equity(cards('2d 3d'), cards('Ac Kc Qc Jc Tc'), 40, new Random(7), opponents) - 1 / (opponents + 1)) < 1e-12);
  for (const opponents of [0,6,1.5]) assert.throws(() => equity(cards('Ac Kc'), [], 40, new Random(7), opponents));
});
test('six seats, blinds, rotation, preflop order and big blind option', () => {
  const h = hand(); assert.equal(h.sb, 1); assert.equal(h.bb_seat, 2); assert.equal(h.actor, 3); assert.equal(h.pot, 3);
  assert.deepEqual(h.players.map((_, i) => h.position(i)), ['BTN','SB','BB','UTG','HJ','CO']);
  assert.deepEqual(Array.from({length:6}, (_, i) => hand(undefined,i).position(0)), ['BTN','CO','HJ','UTG','BB','SB']);
  const acted = []; for(let i=0;i<5;i++){acted.push(h.actor);h.action('call');}
  assert.deepEqual(acted,[3,4,5,0,1]); assert.equal(h.actor,2); assert.equal(h.street,0);
  h.action('check'); assert.equal(h.street,1); assert.equal(h.actor,1); assert.equal(h.pot,12);
});
test('folded players are skipped and hero folding does not stop multiway play', () => {
  const h = hand(); h.action('fold'); h.action('fold'); assert.equal(h.actor,5); checkDown(h);
  assert.ok(h.showdown); assert.ok(!h.winners.includes(3) && !h.winners.includes(4));
  const other = hand(); for(let i=0;i<3;i++)other.action('call'); other.action('fold');
  assert.ok(!other.done); assert.equal(other.actor,1);
});
test('folding to big blind refunds unmatched chips', () => {
  const h = hand(); for(let i=0;i<5;i++) h.action('fold');
  assert.deepEqual(h.winners,[2]); assert.equal(h.settled_pot,2); assert.equal(h.players[2].stack,201); h.assert_invariants();
});
test('raise updates pending and minimum', () => {
  const h = hand(); h.action('raise',6); assert.equal(h.last_full_raise,4); assert.equal(h.legal().min_to,5);
  assert.deepEqual([...h.pending].sort(),[0,1,2,4,5]);
});
test('single short all-in does not reopen raising', () => {
  const h = hand([200,200,200,200,14,200]); h.action('raise',10); h.action('allin'); for(let i=0;i<4;i++)h.action('call');
  assert.equal(h.actor,3); assert.equal(h.legal().raise,false); assert.equal(h.legal().reopened,false);
  h.action('call'); assert.equal(h.street,1);
});
test('cumulative short all-ins reopen raising', () => {
  const h = hand([200,200,200,200,14,18]); h.action('raise',10); h.action('allin'); h.action('allin'); for(let i=0;i<3;i++)h.action('call');
  assert.equal(h.actor,3); assert.equal(h.legal().raise,true); assert.equal(h.last_full_raise,8); assert.equal(h.legal().min_to,13);
});
test('reopening is tracked separately for each player', () => {
  const h = hand([18,200,200,200,14,200]);
  for(const [kind,target] of [['raise',10],['allin'],['call'],['allin'],['call'],['call']])h.action(kind,target);
  assert.equal(h.actor,3); assert.equal(h.legal().raise,true); h.action('call'); assert.equal(h.actor,5); assert.equal(h.legal().raise,false);
});
test('postflop check and incomplete all-in does not reopen checker', () => {
  const h = hand([200,200,3]); while(h.street===0)h.action(h.legal().check?'check':'call');
  h.action('check'); h.action('allin'); h.action('call'); assert.equal(h.actor,1); assert.equal(h.legal().raise,false);
});
test('all-in calls run out and burn all streets', () => {
  const h = hand(); h.action('allin'); for(let i=0;i<5;i++)h.action('call');
  assert.ok(h.done&&h.showdown); assert.equal(h.board.length,5); assert.equal(h.burned.length,3); assert.equal(h.settled_pot,1200); assert.equal(h.awards.length,1);
});
test('covering shove is returned and three pot tiers have distinct winners', () => {
  const h = hand([20,40,60,100]); rig(h,['As Ad','Ks Kd','Qs Qd','Ts Td']);
  h.action('allin'); for(let i=0;i<3;i++)h.action('call');
  assert.equal(h.settled_pot,180); assert.deepEqual(h.awards.map(a=>a.amount),[40,30,20]);
  assert.deepEqual(h.awards.map(a=>a.winners),[[0],[1],[2]]); assert.deepEqual(h.players.map(p=>p.stack),[80,60,40,40]);
});
test('short main-pot winner cannot win side pot; no dry side-pot raises', () => {
  const h = hand([30,60,100]); rig(h,['As Ad','Ks Kd','Qs Qd']); h.action('allin');h.action('allin');
  assert.equal(h.legal().raise,false); h.action('call');
  assert.deepEqual(h.players.map(p=>p.stack),[90,60,40]); assert.deepEqual(h.awards.map(a=>a.winners),[[0],[1]]); assert.ok(!h.awards[1].eligible.includes(0));
});
test('folded dead money never wins a pot', () => {
  const h = hand([100,100,100]); rig(h,['Ks Kd','As Ad','Qs Qd']);
  [40,20,40].forEach((amount,i)=>h._pay(i,amount-h.players[i].contributed)); h.players[1].folded=true; h._settle(true);
  assert.deepEqual(h.winners,[0]); assert.equal(h.players[0].stack,160); assert.ok(h.awards.every(a=>!a.eligible.includes(1)));
});
test('odd split chip goes left of button; dead blind creates no false side pot', () => {
  const h = hand([10,10,10]);rig(h,['2d 3d','4d 5d','6d 7d'],'Ac Kc Qc Jc Tc');h._pay(0,2);h.players[1].folded=true;h._settle(true);
  assert.equal(h.settled_pot,5);assert.deepEqual(h.players.map(p=>p.stack),[10,9,11]);assert.equal(h.awards.length,1);assert.deepEqual(h.awards[0].payouts,{'0':1,'2':1.5});
  const other=hand([100,100,100]);other.action('call');other.action('fold');checkDown(other);assert.equal(other.awards.length,1);assert.equal(other.awards[0].amount,2.5);
});
test('heads up order and very short blinds finish', () => {
  const h=hand([200,200]);assert.equal(h.actor,0);assert.equal(h.sb,0);h.action('call');h.action('check');assert.equal(h.actor,1);checkDown(h);
  checkDown(hand([1,1,1,1,1,1]));
});
test('rejected raise does not change state', () => {
  const h=hand(),before=JSON.stringify(h);
  for(const target of [3,401,-1,null,4.5,true])assert.throws(()=>h.action('raise',target));
  assert.equal(JSON.stringify(h),before);
});
test('1000 randomized multiway hands conserve chips and finish', () => {
  const rng=new Random(9182);
  for(let trial=0;trial<1000;trial++){
    const n=2+rng.int(5),h=new Hand(rng,rng.int(n),Array.from({length:n},()=>1+rng.int(239)));
    for(let i=0;!h.done&&i<500;i++){
      const l=h.legal(),options=l.check?['check']:['call','fold'];if(l.raise)options.push('raise','allin');
      const action=options[rng.int(options.length)];h.action(action,action==='raise'?l.min_to*2:null);h.assert_invariants();
    }
    assert.ok(h.done);assert.equal(h.awards.reduce((n,a)=>n+a.amount,0),h.settled_pot/2);
  }
});
test('coach cannot read other hole cards or future deck', () => {
  const h=hand(),who=h.actor,first=advice(h,who,40,new Random(9));
  for(let i=0;i<6;i++)if(i!==who)h.holes[i]=cards('Ac Ad');h.deck.reverse();
  assert.deepEqual(advice(h,who,40,new Random(9)),first);
});
test('coach counts live opponents and excludes unreachable side-pot chips', () => {
  const h=hand();h.action('fold');assert.equal(advice(h,h.actor,40,new Random(9)).opponents,4);
  const other=hand([20,200,200]);other._pay(1,99);other._pay(2,98);other.current_bet=100;
  assert.equal(advice(other,0,40,new Random(9)).pot_odds,33.3);
});
test('range charts cover all 169 classes with 1326 weighted combinations', () => {
  for(const position of ['UTG','HJ','CO','BTN','SB','BB']){
    const chart=opening_range(position);assert.equal(chart.cells.length,169);assert.equal(new Set(chart.cells.map(c=>c.hand)).size,169);assert.equal(chart.cells.reduce((n,c)=>n+c.combos,0),1326);
    assert.equal(chart.cells[0].hand,'AA');assert.equal(chart.cells[1].hand,'AKs');assert.equal(chart.cells[13].hand,'AKo');assert.equal(chart.cells.at(-1).hand,'22');
  }
  assert.equal(opening_range('BB').title,'BB isolation range');assert.throws(()=>opening_range('bad'));
  assert.equal(hand_class(cards('Kd Ac')),'AKo');assert.equal(hand_class(cards('Qc Ac')),'AQs');assert.throws(()=>hand_class(cards('Ac Ac')));
  assert.equal(opening_hand(cards('2c 2d'),'UTG'),false);assert.equal(opening_hand(cards('2c 2d'),'BTN'),true);assert.equal(opening_hand(cards('Ac 5c'),'CO'),true);assert.equal(opening_hand(cards('7c 2d'),'BTN'),false);
  assert.ok(opening_range('BTN').raise_combos>opening_range('UTG').raise_combos);
});
test('no response-to-raise or postflop range is fabricated', () => {
  const h=hand();h.action('raise',6);assert.equal(advice(h,h.actor,40,new Random(9)).range,null);
  const other=hand();while(other.street===0)other.action(other.legal().check?'check':'call');assert.equal(advice(other,other.actor,40,new Random(9)).range,null);
  assert.throws(()=>new Trainer(42,40).reveal_range());
});
test('public table has six seats, hidden opponent cards and deterministic seed', () => {
  const one=new Trainer(42,40),two=new Trainer(42,40);assert.deepEqual(one.new_hand(),two.new_hand());
  assert.equal(one.state().seats.length,6);assert.equal(one.state().coach,null);assert.equal(one.hand.actor,0);
  assert.ok(one.state().seats.slice(1).every(s=>s.cards.join(' ')==='?? ??'));
  assert.deepEqual(one.act(one.pending.action,one.pending.target),two.act(two.pending.action,two.pending.target));
});
test('hint stays unscored after turning coach off', () => {
  const t=new Trainer(42,40);t.new_hand();t.hints=true;assert.ok(t.state().coach);t.hints=false;t.act(t.pending.action,t.pending.target);
  assert.equal(t.decisions,0);assert.equal(t.hinted_decisions,1);
});
test('viewing range marks hint; review range appears after action', () => {
  const t=new Trainer(0,40);t.new_hand();assert.ok(t.state().range_available);assert.equal(t.state().range,null);
  assert.ok(t.reveal_range().range_current);assert.equal(t.state().coach,null);t.act('fold');assert.equal(t.decisions,0);assert.equal(t.hinted_decisions,1);assert.equal(t.state().range_current,false);assert.ok(t.state().range);
  const other=new Trainer(0,40);other.new_hand();other.act('call');assert.equal(other.decisions,1);assert.equal(other.state().feedback[0].chosen_label,'Call');assert.ok(other.state().range);
});
test('invalid action does not score, active hand cannot be skipped, stack setup validates', () => {
  const t=new Trainer(42,40);t.new_hand('mixed');assert.deepEqual(t.hand.starting_stacks,[200,50,80,150,200,300]);
  assert.throws(()=>t.act('raise',-1));assert.equal(t.decisions,0);assert.throws(()=>t.new_hand());assert.throws(()=>new Trainer().new_hand('bad'));
});
test('all positions rotate; following coach yields 100% accuracy', () => {
  const t=new Trainer(321,40),positions=[];
  for(let i=0;i<12;i++){t.new_hand();positions.push(t.state().hero.position);finishTrainer(t);}
  assert.deepEqual(positions.slice(0,6),['BTN','CO','HJ','UTG','BB','SB']);assert.equal(t.correct,t.decisions);
});
test('serialization resumes the exact hand, random streams, score and hint eligibility', () => {
  const one=new Trainer(0,40);one.new_hand('mixed');one.reveal_range();
  const two=Trainer.restore(JSON.parse(JSON.stringify(one.snapshot())));assert.deepEqual(two.state(),one.state());
  for(let i=0;!one.hand.done&&i<250;i++)assert.deepEqual(two.act(one.pending.action,one.pending.target),one.act(one.pending.action,one.pending.target));
  assert.ok(one.hand.done);assert.equal(one.hinted_decisions,1);assert.deepEqual(two.new_hand(),one.new_hand());
});
test('empty and finished sessions restore, corrupt saves fail', () => {
  const t=new Trainer(42,40);assert.deepEqual(Trainer.restore(JSON.parse(JSON.stringify(t.snapshot()))).state(),t.state());
  t.new_hand();finishTrainer(t);assert.deepEqual(Trainer.restore(JSON.parse(JSON.stringify(t.snapshot()))).state(),t.state());
  for(const bad of [null,{}, {version:2,trainer:{}}, {version:1,trainer:{}}])assert.throws(()=>Trainer.restore(bad));
  const bad=t.snapshot();bad.trainer.hand.players[0].stack++;assert.throws(()=>Trainer.restore(bad));
});

test('unopened SB uses a wide chart and 3 BB sizing, while isolation stays tighter', () => {
  const chart = opening_range('SB');
  assert.equal(chart.raise_percent, 47.5);
  assert.ok(chart.raise_combos > opening_range('BTN').raise_combos);
  for (const hole of ['2c 2d', 'Ac 2d', 'Kc 2c', 'Qc 7c', 'Jc 7c']) {
    const h = hand();
    while (h.position(h.actor) !== 'SB') h.action('fold');
    h.holes[h.actor] = cards(hole);
    const result = advice(h, h.actor, 40, new Random(9));
    assert.equal(result.action, 'raise', hole);
    assert.equal(result.target, 3);
    assert.equal(result.range.raise_percent, chart.raise_percent);
    assert.equal(result.range.cells.find(c => c.hand === hand_class(cards(hole))).raise, true);
  }
  assert.equal(opening_hand(cards('7c 2d'), 'SB'), false);
  const h = hand(); h.action('call');
  while (h.position(h.actor) !== 'SB') h.action('fold');
  h.holes[h.actor] = cards('Ac 2d');
  const result = advice(h, h.actor, 40, new Random(9));
  assert.equal(result.action, 'fold');
  assert.equal(result.range.raise_percent, 26.7);
  assert.equal(result.range.title, 'SB isolation range');
});

test('six-max unopened charts use the agreed baseline and preserve isolation', () => {
  const cases = [
    ['UTG', 236, 118, 'Ac 2c', 'Kc 8c'],
    ['HJ', 302, 156, 'Kc Td', 'Ac 9d'],
    ['CO', 402, 260, 'Ac 8d', 'Qc 9d'],
    ['BTN', 594, 390, 'Qc 2c', 'Kc 7d'],
    ['SB', 630, 354, 'Kc 7d', '7c 2d']
  ];
  for (const [position, combos, isolationCombos, included, excluded] of cases) {
    const chart = opening_range(position);
    assert.equal(chart.raise_combos, combos, position);
    assert.equal(opening_range(position, true).raise_combos, isolationCombos);
    assert.equal(opening_hand(cards(excluded), position), false);
    const h = hand();
    while (h.position(h.actor) !== position) h.action('fold');
    h.holes[h.actor] = cards(included);
    const result = advice(h, h.actor, 40, new Random(9));
    assert.equal(result.action, 'raise', position);
    assert.equal(result.target, position === 'SB' ? 3 : 2.5);
    assert.equal(result.range.raise_combos, combos);
    assert.equal(result.range.cells.find(c => c.hand === hand_class(cards(included))).raise, true);
  }
});

test('bots never turn an unopened chart raise into a limp, including SB', () => {
  for (const position of ['UTG', 'SB']) {
    let h;
    for (let seed = 0; seed < 1000; seed++) {
      const candidate = new Hand(new Random(seed));
      while (candidate.position(candidate.actor) !== position) candidate.action('fold');
      if (opening_hand(candidate.holes[candidate.actor], position)) { h = candidate; break; }
    }
    assert.ok(h);
    const t = new Trainer(0, 40); t.hand = h;
    // Force the random passive substitution whenever it is allowed.
    t.bot_rng.random = () => 0;
    t._advance();
    const firstEntry = h.history.find(e => e.kind !== 'fold');
    assert.equal(firstEntry.position, position);
    assert.equal(firstEntry.kind, 'raise');
    assert.equal((firstEntry.street_bet + firstEntry.amount) / 2, position === 'SB' ? 3 : 2.5);
  }
});

test('bots retain passive variation when raising over an existing limper', () => {
  let h;
  for (let seed = 0; seed < 1000; seed++) {
    const candidate = new Hand(new Random(seed)); candidate.action('call');
    if (opening_hand(candidate.holes[candidate.actor], 'HJ', true)) { h = candidate; break; }
  }
  assert.ok(h);
  const t = new Trainer(0, 40); t.hand = h; t.bot_rng.random = () => 0;
  t._advance();
  assert.equal(h.history[1].position, 'HJ');
  assert.equal(h.history[1].kind, 'call');
});
