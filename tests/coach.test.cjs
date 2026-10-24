'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Hand, Trainer, Random, DECK, advice, opponent_range, range_equity, river_values, river_response, decision_review} = require('../engine.js');
const {observationHand} = require('../scripts/evaluate-coach.cjs');
const fixture = require('./fixtures/coach-decisions.json');
function riverHand(hole, board, bet = 10, stacks = [100,100]) {
  const players = stacks.map((stack, i) => ({stack: (stack - (i ? bet : 0)) * 2, street_bet: i ? bet * 2 : 0, contributed: (10 + (i ? bet : 0)) * 2, folded: false}));
  return Object.assign(Object.create(Hand.prototype), {n:2, button:0, sb:0, bb_seat:1, actor:0, street:3, board:board.split(' '), holes:[hole.split(' '),[]], players,
    current_bet:bet*2, last_full_raise:Math.max(2,bet*2), acted_at:[null,bet*2], pending:new Set([0]), history:[], done:false});
}
function exactDraw(hand, holdings) {
  return {exact:true,ranges:[{opponent:1}],scenarios:holdings.map(([cards,weight]) => ({holes:{1:cards.split(' ')},board:hand.board,weight,uniforms:[0.5,0.5]}))};
}
function best(values) { return values.slice().sort((a,b)=>b.ev_bb-a.ev_bb)[0]; }

test('public history records accepted actions without private cards', () => {
  const t=new Trainer(9182,40);
  for(let i=0;i<20;i++) {
    t.new_hand(i%2?'mixed':'equal');
    while(!t.hand.done)t.act(t.pending.action,t.pending.target);
    assert.ok(t.hand.history.every(e=>!('holes' in e)&&!('deck' in e)));
  }
  const h=new Hand(new Random(2)); const before=JSON.stringify(h.history);
  assert.throws(()=>h.action('raise',3)); assert.equal(JSON.stringify(h.history),before);
});

test('a three-bet shifts range mass to premium hands but preserves bluffs', () => {
  const h=riverHand('7c 2d','Ac Kc Qc Jc 3d'); h.street=0;h.board=[];
  h.history=[{actor:1,street:0,board:[],position:'BTN',kind:'raise',raises:1,to_call:5,amount:15,pot:10}];
  const range=opponent_range(h,0,1);
  const weight=cards=>range.items.find(x=>x.pair.every(c=>cards.includes(c))).weight;
  assert.ok(weight(['As','Ah'])>weight(['8c','3d'])*20);
  assert.ok(weight(['As','Kd'])>weight(['8c','3d'])*5);
  assert.ok(weight(['As','5s'])>0);
});

test('weighted samples never overlap cards or consult opponents actual holes', () => {
  const item=fixture.cases.find(c=>c.hand===911),h=observationHand(item.observation);
  const result=range_equity(h,h.actor,120,new Random(88));
  for(const s of result.scenarios) {
    const cards=[...h.holes[h.actor],...s.board,...Object.values(s.holes).flat()];
    assert.equal(new Set(cards).size,cards.length);
  }
  const a=advice(h,h.actor,160,new Random(19));
  h.holes=h.holes.map((cards,i)=>i===h.actor?cards:['Ac','Ac']);h.deck=['invalid'];
  assert.deepEqual(advice(h,h.actor,160,new Random(19)),a);
});

test('river calls use exact equity and positive pot odds for a bluff catcher', () => {
  const h=riverHand('Kh Kd','Ac Qh 9s 6d 2c');
  const draw=exactDraw(h,[['Jc Th',0.65],['As Js',0.35]]);
  const values=river_values(h,0,draw);
  assert.equal(best(values).action,'call');
  assert.ok(Math.abs(values.find(v=>v.action==='call').ev_bb-16)<1e-9);
  assert.equal(values.find(v=>v.action==='fold').ev_bb,0);
});

test('value raises remain available for top pair and the nuts', () => {
  for(const [hole,board,villain] of [['Ac Kh','Kd 8c 4h 2s 3d','Kc Qh'],['Tc 3d','Ac Kc Qc Jc 2d','2h 2s']]) {
    const h=riverHand(hole,board);
    const values=river_values(h,0,exactDraw(h,[[villain,1]]));
    assert.equal(best(values).action,'raise');
    assert.ok(best(values).ev_bb>values.find(v=>v.action==='call').ev_bb);
  }
});

test('river showdown values refund unmatched chips and respect stack caps', () => {
  const h=riverHand('Tc 3d','Ac Kc Qc Jc 2d',10,[100,12]);
  const values=river_values(h,0,exactDraw(h,[['2h 2s',1]]));
  // Pot before action is 30 BB. Villain can add only 2 BB more.
  assert.ok(values.every(v=>v.ev_bb<=32+1e-9));
  assert.equal(best(values).action,'raise');
  assert.ok(best(values).target<=20); // minimum legal raise, with excess refunded
});

test('weak bluff-catchers avoid escalating against strong ranges', () => {
  for(const number of [96,317,343,462,523,639,647,649,853,883,911,969]) {
    const h=observationHand(fixture.cases.find(c=>c.hand===number).observation);
    const report=advice(h,h.actor,320,new Random(10000+number));
    assert.equal(report.action,'fold',`Hand ${number}`);
    assert.ok(!report.accepted.includes('raise'),`Hand ${number} accepts a raise`);
  }
});

test('range sensitivity permits alternatives for a close river decision', () => {
  const h=observationHand(fixture.cases.find(c=>c.hand===196).observation);
  const report=advice(h,h.actor,320,new Random(10196));
  assert.equal(report.confidence,'close');
  assert.deepEqual(report.accepted,['call','fold']);
  assert.ok(report.uncertainty_note);
});

test('opponent actions use a separate random stream from coaching', () => {
  const one=new Trainer(9182,160),two=new Trainer(9182,160);
  two.coach_rng.value=12345;
  for(let number=0;number<12;number++) {
    one.new_hand();two.new_hand();
    assert.deepEqual(one.hand.history,two.hand.history);
    while(!one.hand.done) {
      const action=one.pending.action,target=one.pending.target;
      one.act(action,target);two.act(action,target);
      assert.deepEqual(one.hand.history,two.hand.history);
      assert.equal(one.bot_rng.value,two.bot_rng.value);
    }
  }
});

test('cheap calls are not rejected merely because the hand usually loses', () => {
  const h=riverHand('Kh Kd','Ac Qh 9s 6d 2c',0.5);
  const values=river_values(h,0,exactDraw(h,[['Jc Th',0.05],['As Js',0.95]]));
  assert.equal(best(values).action,'call');
  assert.ok(values.find(v=>v.action==='call').ev_bb>0);
});

test('river side-pot value excludes the main pot won by a shorter opponent', () => {
  const h=riverHand('Kc Kd','2c 3d 7h 9s Jc');
  h.n=3;h.holes.push([]);h.players=[{stack:200,street_bet:0,contributed:20,folded:false},{stack:0,street_bet:0,contributed:20,folded:false},{stack:180,street_bet:20,contributed:40,folded:false}];
  h.acted_at=[null,null,20];h.pending=new Set([0]);
  const draw={exact:false,ranges:[{opponent:1},{opponent:2}],scenarios:[{holes:{1:['As','Ah'],2:['Qc','Qd']},board:h.board,weight:1,uniforms:[0.5,0.5,0.5]}]};
  const values=river_values(h,0,draw);
  assert.equal(values.find(v=>v.action==='call').ev_bb,10);
  assert.ok(values.every(v=>Number.isFinite(v.ev_bb)));
});

test('river odd chips go left of the button after identical eligibility layers merge', () => {
  const h=riverHand('2d 3d','Ac Kc Qc Jc Tc',0);
  h.n=3;h.holes.push([]);h.players=[{stack:100,street_bet:0,contributed:3,folded:false},{stack:0,street_bet:0,contributed:1,folded:true},{stack:100,street_bet:0,contributed:3,folded:false}];
  h.acted_at=[null,null,0];h.pending=new Set([0]);
  const draw={exact:true,ranges:[{opponent:2}],scenarios:[{holes:{2:['4d','5d']},board:h.board,weight:1,uniforms:[0.5,0.5,0.5]}]};
  assert.equal(river_values(h,0,draw).find(v=>v.action==='check').ev_bb,1.5);
});

test('an unbeatable river hand never receives fold advice under any sensitivity model', () => {
  const h=riverHand('Tc 3d','Ac Kc Qc Jc 2d');
  const report=advice(h,0,160,new Random(3));
  assert.notEqual(report.action,'fold');
  assert.ok(!report.accepted.includes('fold'));
  assert.ok(report.action_values.every(v=>Number.isFinite(v.ev_bb)));
});

test('the engine loads as a browser worker script and resumes a saved decision', () => {
  const fs=require('node:fs'),vm=require('node:vm');
  let message;
  const scope={self:{postMessage:value=>{message=value}},crypto:{getRandomValues:array=>{array[0]=9182;return array}}};
  vm.createContext(scope);
  scope.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),scope));
  vm.runInContext(fs.readFileSync(require.resolve('../game-worker.js'),'utf8'),scope);
  scope.self.onmessage({data:{id:1,path:'init'}});
  assert.ok(!message.error);
  scope.self.onmessage({data:{id:2,path:'new'}});
  assert.ok(!message.error);
  const saved=message.saved;
  scope.self.onmessage({data:{id:3,path:'init',body:{saved}}});
  assert.ok(!message.error);
  assert.equal(message.saved.trainer.hand.history.length,saved.trainer.hand.history.length);
});

function fourSpadeRiver() {
  const h=new Hand(new Random(1),0);
  h.holes=[['Ad','5h'],['2c','3c'],['Ah','6c'],['2d','3d'],['2h','3h'],['7c','9c']];
  const runout=['Tc','Qs','As','Jh','Td','8s','Th','4s'];
  h.deck=DECK.filter(c=>!h.holes.flat().includes(c)&&!runout.includes(c)).concat(runout.slice().reverse());
  for(const [action,target] of [['fold'],['fold'],['fold'],['raise',5],['fold'],['call'],['raise',6],['call'],['check'],['check'],['check']])h.action(action,target);
  return h;
}
test('reviewed four-spade river accepts a free showdown and grades it as reasonable',()=>{
  const h=fourSpadeRiver(),report=advice(h,0,160,new Random(55));
  assert.equal(h.pot/2,11.5);
  assert.deepEqual(h.board,['Qs','As','Jh','8s','4s']);
  assert.equal(report.action,'check');
  assert.ok(report.accepted.includes('check'));
  assert.equal(report.confidence,'close');
  assert.ok(report.range_sensitivity.some(x=>x.model==='sticky'));
  const check=report.action_values.find(x=>x.action==='check');
  const tiny=report.action_values.find(x=>x.action==='raise'&&x.target===1&&x.plan==='fold_to_reraise');
  assert.ok(tiny);assert.ok(tiny.ev_bb-check.ev_bb<0.25);
  const t=new Trainer(55,40);t.hand=h;t.hand_number=1;t.hand_timestamp='2026/10/23 00:00:00 UTC';t.pending=report;
  const result=t.act('check');
  assert.equal(result.feedback[0].correct,true);
  assert.equal(result.stats.correct,1);
  assert.equal(result.feedback[0].confidence,'close');
});
test('river advice depends on public actions, not the revealed opponent holding',()=>{
  const h=fourSpadeRiver(),before=advice(h,0,160,new Random(55));
  h.holes[2]=['Ks','Ts'];
  assert.deepEqual(advice(h,0,160,new Random(55)),before);
});
test('clear river value bets remain recommended and tiny sizes remain available',()=>{
  const h=riverHand('Tc 3d','Ac Kc Qc Jc 2d',0);
  const report=advice(h,0,160,new Random(55));
  assert.equal(report.action,'raise');
  assert.ok(!report.accepted.includes('check'));
  assert.ok(report.action_values.some(x=>x.action==='raise'&&x.target===1));
});

const decisionCase=id=>fixture.cases.find(c=>c.id===id);
const decisionHand=id=>observationHand(decisionCase(id).observation);
for(const id of ['river-top-pair-reraise','river-thin-value-paired-board','river-top-pair-connected-board','river-underpair-raise'])test(`${id} prefers a call to a model-sensitive raise`,()=>{
  const report=advice(decisionHand(id),0,160,new Random(20000+decisionCase(id).hand));
  assert.equal(report.action,'call');
  assert.equal(report.target,null);
  assert.ok(report.accepted.includes('call'));
  assert.equal(report.confidence,'close');
  assert.ok(report.range_sensitivity.some(x=>x.model==='sticky'));
  assert.ok(report.action_values.filter(x=>x.action==='raise').every(x=>Number.isFinite(x.worst_case_advantage_bb)));
});
test('two-pair river accepts calling and rejects the fragile many-pot shove plan',()=>{
  const h=decisionHand('river-two-pair-overbet'),report=advice(h,0,160,new Random(20977));
  assert.equal(report.action,'call');
  assert.ok(report.accepted.includes('call'));
  const shoves=report.action_values.filter(x=>x.target===98);
  assert.ok(shoves.length,'All-in remains a legal candidate');
  assert.ok(shoves.every(x=>x.worst_case_advantage_bb<0));
});
test('facing a preflop three-bet uses more samples and permits reasonable alternatives',()=>{
  for(const seed of [1,20884,5000]){
    const report=advice(decisionHand('preflop-suited-gap-defense'),0,160,new Random(seed));
    assert.ok(report.samples>=2048);
    assert.equal(report.requested_samples,160);
    assert.deepEqual(report.accepted,['call','fold']);
    assert.equal(report.confidence,'close');
    assert.equal(report.range_sensitivity.length,2);
  }
});
test('reviewed decisions use no opponents private cards or future deck',()=>{
  for(const id of ['preflop-suited-gap-defense','river-two-pair-overbet']){
    const h=decisionHand(id),before=advice(h,0,160,new Random(22));
    h.holes=h.holes.map((cards,i)=>i===0?cards:['Ac','Ac']);h.deck=['invalid'];
    assert.deepEqual(advice(h,0,160,new Random(22)),before);
  }
});
test('overbet response correction preserves profitable nut value shoves',()=>{
  const h=decisionHand('river-two-pair-overbet');h.holes[0]=['8c','Tc']; // Nut straight on the reviewed board.
  const report=advice(h,0,160,new Random(20977));
  assert.equal(report.action,'raise');
  const shove=report.action_values.find(x=>x.target===98);
  assert.ok(shove.worst_case_advantage_bb>0);
});
test('a profitable modeled bluff remains available with little showdown value',()=>{
  const h=decisionHand('river-two-pair-overbet');h.holes[0]=['3c','4d'];
  const draw={exact:true,ranges:[{opponent:5}],scenarios:[{holes:{5:['2c','5d']},board:h.board,weight:1,uniforms:Array(6).fill(0.5)}]};
  const values=river_values(h,0,draw);
  const call=values.find(v=>v.action==='call');
  assert.ok(call.ev_bb<0);
  assert.ok(values.some(v=>v.action==='raise'&&v.ev_bb>0));
});

test('aces on the three-club river prefer a call when strong hands are more concentrated',()=>{
  const report=advice(decisionHand('river-overpair-flush-board'),0,160,new Random(10440));
  assert.equal(report.action,'call');assert.equal(report.target,null);
  assert.equal(report.confidence,'close');
  assert.deepEqual(report.accepted,['call','raise']);
  const stress=report.range_sensitivity.find(x=>x.model==='value-heavy');
  assert.equal(stress.action,'call');assert.ok(stress.equity<report.equity);
  const raise=report.action_values.find(x=>x.target===24&&x.plan==='fold_to_reraise');
  assert.ok(raise.worst_case_advantage_bb<0);
});
test('moderate two-pair value remains plausible but calling is accepted under response stress',()=>{
  const report=advice(decisionHand('river-two-pair-value'),0,160,new Random(10977));
  assert.equal(report.action,'call');
  assert.ok(report.accepted.includes('call'));
  // This remains a value raise under the original strong-made-hand model;
  // its recommendation changes because the new response stress is unfavorable.
  assert.equal(report.range_sensitivity.find(x=>x.model==='value-heavy').action,'raise');
  assert.ok(report.action_values.some(x=>x.target===15&&x.ev_bb>report.action_values.find(v=>v.action==='call').ev_bb));
});
test('a marginal A9o preflop defense remains call-or-fold',()=>{
  const report=advice(decisionHand('preflop-weak-ace-defense'),0,160,new Random(10991));
  assert.deepEqual(report.accepted,['call','fold']);
  assert.equal(report.confidence,'close');assert.ok(report.samples>=2048);
  const h=decisionHand('preflop-weak-ace-defense'),opponent=h.live.find(i=>i!==0);
  assert.deepEqual(opponent_range(h,0,opponent,'value-heavy').items,opponent_range(h,0,opponent,'balanced').items);
});
test('made-hand stress uses public information and preserves normalized exact river scenarios',()=>{
  const h=decisionHand('river-overpair-flush-board'),before=advice(h,0,160,new Random(10440));
  h.holes=h.holes.map((cards,i)=>i===0?cards:['Ac','Ac']);h.deck=['invalid'];
  assert.deepEqual(advice(h,0,160,new Random(10440)),before);
  const draw=range_equity(h,0,160,new Random(10440),'value-heavy');
  assert.equal(draw.exact,true);
  assert.ok(Math.abs(draw.scenarios.reduce((n,s)=>n+s.weight,0)-1)<1e-10);
  for(const s of draw.scenarios){
    const cards=[...h.holes[0],...h.board,...Object.values(s.holes).flat()];
    assert.equal(new Set(cards).size,cards.length);
  }
});

test('review labels preserve accepted and close actions and require robust evidence for big mistakes', () => {
  const base = {accepted: ['call'], confidence: 'clear', reason: 'Prefer calling.'};
  assert.equal(decision_review(base, 'call').level, 'good');
  assert.equal(decision_review({...base, confidence: 'close'}, 'call').level, 'close');
  assert.equal(decision_review(base, 'fold').level, 'mistake');
  const evidence = {losses: {fold: 8}, threshold_bb: 2, models: 7};
  assert.equal(decision_review({...base, review_evidence: evidence}, 'fold').level, 'big-mistake');
  for (const altered of [{...evidence, models: 4}, {...evidence, losses: {fold: 1}}, {...evidence, losses: {fold: 2}}, {...evidence, losses: {fold: -1}}, {...evidence, losses: {}}])
    assert.equal(decision_review({...base, review_evidence: altered}, 'fold').level, 'mistake');
  assert.equal(decision_review({...base, review_evidence: evidence, accepted: ['call', 'fold'], confidence: 'close'}, 'fold').level, 'close');
});

test('exact river values flag folding the nuts; preflop chart errors remain ordinary mistakes', () => {
  const h = riverHand('Tc 3d', 'Ac Kc Qc Jc 2d');
  const report = advice(h, 0, 40, new Random(9));
  assert.equal(report.review_evidence.models, 7);
  assert.equal(decision_review(report, 'fold').level, 'big-mistake');
  const preflop = new Hand(new Random(5));
  const opening = advice(preflop, preflop.actor, 40, new Random(9));
  assert.equal(opening.review_evidence, null);
  const rejected = ['raise', 'call', 'fold'].find(action => !opening.accepted.includes(action));
  assert.equal(decision_review(opening, rejected).level, 'mistake');
});

test('completed decisions carry a review label through saved sessions', () => {
  const t = new Trainer(0, 40); t.new_hand();
  t.act(t.pending.action, t.pending.target);
  assert.ok(['good', 'close'].includes(t.feedback[0].review.level));
  assert.deepEqual(Trainer.restore(JSON.parse(JSON.stringify(t.snapshot()))).feedback[0].review, t.feedback[0].review);
});

test('reviewed river raises accept calling under normal-reraise pressure', () => {
  for (const id of ['river-at-fragile-raise', 'river-j7-fragile-raise', 'river-j8-fragile-sizing']) {
    const item = fixture.cases.find(c => c.id === id), h = observationHand(item.observation);
    const report = advice(h, h.actor, 320, new Random(10000 + item.hand));
    assert.ok(report.accepted.includes('call'), id);
    assert.ok(report.range_sensitivity.some(m => m.model === 'bot-policy'), id);
  }
});

test('reviewed small three-bet defenses preserve close call and fold alternatives', () => {
  for (const id of ['utg-a6s-small-button-threebet', 'utg-a4s-small-sb-threebet']) {
    const item = fixture.cases.find(c => c.id === id), h = observationHand(item.observation);
    const report = advice(h, h.actor, 5000, new Random(10000 + item.hand));
    assert.deepEqual(report.accepted, ['call', 'fold'], id);
    assert.equal(report.confidence, 'close');
  }
});

test('bot-policy river response includes legal normal reraises without private cards', () => {
  const item = fixture.cases.find(c => c.id === 'river-at-fragile-raise');
  const h = observationHand(item.observation), opponent = h.live.find(i => i !== h.actor);
  const response = river_response(h, h.actor, opponent, ['As', '9s'], 48, 'bot-policy');
  assert.equal(response.reraise_to, 144); // raise to 24 BB, reraise to 72 BB
  assert.ok(response.reraise > 0.5);
  assert.equal(response.shove, 0);
  assert.ok(Math.abs(response.fold + response.call + response.reraise + response.shove - 1) < 1e-10);
  h.holes[opponent] = ['invalid']; h.deck = ['invalid'];
  assert.deepEqual(river_response(h, h.actor, opponent, ['As', '9s'], 48, 'bot-policy'), response);
  // A short all-in increase does not reopen betting for a player who already acted.
  h.last_full_raise = 24; h.acted_at[opponent] = 24;
  assert.equal(river_response(h, h.actor, opponent, ['As', '9s'], 30, 'bot-policy').reraise, 0);
  // No reraise is possible when the raiser has already committed its stack.
  h.players[h.actor].stack = 48 - h.players[h.actor].street_bet;
  assert.equal(river_response(h, h.actor, opponent, ['As', '9s'], 48, 'bot-policy').reraise, 0);
});

test('normal-reraise settlement values calling and folding separately and respects short stacks', () => {
  const h = riverHand('Ac Kh', 'Kd 8c 4h 2s 3d');
  const draw = exactDraw(h, [['Kc Qh', 1]]);
  const values = river_values(h, 0, draw, 'bot-policy');
  const fold = values.find(v => v.action === 'raise' && v.target === 20 && v.plan === 'fold_to_reraise');
  const call = values.find(v => v.action === 'raise' && v.target === 20 && v.plan === 'call_reraise');
  assert.ok(call.ev_bb > fold.ev_bb + 20);
  assert.ok(best(values).ev_bb > values.find(v => v.action === 'call').ev_bb);
  h.players[1].stack = 4;
  const short = river_values(h, 0, draw, 'bot-policy');
  assert.ok(short.every(v => v.ev_bb <= 32 + 1e-9));
});

test('strong two-pair value raises remain available across the expanded response models', () => {
  const h = riverHand('Ac Kh', 'Ad Kc 8h 4s 2d');
  const report = advice(h, 0, 160, new Random(54));
  assert.equal(report.action, 'raise');
  assert.ok(report.action_values.some(v => v.action === 'raise' && v.worst_case_advantage_bb > Math.max(0.25, h.pot / 2 * 0.02)));
});

test('bot response stress agrees with the independent sampled response diagnostic', () => {
  const item = fixture.cases.find(c => c.id === 'river-at-fragile-raise');
  const h = observationHand(item.observation), opponent = h.live.find(i => i !== h.actor);
  const range = opponent_range(h, h.actor, opponent);
  const reraiseProbability = range.items.reduce((p, x) => p + x.weight / range.total * river_response(h, h.actor, opponent, x.pair, 48, 'bot-policy').reraise, 0);
  // The independent 2,000-holding experiment ran opponent_advice with 53
  // samples, then applied the 12% passive substitution: 63.1% reraises.
  assert.ok(Math.abs(reraiseProbability - 0.631) < 0.04, reraiseProbability);
});
