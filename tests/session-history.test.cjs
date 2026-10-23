'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Trainer}=require('../engine.js');
function finish(t){for(let n=0;!t.hand.done&&n<200;n++)t.act(t.hand.legal().check?'check':'call');assert.ok(t.hand.done)}
function copy(t){return JSON.parse(JSON.stringify(t.snapshot()))}
test('session history keeps completed hands once and includes the current hand across reloads',()=>{
  let t=new Trainer(200,40);t.new_hand();finish(t);
  const first=t.current_history();
  assert.match(first,/\*\*\* SUMMARY \*\*\*/);
  assert.equal(t.state().history_count,1);
  assert.equal(t.session_history(),first);
  t=Trainer.restore(copy(t));t.new_hand();
  assert.deepEqual(t.completed_histories,[first]);
  assert.equal(t.state().history_count,2);
  assert.equal(t.session_history().match(/Poker Classroom Hand #/g).length,2);
  assert.ok(t.session_history().startsWith(first));
  t=Trainer.restore(copy(t));finish(t);
  assert.equal(t.state().history_count,2);
  assert.equal(t.session_history().match(/\*\*\* SUMMARY \*\*\*/g).length,2);
  t.state();t.state();assert.equal(t.completed_histories.length,1);
  t.new_hand();assert.equal(t.completed_histories.length,2);
});
test('incomplete or inconsistent session saves are rejected',()=>{
  const t=new Trainer(300,40);t.new_hand();finish(t);
  for(const field of ['completed_histories','hand_timestamp']){
    const saved=copy(t);delete saved.trainer[field];assert.throws(()=>Trainer.restore(saved));
  }
  const missingEvents=copy(t);delete missingEvents.trainer.hand.history;
  assert.throws(()=>Trainer.restore(missingEvents));
  const wrongCount=copy(t);wrongCount.trainer.hand_number=169;
  assert.throws(()=>Trainer.restore(wrongCount));
});
test('reset clears history, current hand, scores and saved progress while preserving preferences',()=>{
  const t=new Trainer(100,40);t.new_hand('mixed');finish(t);t.new_hand();
  t.hints=true;
  const state=t.reset_session();
  assert.equal(state.started,false);assert.equal(state.hand_number,0);
  assert.deepEqual(state.stats,{decisions:0,correct:0,accuracy:null,hinted:0});
  assert.equal(state.stack_mode,'mixed');assert.equal(state.hints,true);
  assert.equal(t.session_history(),'');assert.deepEqual(t.feedback,[]);assert.equal(t.pending,null);
  const restored=Trainer.restore(copy(t));assert.equal(restored.session_history(),'');
  restored.new_hand();assert.equal(restored.hand_number,1);assert.equal(restored.state().history_count,1);
});
