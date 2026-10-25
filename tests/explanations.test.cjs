'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {advice,Random,decision_review,Trainer}=require('../engine.js');
const {scenarioHand}=require('../scripts/evaluate-preflop.cjs');
const {observationHand}=require('../scripts/evaluate-coach.cjs');
const preflop=require('./fixtures/preflop-decisions.json');
const reviewed=require('./fixtures/coach-decisions.json');
function pre(id){const h=scenarioHand(preflop.cases.find(x=>x.id===id));return {h,r:advice(h,h.actor,160,new Random(11))};}
function checkDetails(r){
  const e=r.explanation;
  assert.ok(e.situation&&e.why);assert.doesNotMatch(JSON.stringify(e),/undefined|NaN/);
  assert.equal(r.reason,`${e.situation} ${e.why}`);
  if(r.graded===false){assert.equal(e.alternatives.length,0);assert.match(e.coverage,/not graded/);return;}
  assert.deepEqual(e.alternatives.map(x=>x.action).sort(),r.accepted.filter(a=>a!==r.action).sort());
  for(const a of e.alternatives){assert.ok(a.reason.length>30);assert.match(a.label,/also reasonable/);}
  assert.equal(e.sizing!==null,r.action==='raise');
}
test('every preflop specification explains exactly the accepted alternatives',()=>{
  for(const item of preflop.cases){const h=scenarioHand(item),r=advice(h,h.actor,160,new Random(11));checkDetails(r);}
});
test('TT defense explains the earlier range, posted blind and raising alternative',()=>{
  const {r}=pre('bb-tt-vs-utg');
  assert.match(r.explanation.situation,/TT.*BB.*UTG.*2.5 BB/);
  assert.match(r.explanation.why,/showdown value.*tighter early-position/);
  assert.match(r.explanation.why,/posted big blind/);
  assert.equal(r.explanation.alternatives[0].action,'raise');
});
test('ATs aggression explains live players and the accepted call',()=>{
  const {r}=pre('btn-ats-vs-co');
  assert.match(r.explanation.why,/value three-bet/);assert.match(r.explanation.why,/2 players.*reraise/);
  assert.match(r.explanation.alternatives[0].reason,/playability/);
  assert.match(r.explanation.sizing,/8 BB.*Position/);
  assert.equal(decision_review(r,'call').explanation,r.explanation.alternatives[0].reason);
});
test('offsuit-ace folds explain domination and small-blind position',()=>{
  const {r}=pre('sb-a9o-vs-hj');assert.match(r.explanation.why,/Higher aces can dominate/);
  assert.match(r.explanation.why,/act first/);assert.equal(r.explanation.alternatives.length,0);
  const opening=pre('co-a4o').r;assert.match(opening.explanation.why,/offsuit ace.*flush potential/);
});
test('selective suited-ace bluff is not described as a mandatory value raise',()=>{
  const {r}=pre('btn-a5s-bluff');assert.match(r.explanation.why,/selective three-bet/);
  assert.match(r.explanation.why,/ace removes.*AA and AK/);
  assert.doesNotMatch(r.explanation.why,/value three-bet/);
  assert.deepEqual(r.explanation.alternatives.map(a=>a.action),['fold']);
});
test('premium cold four-bet explains both raisers and the cost of cold-calling',()=>{
  const {r}=pre('bb-aks-cold-fourbet-utg');assert.match(r.explanation.situation,/UTG opened and HJ three-bet/);
  assert.match(r.explanation.why,/premium cold-four-bet.*original opener.*three-bettor/);
  assert.match(r.explanation.why,/calling leaves the opener/);
});
test('squeezes explain callers and use the larger suggested size',()=>{
  const {r}=pre('bb-aks-squeeze');assert.match(r.explanation.situation,/1 caller/);
  assert.match(r.explanation.why,/dead money.*multiway/);
  assert.match(r.explanation.sizing,/12.5 BB.*extra chips for the callers/);
});
test('unsupported explanations identify depth, price or sequence rather than judging alternatives',()=>{
  const depth=pre('short-stack-unsupported').r;assert.match(depth.explanation.coverage,/25 BB.*75 BB/);
  assert.match(decision_review(depth,'call').explanation,/25 BB/);
  assert.match(pre('deep-stack-unsupported').r.explanation.coverage,/200 BB.*150 BB/);
  assert.match(pre('oversized-open-unsupported').r.explanation.coverage,/8 BB.*2–3.5 BB/);
  assert.match(pre('backraise-unsupported').r.explanation.coverage,/already called/);
});
test('unopened ranges explain remaining players and correct minimum pair',()=>{
  const {r}=pre('hj-kto');assert.match(r.explanation.why,/KTo.*HJ opening range.*4 players remain/);
  assert.match(pre('utg-22').r.explanation.why,/starts at 55/);
  const h=scenarioHand({id:'isolation',hero:'HJ',cards:'4c 4d',actions:[['UTG','call']]});
  const isolated=advice(h,h.actor,160,new Random(11));
  assert.equal(isolated.action,'fold');assert.match(isolated.explanation.why,/isolation baseline.*55/);
});
test('all existing reviewed observations explain public hands and preserve accepted alternatives',()=>{
  for(const item of reviewed.cases){
    const h=observationHand(item.observation),r=advice(h,h.actor,320,new Random(10000+item.hand));
    checkDetails(r);
    if(h.street){assert.ok(r.explanation.situation.includes(h.board.join(' ')));assert.match(r.explanation.situation,/best hand/);}
  }
});
test('earlier-street calling explanations compare equity, price and future betting',()=>{
  const item=reviewed.cases.find(c=>c.observation.street>0&&c.observation.street<3);
  assert.ok(item);const h=observationHand(item.observation),r=advice(h,h.actor,320,new Random(10000+item.hand));
  assert.ok(['call','fold'].includes(r.action));assert.match(r.explanation.why,/estimate is .*%.*calling requirement.*future betting/);
});
test('explanations use no private opponent cards or future runout',()=>{
  const {h,r}=pre('bb-aks-cold-fourbet-utg');
  h.deck=['invalid'];h.holes=h.holes.map((cards,i)=>i===h.actor?cards:['invalid','invalid']);
  assert.deepEqual(advice(h,h.actor,160,new Random(11)),r);
});
test('saved current advice without explanation is enriched without consuming RNG or losing history',()=>{
  const t=new Trainer(42,40);t.new_hand();const saved=JSON.parse(JSON.stringify(t.snapshot()));
  delete saved.trainer.pending.explanation;
  const restored=Trainer.restore(saved);
  assert.ok(restored.pending.explanation);assert.deepEqual(restored.hand.history,t.hand.history);
  assert.equal(restored.coach_rng.value,t.coach_rng.value);
  for(const field of ['action','accepted','target','equity','confidence'])assert.deepEqual(restored.pending[field],t.pending[field]);
});
