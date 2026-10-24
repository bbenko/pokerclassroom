'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Trainer}=require('../engine.js');
const {parseHistory,summarize,createSessionReader}=require('../performance.js');
const fixture=(id,actions,{blind='1.00',done=true,dealt=true}={})=>[
  `Poker Classroom Hand #${id}: Hold'em No Limit ($0.50/$${blind} USD) - 2026/10/24 00:00:00 UTC`,
  "Table 'Poker Classroom Simulation' 6-max Seat #1 is the button",
  ...(dealt?['*** HOLE CARDS ***','Dealt to You [As Kd]']:[]),...actions,
  ...(done?['*** SUMMARY ***','Total pot $10.00 | Rake $0.00','Seat 1: You collected ($10.00)']:[])
].join('\n')+'\n';
function finish(t){for(let n=0;!t.hand.done&&n<200;n++)t.act(t.hand.legal().check?'check':'call');assert.ok(t.hand.done);}
const copy=t=>JSON.parse(JSON.stringify(t.snapshot()));

test('normalizes mixed stakes per hand, including losses and measured zero',()=>{
  const p=summarize([
    fixture(1,['You: calls $1.00','You collected $3.00 from pot']), // +2 BB
    fixture(2,['You: calls $2.00'],{blind:'2.00'}), // -1 BB
    fixture(3,['You: calls $0.50','You collected $0.50 from pot'],{blind:'0.50'})
  ]);
  assert.equal(p.count,3);assert.equal(p.netBB,1);assert.equal(p.winRate,100/3);
  assert.equal(p.vpip,100);assert.equal(p.pfr,0);
});
test('blind-only hands, antes, checks and walks are not voluntary preflop investment',()=>{
  const p=summarize([
    fixture(1,['You: posts small blind $0.50','You: posts the ante $0.10','You: folds']),
    fixture(2,['You: posts big blind $1.00','Uncalled bet ($0.50) returned to You','You collected $1.00 from pot']),
    fixture(3,['You: posts big blind $1.00','You: checks','*** FLOP *** [Ac 2d 3h]','You: bets $2.00','You: raises $2.00 to $6.00','You: folds'])
  ]);
  assert.equal(p.count,3);assert.equal(p.vpip,0);assert.equal(p.pfr,0);
  assert.equal(p.netBB,-7.1);
});
test('limps, blind completions and short all-in calls count once for VPIP',()=>{
  const p=summarize([
    fixture(1,['You: calls $1.00','You: calls $2.00','You: folds']),
    fixture(2,['You: posts small blind $0.50','You: calls $0.50','You: folds']),
    fixture(3,['You: posts big blind $1.00','You: calls $0.25 and is all-in'])
  ]);
  assert.equal(p.vpipHands,3);assert.equal(p.vpip,100);assert.equal(p.pfr,0);
});
test('repeated preflop raises count one PFR; raise-to amounts and returns balance',()=>{
  const p=parseHistory(fixture(1,[
    'You: posts small blind $0.50','You: calls $0.50','You: raises $3.00 to $6.00',
    'You: raises $10.00 to $20.00 and is all-in','Uncalled bet ($10.00) returned to You',
    'You collected $8.00 from main pot','You collected $5.00 from side pot-1'
  ]));
  assert.equal(p.netBB,3);assert.equal(p.vpip,true);assert.equal(p.pfr,true);
  const totals=summarize([fixture(2,['You: raises $2.00 to $3.00','You: raises $6.00 to $12.00'])]);
  assert.equal(totals.vpipHands,1);assert.equal(totals.pfrHands,1);
});
test('street contributions reset, split/side pots are summed, payouts are already net of rake',()=>{
  const hand=fixture(1,[
    'You: posts big blind $1.00','You: calls $2.00','*** FLOP *** [Ac 2d 3h]',
    'You: bets $4.00','You: raises $8.00 to $12.00','*** TURN *** [Ac 2d 3h] [4s]',
    'You: checks','*** RIVER *** [Ac 2d 3h 4s] [5c]','You: calls $5.00',
    'You collected $10.00 from main pot','You collected $9.00 from side pot-1'
  ]).replace('Rake $0.00','Rake $1.00');
  assert.equal(parseHistory(hand).netBB,-1); // 19 paid out - (3 + 12 + 5)
  assert.equal(parseHistory(hand).pfr,false);
});
test('unfinished and undealt hands are excluded; no data differs from measured zero',()=>{
  const empty=summarize([
    fixture(1,['You: raises $2.00 to $3.00'],{done:false}),
    fixture(2,['You collected $1.00 from pot'],{dealt:false})
  ]);
  for(const key of ['netBB','winRate','vpip','pfr'])assert.equal(empty[key],null);
  assert.equal(empty.count,0);assert.equal(empty.unreadable,0);
  const zero=summarize([fixture(3,['You: checks'])]);
  for(const key of ['netBB','winRate','vpip','pfr'])assert.equal(zero[key],0);
});
test('duplicate identities count once; invalid histories are reported without losing valid data',()=>{
  const hand=fixture(1,['You: calls $1.00']);
  const p=summarize([hand,hand,'broken history',fixture(2,[],{blind:'0.00'}),fixture(3,['You: unsupported action'])]);
  assert.equal(p.count,1);assert.equal(p.netBB,-1);assert.equal(p.duplicates,1);assert.equal(p.unreadable,3);
});
test('saved legacy Classroom history prefix and CRLF line endings remain readable',()=>{
  const legacy=fs.readFileSync(path.join(__dirname,'fixtures/hand-000196.txt'),'utf8');
  const hand=parseHistory(legacy.replaceAll('\n','\r\n'));
  assert.equal(hand.netBB,-100);assert.equal(hand.vpip,true);assert.equal(hand.pfr,true);
});
test('session reader agrees with settled engine stacks/events across archives, reloads and resets',()=>{
  let t=new Trainer(9182,40),read=createSessionReader(),netBB=0,vpip=0,pfr=0;
  assert.equal(read(t).count,0);
  for(let i=0;i<16;i++){
    t.new_hand(i%2?'mixed':'equal');
    if(!t.hand.done)assert.equal(read(t).count,i);
    finish(t);
    netBB+=(t.hand.players[0].stack-t.hand.starting_stacks[0])/2;
    const events=t.hand.history.filter(e=>e.actor===0&&e.street===0);
    vpip+=Number(events.some(e=>['call','raise'].includes(e.kind)&&e.amount>0));
    pfr+=Number(events.some(e=>e.kind==='raise'));
    const expected={count:i+1,netBB,vpipHands:vpip,pfrHands:pfr};
    for(const [key,value] of Object.entries(expected))assert.equal(read(t)[key],value,key);
    assert.deepEqual(read(t),read(t));
    const restored=Trainer.restore(copy(t));
    assert.deepEqual(createSessionReader()(restored),read(t));
    t=restored;
  }
  t.hints=true;t.reset_session();
  assert.equal(read(t).count,0);assert.equal(read(t).netBB,null);
  t.new_hand();finish(t);assert.equal(read(t).count,1);
});
test('worker attaches performance on init, actions, state, deal, restored save and reset',()=>{
  const t=new Trainer(42,40);t.new_hand();finish(t);
  const context=vm.createContext({postMessage:message=>context.reply=message});
  context.self=context;
  context.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../game-worker.js'),'utf8'),context);
  let id=0;
  const send=(route,body={})=>{
    context.onmessage({data:{id:++id,path:route,body}});
    assert.equal(context.reply.error,undefined);
    return context.reply;
  };
  const init=send('init',{saved:copy(t)});
  assert.equal(init.state.performance.count,1);
  assert.equal(init.state.performance.netBB,t.state().profit);
  assert.equal(send('state').state.performance.count,1);
  let message=send('new');
  for(let n=0;!message.state.done&&n<200;n++){
    assert.equal(message.state.performance.count,1);
    message=send('action',{action:message.state.legal.check?'check':'call'});
  }
  assert.equal(message.state.performance.count,2);
  const reloaded=send('init',{saved:JSON.parse(JSON.stringify(message.saved))});
  assert.equal(reloaded.state.performance.count,2);
  assert.equal(send('reset').state.performance.netBB,null);
  assert.equal(send('state').state.performance.count,0);
});
