'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Hand,Trainer,Random,advice,preflop_context,decision_review,in_preflop_range,PREFLOP_RESPONSES,COACH_VERSION} = require('../engine.js');
const {scenarioHand,checkReport,evaluatePreflop} = require('../scripts/evaluate-preflop.cjs');
const fixture = require('./fixtures/preflop-decisions.json');
for(const item of fixture.cases) test(`preflop specification: ${item.id}`,()=>{
  const h=scenarioHand(item),r=advice(h,h.actor,160,new Random(1907));
  assert.deepEqual(checkReport(item,r,h),[]);
  assert.equal(r.samples,0);assert.equal(r.equity,null);
});
test('evaluation reports failures and covers both development and contrast cases',()=>{
  const result=evaluatePreflop();
  assert.equal(result.failed,0);assert.equal(result.runs,fixture.cases.length*3);
  assert.ok(result.results.some(r=>r.split==='holdout'));
  const item=fixture.cases.find(c=>c.id==='btn-ats-vs-co'),h=scenarioHand(item),r=advice(h,h.actor,160,new Random(2));
  assert.ok(checkReport(item,{...r,action:'fold',accepted:['fold']},h).length);
});
test('range notation has fixed-high-card plus semantics and valid tokens',()=>{
  assert.ok(in_preflop_range(['Kh','Th'],'K9s+'));
  assert.ok(!in_preflop_range(['Ah','Th'],'K9s+'));
  assert.ok(!in_preflop_range(['Kh','Td'],'K9s+'));
  assert.ok(in_preflop_range(['Th','Td'],'99+'));
  for(const row of Object.values(PREFLOP_RESPONSES))for(const notation of Object.values(row))for(const token of notation.split(/\s+/).filter(Boolean)){
    assert.match(token,/^(?:([2-9TJQKA])\1\+?|[2-9TJQKA]{2}[so]\+?)$/);
  }
});
test('all 169 hand classes produce legal, deterministic decisions across positional matchups',()=>{
  const positions=['UTG','HJ','CO','BTN','SB','BB'];
  let covered=0;
  for(let open=0;open<5;open++)for(let hero=open+1;hero<6;hero++){
    const item={id:'sweep',hero:positions[hero],cards:'Ac Kc',actions:[[positions[open],'raise',2.5]]};
    const h=scenarioHand(item),actor=h.actor;
    const ranks='AKQJT98765432';
    for(let a=0;a<13;a++)for(let b=0;b<13;b++){
      h.holes[actor]=[ranks[a]+'c',ranks[b]+(a<b?'c':'d')];
      const r=advice(h,actor,1,new Random(4));
      assert.equal(r.graded,true);assert.ok(r.accepted.includes(r.action));
      if(r.action==='raise'){assert.ok(r.target>=h.legal().min_to&&r.target<=h.legal().max_to);assert.ok(Number.isInteger(r.target*2));}
      assert.deepEqual(advice(h,actor,5000,new Random(100)),{...r,requested_samples:5000});
      covered++;
    }
  }
  assert.equal(covered,2535);
});
test('pending blinds are decision context, not guaranteed showdown opponents',()=>{
  const item=fixture.cases.find(c=>c.id==='btn-ats-vs-co'),h=scenarioHand(item),r=advice(h,h.actor,160,new Random(1));
  assert.equal(r.context.players_behind,2);assert.equal(r.action,'raise');
  h.holes=h.holes.map((hole,i)=>i===h.actor?hole:['invalid','invalid']);h.deck=['invalid'];
  assert.deepEqual(advice(h,h.actor,160,new Random(1)),r);
});
test('position and sizes use public targets and all involved opponents',()=>{
  const h=scenarioHand(fixture.cases.find(c=>c.id==='bb-aks-cold-fourbet-btn'));
  assert.equal(preflop_context(h,h.actor).in_position,false); // BTN remains involved, despite SB making the last raise.
  assert.equal(preflop_context(h,h.actor).open_to_bb,2.5);
  const sb=scenarioHand(fixture.cases.find(c=>c.id==='bb-tt-vs-sb'));
  assert.equal(preflop_context(sb,sb.actor).open_to_bb,2.5); // SB already contributed half a blind.
  assert.equal(preflop_context(sb,sb.actor).in_position,true);
});
test('unsupported recommendations do not affect accuracy or create mistake labels',()=>{
  const t=new Trainer(77,40),h=scenarioHand(fixture.cases.find(c=>c.id==='short-stack-unsupported'));
  // Rotate BB hero to trainer seat zero, preserving every indexed public field.
  const shift=4,rotate=i=>(i+shift)%6;
  for(const field of ['players','holes','starting_stacks','acted_at']){const values=h[field];h[field]=Array.from({length:6},(_,i)=>values[(i-shift+6)%6]);}
  for(const field of ['actor','button','sb','bb_seat'])h[field]=rotate(h[field]);
  h.pending=new Set([...h.pending].map(rotate));h.history=h.history.map(e=>({...e,actor:rotate(e.actor)}));
  h.assert_invariants();t.hand=h;t.hand_number=1;t.hand_timestamp='2026/10/24 00:00:00 UTC';t.pending=advice(h,0,40,t.coach_rng);
  const before=t.stats();t.act('call');
  assert.deepEqual(t.stats(),before);assert.equal(t.feedback[0].review.label,'Not graded');
  assert.equal(t.feedback[0].graded,false);
  assert.equal(decision_review(t.feedback[0],'raise').label,'Not graded');
});
test('legacy saved active sessions keep history and regenerate current coaching',()=>{
  const t=new Trainer(42,40);t.new_hand();
  const saved=JSON.parse(JSON.stringify(t.snapshot()));saved.trainer.pending.model='ranges-v1';
  saved.trainer.pending.action='fold';saved.trainer.pending.reason='old coach';
  const restored=Trainer.restore(saved);
  assert.equal(restored.pending.model,COACH_VERSION);assert.notEqual(restored.pending.reason,'old coach');
  assert.deepEqual(restored.hand.history,t.hand.history);assert.equal(restored.hand_number,t.hand_number);
  assert.deepEqual(restored.stats(),t.stats());assert.equal(restored.current_history(),t.current_history());
});
test('short all-ins respect reopening and minimum/maximum legal sizes',()=>{
  const h=new Hand(new Random(7),0,[200,200,200,200,14,18]);
  h.action('raise',10);h.action('allin');h.action('allin');
  for(let i=0;i<3;i++)h.action('call');
  h.holes[h.actor]=['Ac','Ad'];
  const r=advice(h,h.actor,160,new Random(2));
  assert.equal(r.graded,false);assert.equal(r.action,'raise');assert.ok(r.target>=h.legal().min_to&&r.target<=h.legal().max_to);
});

test('a premium hand with less than a blind available calls rather than folding',()=>{
  const h=new Hand(new Random(7),0,[200,200,200,1,200,200]);
  h.holes[h.actor]=['Ac','Ad'];
  const r=advice(h,h.actor,160,new Random(3));
  assert.equal(h.legal().raise,false);assert.equal(r.action,'call');assert.equal(r.graded,false);
  assert.equal(r.target,null);assert.deepEqual(r.accepted,['call']);
});

test('reported hand 65: Q6s may overcall BTN plus SB at 100 BB without a mistake label',()=>{
  const h=scenarioHand({id:'reported-65',hero:'BB',cards:'Qs 6s',actions:[['BTN','raise',2.5],['SB','call']]});
  const r=advice(h,h.actor,160,new Random(65));
  assert.equal(r.context.node,'squeeze');assert.equal(r.pot_odds,20);
  assert.equal(h.pending.size,1);assert.equal(r.graded,true);
  assert.deepEqual(r.accepted,['call','fold']);assert.equal(r.action,'call');
  assert.equal(decision_review(r,'call').level,'close');
  assert.match(r.explanation.why,/clos.*action/);
  assert.match(r.explanation.why,/1.5 BB.*20%/);
  assert.doesNotMatch(r.explanation.why,/outside the response range/);
});

test('hand 65 stays correct at the actual hero seat, including an older saved fold recommendation',()=>{
  const h=scenarioHand({id:'reported-65-seat',hero:'BB',cards:'Qs 6s',actions:[['BTN','raise',2.5],['SB','call']]});
  const shift=4,rotate=i=>(i+shift)%6;
  for(const field of ['players','holes','starting_stacks','acted_at']){
    const values=h[field];h[field]=Array.from({length:6},(_,i)=>values[(i-shift+6)%6]);
  }
  for(const field of ['actor','button','sb','bb_seat'])h[field]=rotate(h[field]);
  h.pending=new Set([...h.pending].map(rotate));h.history=h.history.map(e=>({...e,actor:rotate(e.actor)}));
  h.assert_invariants();assert.equal(h.actor,0);assert.equal(h.button,4);assert.equal(h.sb,5);
  const t=new Trainer(65,40);t.hand=h;t.hand_number=1;t.hand_timestamp='2026/10/25 02:51:58 UTC';
  t.pending={...advice(h,0,40,t.coach_rng),model:'ranges-v2',action:'fold',accepted:['fold']};
  const restored=Trainer.restore(JSON.parse(JSON.stringify(t.snapshot())));
  assert.deepEqual(restored.pending.accepted,['call','fold']);
  restored.act('call');
  assert.equal(restored.feedback[0].review.level,'close');assert.equal(restored.feedback[0].correct,true);
  assert.equal(restored.stats().decisions,1);assert.equal(restored.stats().correct,1);
});

test('closing-overcall alternatives do not use hidden cards or leak across price and position boundaries',()=>{
  for(const opener of ['UTG','CO','BTN'])for(const price of [2,2.5,3,3.5]){
    const h=scenarioHand({id:'overcall-boundaries',hero:'BB',cards:'Qs 6s',actions:[[opener,'raise',price],[opener==='BTN'?'SB':'BTN','call']]});
    const before=advice(h,h.actor,160,new Random(12));
    assert.equal(before.overcall===true,opener==='BTN'&&price<=3);
    h.holes=h.holes.map((cards,i)=>i===h.actor?cards:['invalid']);h.deck=['invalid'];
    assert.deepEqual(advice(h,h.actor,160,new Random(12)),before);
  }
});

test('reported hand 71: offsuit connectors may defend against a small button open',()=>{
  const h=scenarioHand({id:'reported-71',hero:'BB',cards:'8c 7h',actions:[['BTN','raise',2.5]]});
  const r=advice(h,h.actor,160,new Random(71));
  assert.equal(r.pot_odds,27.3);assert.equal(r.action,'call');
  assert.deepEqual(r.accepted,['call','fold']);assert.equal(decision_review(r,'call').level,'close');
  assert.match(r.explanation.why,/straight/);assert.match(r.explanation.why,/offsuit/);
  assert.doesNotMatch(r.explanation.why,/flush potential.*supports/);
});

test('hand 71 river call is assessed separately after the two checked streets',()=>{
  const h=scenarioHand({id:'reported-71-river',hero:'BB',cards:'8c 7h',actions:[['BTN','raise',2.5]]});
  const board=['4d','3h','Td','2c','7s'],rest=h.deck.filter(c=>!board.includes(c));
  const burns=[rest.pop(),rest.pop(),rest.pop()];
  h.deck=[...rest,...[burns[0],...board.slice(0,3),burns[1],board[3],burns[2],board[4]].reverse()];
  h.action('call');while(h.street<3)h.action('check');h.action('check');h.action('raise',6);
  assert.deepEqual(h.board,board);assert.equal(h.legal().call,3);
  const r=advice(h,h.actor,160,new Random(71));
  assert.equal(r.pot_odds,26.1);assert.ok(r.accepted.includes('call'));
  assert.equal(decision_review(r,'call').level,'close');
});

test('previous coach version three active advice is refreshed on restore',()=>{
  const t=new Trainer(71,40);t.new_hand();
  const saved=JSON.parse(JSON.stringify(t.snapshot()));saved.trainer.pending.model='ranges-v3';
  saved.trainer.pending.reason='outdated range';
  const restored=Trainer.restore(saved);
  assert.equal(restored.pending.model,COACH_VERSION);assert.notEqual(restored.pending.reason,'outdated range');
  assert.deepEqual(restored.current_history(),t.current_history());
});
